import { apiUrl } from "./apiConfig.js";

const DIAGNOSIS_ENDPOINT = "/ai/resumes/diagnose";

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      ...options,
    });
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException("诊断请求已取消", "AbortError");
    throw new Error("无法连接简历诊断接口，请确认 Spring Boot 后端已启动。", { cause: error });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 404) {
      throw new Error("AI诊断接口不存在：POST /api/ai/resumes/diagnose。");
    }
    throw new Error(formatDiagnosisError(text, response.status));
  }

  return response.json();
}

function formatDiagnosisError(text, status) {
  if (!text) return `简历诊断接口请求失败：HTTP ${status}`;
  try {
    const payload = JSON.parse(text);
    if (payload.message) return payload.message;
    if (payload.error && status >= 500) return "AI诊断服务暂时失败，请确认后端已重启并且模型配置正确。";
    if (payload.error) return `${payload.error}（HTTP ${status}）`;
  } catch {
    // Keep the fallback below for non-JSON server responses.
  }
  return status >= 500
    ? "AI诊断服务暂时失败，请确认后端已重启并且模型配置正确。"
    : text;
}

export async function diagnoseResume(payload, options = {}) {
  return requestJson(DIAGNOSIS_ENDPOINT, {
    method: "POST",
    body: JSON.stringify(payload),
    signal: options.signal,
  });
}

export async function askDiagnosisQuestion(diagnosisId, payload, options = {}) {
  if (!diagnosisId) throw new Error("缺少 diagnosisId，无法继续基于诊断报告追问。");
  return requestJson(`/ai/resumes/diagnoses/${encodeURIComponent(diagnosisId)}/chat`, {
    method: "POST",
    body: JSON.stringify(payload),
    signal: options.signal,
  });
}
