import { apiUrl } from "./apiConfig.js";

const RESUME_CHAT_ID_KEY = "guangqi-resume-chat-id";
const RESUME_CHAT_SSE_PATH = "/ai/resume_app/chat/sse";
const RESUME_CHAT_JSON_PATH = "/ai/resume_app/chat";

const modeLabels = {
  chat: "简历与求职咨询",
  generate: "简历生成",
  diagnose: "简历诊断",
  optimize: "简历优化",
};

function getResumeChatId() {
  const current = window.sessionStorage.getItem(RESUME_CHAT_ID_KEY);
  if (current) return current;

  const next = window.crypto?.randomUUID?.() ?? `resume-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(RESUME_CHAT_ID_KEY, next);
  return next;
}

function buildResumeMessage({ mode, message, jd, files, resumes }) {
  const parts = [`当前模式：${modeLabels[mode] ?? modeLabels.chat}`];

  if (message?.trim()) {
    parts.push(`用户输入：${message.trim()}`);
  }

  if (jd?.trim()) {
    parts.push(`目标岗位JD：\n${jd.trim()}`);
  }

  if (resumes?.length) {
    parts.push(`用户已上传并由后端解析的简历文件：${resumes.map((resume) => resume.fileName).join("、")}。请基于后端提供的解析正文回答，不要只根据文件名判断。`);
  } else if (files?.length) {
    parts.push(`用户已上传简历文件：${files.map((file) => file.name).join("、")}。如果本次请求没有解析正文，请提示用户重新上传可解析文件。`);
  }

  return parts.join("\n\n");
}

function parseSseEventText(eventText) {
  const lines = eventText.split(/\r?\n/);
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""));

  if (dataLines.length === 0) return "";

  const data = dataLines.join("\n");
  return data && data !== "[DONE]" ? data : "";
}

async function readSseText(response, onChunk) {
  if (!response.body) {
    const text = await response.text();
    if (text && onChunk) await onChunk(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const chunks = [];
  let buffer = "";

  async function emitEvent(eventText) {
    const data = parseSseEventText(eventText);
    if (!data) return;
    chunks.push(data);
    if (onChunk) await onChunk(data);
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const eventText of events) {
      await emitEvent(eventText);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const finalEvent = parseSseEventText(buffer);
    if (finalEvent) {
      chunks.push(finalEvent);
      if (onChunk) await onChunk(finalEvent);
    } else if (chunks.length === 0) {
      const rawText = buffer.trim();
      chunks.push(rawText);
      if (onChunk) await onChunk(rawText);
    }
  }

  return chunks.length ? chunks.join("") : buffer.trim();
}

async function readErrorMessage(response) {
  const text = await response.text().catch(() => "");
  if (!text) return `AI 服务请求失败（HTTP ${response.status}），请检查后端接口。`;
  try {
    const data = JSON.parse(text);
    return data?.message || data?.error || text;
  } catch {
    return text;
  }
}

export async function sendResumeAssistantMessage({ mode, message, jd, files = [], resumes = [], onChunk }) {
  const url = new URL(apiUrl(RESUME_CHAT_SSE_PATH), window.location.origin);
  const resumeIds = resumes.map((resume) => resume.id ?? resume.resumeId).filter(Boolean);
  url.searchParams.set("message", buildResumeMessage({ mode, message, jd, files, resumes }));
  url.searchParams.set("chatId", getResumeChatId());
  if (resumeIds.length) {
    url.searchParams.set("resumeIds", resumeIds.join(","));
  }

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
      },
    });
  } catch {
    throw new Error("无法连接后端 AI 服务，请确认 Spring Boot 已在 8321 端口启动。");
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const reply = (await readSseText(response, onChunk)).trim();
  if (!reply) {
    throw new Error("AI 服务没有返回内容，请稍后重试。");
  }

  return reply;
}

export async function sendResumeAssistantJsonMessage({ mode, message, jd, files = [], resumes = [] }) {
  const resumeIds = resumes.map((resume) => resume.id ?? resume.resumeId).filter(Boolean);
  const payload = {
    mode,
    message: buildResumeMessage({ mode, message, jd, files, resumes }),
    jd: jd?.trim() || "",
    chatId: getResumeChatId(),
    resumeIds,
  };

  let response;
  try {
    response = await fetch(apiUrl(RESUME_CHAT_JSON_PATH), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("无法连接后端 AI 服务，请确认 Spring Boot 已在 8321 端口启动。");
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("AI 服务返回格式不是有效 JSON，请检查后端接口。");
  }

  const reply = String(data?.reply ?? "").trim();
  if (!reply) {
    throw new Error("AI 服务没有返回内容，请稍后重试。");
  }

  return reply;
}
