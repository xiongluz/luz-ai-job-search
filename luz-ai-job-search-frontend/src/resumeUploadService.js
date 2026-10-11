import { apiUrl } from "./apiConfig.js";

export const RESUME_UPLOAD_SESSION_KEY = "guangqi-session-resume-uploads";
export const LAST_UPLOADED_RESUME_KEY = "guangqi-last-uploaded-resume-id";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["pdf", "application/pdf"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
]);

export function validateResumeFile(file) {
  if (!file) return "请选择需要上传的简历文件。";

  const extension = getFileExtension(file.name);
  const expectedType = ALLOWED_TYPES.get(extension);

  if (!expectedType) return "仅支持 PDF、DOC、DOCX 格式的简历文件。";

  if (file.type && file.type !== expectedType) {
    return "文件类型与后缀不匹配，请上传真实的 PDF、DOC 或 DOCX 文件。";
  }

  if (file.size > MAX_FILE_SIZE) return "文件大小不能超过 10MB。";

  return "";
}

export function createResumeRecord(fileName, file, uploadResult = {}) {
  const extension = getFileExtension(fileName).toUpperCase();
  return {
    id: uploadResult.resumeId ?? `resume_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    fileName: uploadResult.fileName ?? fileName,
    fileType: uploadResult.fileType ?? extension,
    fileSize: uploadResult.fileSize ?? file.size,
    status: uploadResult.status ?? "uploaded",
    uploadedAt: uploadResult.uploadedAt ?? new Date().toISOString(),
    source: uploadResult.source ?? "backend-parsed",
    textLength: uploadResult.textLength ?? null,
    profile: uploadResult.profile ?? null,
  };
}

export function getSessionResumeUploads() {
  try {
    const saved = window.sessionStorage.getItem(RESUME_UPLOAD_SESSION_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessionResumeUploads(resumes) {
  window.sessionStorage.setItem(RESUME_UPLOAD_SESSION_KEY, JSON.stringify(resumes));
}

export async function uploadResumeFile(file, { onProgress, onParsing, signal } = {}) {
  const validationError = validateResumeFile(file);
  if (validationError) throw new Error(validationError);

  for (const progress of [18, 36, 58, 76]) {
    if (signal?.aborted) throw new DOMException("上传已取消", "AbortError");
    await wait(80);
    onProgress?.(progress);
  }

  const formData = new FormData();
  formData.append("file", file);
  onParsing?.();

  let response;
  try {
    response = await fetch(apiUrl("/resumes/upload"), {
      method: "POST",
      body: formData,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new DOMException("上传已取消", "AbortError");
    throw new Error("无法连接简历上传接口，请确认 Spring Boot 后端已启动。", { cause: error });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `简历上传失败：HTTP ${response.status}`);
  }

  const result = await response.json();
  onProgress?.(100);
  return result;
}

export function formatFileSize(size) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function createRenamedFileName(fileName, existingNames) {
  const extension = getFileExtension(fileName);
  const baseName = fileName.slice(0, fileName.length - extension.length - 1);
  let index = 2;
  let nextName = `${baseName} (${index}).${extension}`;
  const nameSet = new Set(existingNames.map((name) => name.toLowerCase()));
  while (nameSet.has(nextName.toLowerCase())) {
    index += 1;
    nextName = `${baseName} (${index}).${extension}`;
  }
  return nextName;
}

function getFileExtension(fileName) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
