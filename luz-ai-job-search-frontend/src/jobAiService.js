import { apiUrl } from "./apiConfig.js";

const AI_JOB_ENDPOINTS = {
  parse: "/ai/jobs/parse",
  match: "/ai/jobs/match",
  batchMatch: "/ai/jobs/batch-match",
  advice: "/ai/jobs/resume-advice",
  suggestions: "/ai/jobs/field-suggestions",
  jdImageParse: "/ai/jobs/jd-image/parse",
};
const DIAGNOSIS_ENDPOINT = "/ai/resumes/diagnoses";
const RESUME_CHAT_ENDPOINT = "/ai/resume_app/chat";

const JOB_SAVE_ENDPOINTS = {
  CAMPUS: "/jobs/campus",
  INTERNSHIP: "/jobs/internships",
};

function normalizeError(status, endpoint = "") {
  if (status === 400) return "请求参数不完整，请补充岗位信息后重试。";
  if (status === 401) return "AI服务鉴权失败，请检查后端环境变量配置。";
  if (status === 403) return "当前模型或业务空间没有权限，请检查后端百炼配置。";
  if (status === 404 && endpoint.includes("/ai/jobs/match")) {
    return "AI岗位匹配接口尚未接入，请先启动或实现 Spring Boot /api/ai/jobs/match。";
  }
  if (status === 404) return "后端接口尚未接入，当前只能保存本地草稿。";
  if (status === 429) return "AI请求过于频繁或额度不足，请稍后重试。";
  if (status >= 500) return "AI服务暂时不可用，请稍后重试。";
  return "请求失败，请稍后重试。";
}

async function postJson(endpoint, payload, { signal } = {}) {
  let response;
  try {
    response = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("已取消本次分析。");
    }
    throw new Error("无法连接后端服务，请确认 Spring Boot 已启动。");
  }

  if (!response.ok) {
    const error = new Error(normalizeError(response.status, endpoint));
    error.status = response.status;
    error.endpoint = endpoint;
    throw error;
  }

  try {
    return await response.json();
  } catch {
    throw new Error("后端返回格式不是有效JSON。");
  }
}

async function postJsonWithMeta(endpoint, payload, { signal } = {}) {
  try {
    const data = await postJson(endpoint, payload, { signal });
    return { data, status: 200 };
  } catch (error) {
    error.status = error.status ?? error.responseStatus;
    error.endpoint = endpoint;
    throw error;
  }
}

async function postFormData(endpoint, formData, { signal } = {}) {
  let response;
  try {
    response = await fetch(apiUrl(endpoint), {
      method: "POST",
      body: formData,
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("已取消本次识别。");
    }
    throw new Error("无法连接后端图片识别接口，请确认 Spring Boot 已启动。");
  }

  if (!response.ok) {
    const error = new Error(normalizeError(response.status, endpoint));
    error.status = response.status;
    error.endpoint = endpoint;
    throw error;
  }

  try {
    return await response.json();
  } catch {
    throw new Error("后端返回格式不是有效JSON。");
  }
}

async function fetchDiagnosisReport(diagnosisId, signal) {
  if (!diagnosisId) return null;
  const response = await fetch(apiUrl(`${DIAGNOSIS_ENDPOINT}/${encodeURIComponent(diagnosisId)}`), {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractJsonObject(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const unwrapped = trimmed.startsWith("```")
    ? trimmed.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/u, "").trim()
    : trimmed;
  const start = unwrapped.indexOf("{");
  const end = unwrapped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(unwrapped.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function requestAdviceViaSharedChat(payload, options = {}) {
  const diagnosisReport = await fetchDiagnosisReport(payload.diagnosisId, options.signal);
  const prompt = [
    "请你基于以下诊断报告和简历优化目标，生成一份严格 JSON 的简历优化方案。",
    "不要输出 Markdown，不要输出代码块，不要编造经历、数字或成果。",
    "只给出可执行的优化任务、原因和改写建议。",
    `请求体：${JSON.stringify({
      resumeId: payload.resumeId ?? null,
      resumeName: payload.resumeName ?? null,
      diagnosisId: payload.diagnosisId ?? null,
      issueId: payload.issueId ?? null,
      jobId: payload.jobId ?? null,
      jobType: payload.jobType ?? null,
      targetRole: payload.targetRole ?? null,
      targetCompany: payload.targetCompany ?? null,
      jobDescription: payload.jobDescription ?? null,
    })}`,
    diagnosisReport ? `诊断报告JSON：${JSON.stringify(diagnosisReport)}` : "诊断报告JSON：未获取到",
    "请输出包含 title、summary、summaryPoints、keywords、tasks、warnings、persisted、modelShared、source、createdAt、disclaimer 的 JSON 对象。",
  ].join("\n\n");

  const response = await postJson(RESUME_CHAT_ENDPOINT, {
    mode: "optimize",
    message: prompt,
    jd: payload.jobDescription ?? "",
    chatId: payload.resumeId ? `opt-${payload.resumeId}` : undefined,
  }, { signal: options.signal });

  const parsed = extractJsonObject(response.reply);
  if (!parsed) {
    throw new Error("聊天模型未返回可解析的优化JSON。");
  }

  return {
    ...parsed,
    source: "openai-compatible-shared-model",
    modelShared: true,
  };
}

export function parseJobDescription(payload, options) {
  return postJson(AI_JOB_ENDPOINTS.parse, payload, options);
}

export function analyzeJobMatch(payload, options) {
  return postJson(AI_JOB_ENDPOINTS.match, payload, options);
}

export function analyzeJobBatchMatch(payload, options) {
  return postJson(AI_JOB_ENDPOINTS.batchMatch, payload, options);
}

export function requestResumeAdvice(payload, options) {
  return postJsonWithMeta(AI_JOB_ENDPOINTS.advice, payload, options)
    .then(({ data }) => data)
    .catch(async (error) => {
      if (error?.status === 404 || error?.message?.includes("尚未接入")) {
        return requestAdviceViaSharedChat(payload, options);
      }
      throw error;
    });
}

export function requestFieldSuggestions(payload, options) {
  return postJson(AI_JOB_ENDPOINTS.suggestions, payload, options);
}

export function parseJdImage(file, options) {
  const formData = new FormData();
  formData.append("file", file);
  return postFormData(AI_JOB_ENDPOINTS.jdImageParse, formData, options);
}

export async function saveJobRecord(jobType, payload, id) {
  const base = JOB_SAVE_ENDPOINTS[jobType];
  if (!base) {
    throw new Error("未知岗位类型，无法保存。");
  }

  const endpoint = id ? `${base}/${encodeURIComponent(id)}` : base;
  let response;
  try {
    response = await fetch(apiUrl(endpoint), {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("无法连接岗位保存接口。");
  }

  if (!response.ok) {
    throw new Error(normalizeError(response.status, endpoint));
  }

  return response.json();
}
