import { apiUrl } from "./apiConfig.js";

const JOB_MATCH_RESUME_MAX_SIZE = 5 * 1024 * 1024;
const JOB_MATCH_RESUME_TYPES = new Map([
  ["pdf", "application/pdf"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function extractGraduationYear(value) {
  const match = cleanString(value).match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function toBooleanOrUndefined(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function splitFilterList(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => splitFilterList(item));
  }
  const text = cleanString(value);
  if (!text) return [];
  return text
    .split(/[,，、\n\r\t]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFileExtension(fileName) {
  return cleanString(fileName).split(".").pop()?.toLowerCase() ?? "";
}

function normalizeErrorMessage(payload, fallback) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (payload && typeof payload === "object") {
    return cleanString(payload.message || payload.error || payload.detail || fallback) || fallback;
  }
  return fallback;
}

function normalizeJobType(jobType) {
  return jobType === "CAMPUS" || jobType === "INTERNSHIP" ? jobType : "";
}

async function parseResponse(response, fallbackMessage) {
  const text = await response.text().catch(() => "");
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const error = new Error(normalizeErrorMessage(payload, fallbackMessage));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  if (payload == null || payload === "") return {};
  return payload;
}

async function requestJson(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(apiUrl(path), {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    },
    body,
    signal,
  });

  return parseResponse(response, "岗位匹配接口请求失败");
}

export function validateJobMatchResumeFile(file) {
  if (!file) return "请选择简历文件。";

  const extension = getFileExtension(file.name);
  const expectedType = JOB_MATCH_RESUME_TYPES.get(extension);
  if (!expectedType) return "仅支持 PDF、DOC、DOCX 格式的简历文件。";

  if (file.type && file.type !== expectedType) {
    return "文件类型与后缀不匹配，请上传真实的 PDF、DOC 或 DOCX 文件。";
  }

  if (file.size > JOB_MATCH_RESUME_MAX_SIZE) {
    return "简历文件大小不能超过 5MB。";
  }

  return "";
}

export async function uploadJobMatchResumeFile(file, { signal } = {}) {
  const validationError = validateJobMatchResumeFile(file);
  if (validationError) throw new Error(validationError);

  const formData = new FormData();
  formData.append("file", file);

  return requestJson("/job-matches/resumes", {
    method: "POST",
    body: formData,
    signal,
  });
}

export async function createJobMatchSession(payload, { signal } = {}) {
  return requestJson("/job-matches/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}

export async function getJobMatchProgress(sessionId, { signal } = {}) {
  if (!sessionId) throw new Error("sessionId 不能为空");
  return requestJson(`/job-matches/sessions/${encodeURIComponent(sessionId)}/progress`, { signal });
}

export async function getJobMatchResults(sessionId, { signal } = {}) {
  if (!sessionId) throw new Error("sessionId 不能为空");
  return requestJson(`/job-matches/sessions/${encodeURIComponent(sessionId)}/results`, { signal });
}

export async function getJobMatchBatch(payload = {}, { signal } = {}) {
  return requestJson("/job-match/batch", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}

export async function getJobMatchNextBatch(sessionId, { signal } = {}) {
  if (!sessionId) throw new Error("sessionId 不能为空");
  return requestJson(`/job-matches/sessions/${encodeURIComponent(sessionId)}/next-batch`, {
    method: "POST",
    signal,
  });
}

export async function rematchJobMatchSession(sessionId, payload = {}, { signal } = {}) {
  if (!sessionId) throw new Error("sessionId 不能为空");
  return requestJson(`/job-matches/sessions/${encodeURIComponent(sessionId)}/rematch`, {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}

export async function reserveJobMatchPosition(positionId, sessionId, { signal } = {}) {
  if (!positionId) throw new Error("positionId 不能为空");
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  return requestJson(`/job-matches/positions/${encodeURIComponent(positionId)}/reserve${query}`, {
    method: "POST",
    signal,
  });
}

export async function cancelJobMatchReservation(positionId, { signal } = {}) {
  if (!positionId) throw new Error("positionId 不能为空");
  return requestJson(`/job-matches/positions/${encodeURIComponent(positionId)}/reserve`, {
    method: "DELETE",
    signal,
  });
}

export async function getJobMatchReservedPositions({ signal } = {}) {
  return requestJson("/job-matches/reserved", { signal });
}

export function buildJobMatchFilters(draft = {}, jobType = "") {
  const filters = {};
  const lockedJobType = normalizeJobType(jobType);
  if (!lockedJobType) {
    throw new Error("岗位匹配入口类型无效，已阻止创建 session");
  }
  const addList = (key, value) => {
    const list = splitFilterList(value);
    if (list.length > 0) filters[key] = list.map((item) => String(item).trim()).filter(Boolean);
  };

  addList("cities", draft.cities ?? draft.city);
  addList("recruitmentBatches", draft.recruitmentBatches ?? draft.recruitmentBatch ?? draft.batch);
  addList("companyTypes", draft.companyTypes ?? draft.companyType);
  addList("jobCategories", draft.targetRoles ?? draft.jobCategories ?? draft.targetRole);
  addList("industries", draft.industries ?? draft.industry);
  addList("educationLevels", draft.educationLevels ?? draft.education);
  addList("majors", draft.majors ?? draft.major);
  const jobId = cleanString(draft.jobId);
  if (jobId) filters.jobIds = [jobId];
  filters.recruitmentTypes = [lockedJobType];

  const graduationYear = extractGraduationYear(draft.graduationYears ?? draft.graduationYear ?? draft.graduation);
  if (graduationYear) filters.graduationYears = [graduationYear];

  addList("keywords", draft.keywords);

  const acceptWrittenTest = toBooleanOrUndefined(draft.acceptWrittenTest);
  if (acceptWrittenTest !== undefined) filters.acceptWrittenTest = acceptWrittenTest;

  const acceptRelatedJobs = toBooleanOrUndefined(draft.acceptRelatedJobs);
  if (acceptRelatedJobs !== undefined) filters.acceptRelatedJobs = acceptRelatedJobs;

  filters.activeOnly = draft.onlyUnexpired === false || draft.activeOnly === false ? false : true;

  return filters;
}

export function buildJobMatchSessionPayload({ resumeId, draft = {}, excludeSeen = true, jobType = "" } = {}) {
  return {
    resumeId,
    excludeSeen,
    jobId: cleanString(draft.jobId),
    filters: buildJobMatchFilters(draft, jobType),
  };
}
