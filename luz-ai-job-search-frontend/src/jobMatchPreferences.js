const JOB_MATCH_PREFERENCE_KEY_PREFIX = "guangqi-job-match-preferences";
const JOB_MATCH_LEGACY_KEY = "guangqi-job-match-preferences";

function isValidJobType(jobType) {
  return jobType === "CAMPUS" || jobType === "INTERNSHIP";
}

function resolveJobType(jobType) {
  return isValidJobType(jobType) ? jobType : null;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  const text = String(value ?? "").trim();
  return text ? [text] : [];
}

function normalizeBoolean(value, fallback = true) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

function safeReadStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function safeRemoveStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

function normalizePreferenceType(value, fallback = "CAMPUS") {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === "CAMPUS" || text === "INTERNSHIP") return text;
  return fallback;
}

function readRecognizedPreferenceType(value) {
  const text = String(value ?? "").trim().toUpperCase();
  return text === "CAMPUS" || text === "INTERNSHIP" ? text : "";
}

function normalizeDraftShape(draft = {}) {
  return {
    jobId: String(draft.jobId ?? "").trim(),
    targetRoles: normalizeList(draft.targetRoles ?? draft.targetRole),
    cities: normalizeList(draft.cities ?? draft.city),
    graduation: String(draft.graduation ?? "").trim(),
    resumeId: String(draft.resumeId ?? "").trim(),
    recruitmentType: normalizePreferenceType(draft.recruitmentType, "CAMPUS"),
    recruitmentBatch: String(draft.recruitmentBatch ?? draft.batch ?? "").trim(),
    companyType: String(draft.companyType ?? "").trim(),
    industry: String(draft.industry ?? "").trim(),
    education: String(draft.education ?? "").trim(),
    acceptWrittenTest: String(draft.acceptWrittenTest ?? "").trim(),
    acceptRelatedJobs: String(draft.acceptRelatedJobs ?? "").trim(),
    onlyUnexpired: normalizeBoolean(draft.onlyUnexpired, true),
    keywords: String(draft.keywords ?? "").trim(),
  };
}

function isPreferenceForJobType(draft, jobType) {
  return readRecognizedPreferenceType(draft?.recruitmentType) === jobType;
}

function migrateLegacyPreferences(jobType) {
  const saved = safeReadStorage(JOB_MATCH_LEGACY_KEY);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      const matched = parsed.find((item) => isPreferenceForJobType(item, jobType));
      return matched ? normalizeJobMatchPreferenceDraft(matched, jobType) : null;
    }
    if (parsed && typeof parsed === "object" && isPreferenceForJobType(parsed, jobType)) {
      return normalizeJobMatchPreferenceDraft(parsed, jobType);
    }
  } catch {
    return null;
  }
  return null;
}

export function getJobMatchPreferenceStorageKey(jobType) {
  const resolved = resolveJobType(jobType);
  return resolved ? `${JOB_MATCH_PREFERENCE_KEY_PREFIX}-${resolved}` : "";
}

export function getDefaultJobMatchPreferenceDraft(jobType) {
  const resolved = resolveJobType(jobType);
  if (!resolved) {
    console.error("[job-match] invalid jobType while creating default preferences", jobType);
    return {
      jobId: "",
      targetRoles: [],
      cities: [],
      graduation: "",
      resumeId: "",
      recruitmentType: "",
      recruitmentBatch: "",
      companyType: "",
      industry: "",
      education: "",
      acceptWrittenTest: "",
      acceptRelatedJobs: "",
      onlyUnexpired: true,
      keywords: "",
    };
  }
  return {
    jobId: "",
    targetRoles: [],
    cities: [],
    graduation: "",
    resumeId: "",
    recruitmentType: resolved,
    recruitmentBatch: "",
    companyType: "",
    industry: "",
    education: "",
    acceptWrittenTest: "",
    acceptRelatedJobs: "",
    onlyUnexpired: true,
    keywords: "",
  };
}

export function normalizeJobMatchPreferenceDraft(draft = {}, jobType) {
  const resolved = resolveJobType(jobType);
  if (!resolved) {
    console.error("[job-match] invalid jobType while normalizing preferences", jobType);
    return getDefaultJobMatchPreferenceDraft(jobType);
  }
  const base = getDefaultJobMatchPreferenceDraft(resolved);
  const normalized = {
    ...base,
    ...normalizeDraftShape(draft),
    resumeId: String(draft.resumeId ?? "").trim(),
    recruitmentType: resolveJobType(draft.recruitmentType) ?? resolved,
  };

  if (normalized.recruitmentType !== resolved) {
    normalized.recruitmentType = resolved;
  }

  return normalized;
}

export function loadJobMatchPreferences(jobType) {
  const resolved = resolveJobType(jobType);
  if (!resolved) return null;

  const storageKey = getJobMatchPreferenceStorageKey(resolved);
  const saved = safeReadStorage(storageKey);
  if (saved) {
    try {
      return normalizeJobMatchPreferenceDraft(JSON.parse(saved), resolved);
    } catch {
      return getDefaultJobMatchPreferenceDraft(resolved);
    }
  }

  const migrated = migrateLegacyPreferences(resolved);
  if (migrated) {
    safeWriteStorage(storageKey, JSON.stringify(migrated));
    return migrated;
  }

  return getDefaultJobMatchPreferenceDraft(resolved);
}

export function saveJobMatchPreferences(jobType, draft) {
  const resolved = resolveJobType(jobType);
  if (!resolved) return false;
  const storageKey = getJobMatchPreferenceStorageKey(resolved);
  const normalized = normalizeJobMatchPreferenceDraft(draft, resolved);
  safeWriteStorage(storageKey, JSON.stringify(normalized));
  return true;
}

export function clearJobMatchPreferences(jobType) {
  const resolved = resolveJobType(jobType);
  if (!resolved) return false;
  safeRemoveStorage(getJobMatchPreferenceStorageKey(resolved));
  return true;
}

export function buildJobMatchPreferenceLabels(draft = {}) {
  const labels = [];
  if (draft.graduation) labels.push(draft.graduation);
  if (draft.recruitmentType) {
    const map = { CAMPUS: "校招", INTERNSHIP: "实习", REGULAR: "社招" };
    labels.push(map[draft.recruitmentType] ?? draft.recruitmentType);
  }
  if (draft.onlyUnexpired !== false) labels.push("只看未截止岗位");
  if (Array.isArray(draft.cities) && draft.cities.length > 0) labels.push(...draft.cities.slice(0, 2));
  if (draft.recruitmentBatch) labels.push(draft.recruitmentBatch);
  if (draft.companyType) labels.push(draft.companyType);
  return Array.from(new Set(labels.filter(Boolean)));
}
