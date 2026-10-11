import React, { useEffect, useMemo, useRef, useState } from "react";
import { diagnoseResume } from "./resumeDiagnosisService.js";
import { formatFileSize, LAST_UPLOADED_RESUME_KEY } from "./resumeUploadService.js";

const DIAGNOSIS_DRAFT_KEY = "guangqi-careerai-resume-diagnosis-draft";
const DIAGNOSIS_REPORT_CACHE_PREFIX = "guangqi-careerai-diagnosis-report:";
const OPTIMIZATION_HANDOFF_KEY = "guangqi-careerai-diagnosis-to-optimization";
const JD_LIMIT = 2000;

const COVERAGE_ITEMS = [
  { key: "structure", label: "结构完整度" },
  { key: "experience", label: "教育/经历" },
  { key: "keywords", label: "技能关键词" },
  { key: "achievements", label: "成果量化" },
  { key: "jobMatch", label: "岗位匹配度" },
];

const READY_COVERAGE_ITEMS = [
  ...COVERAGE_ITEMS,
  { key: "clarity", label: "表达清晰度" },
];

const DIAGNOSIS_STEPS = [
  "正在解析简历",
  "正在检查结构完整度",
  "正在分析经历表达",
  "正在提取技能与成果证据",
  "正在生成诊断报告",
];

const DIAGNOSIS_STAGE_PROGRESS = [20, 40, 55, 72, 90];

const SCORE_LEVELS = [
  { min: 90, label: "卓越", tone: "great" },
  { min: 80, label: "优秀", tone: "good" },
  { min: 70, label: "良好", tone: "middle" },
  { min: 60, label: "一般", tone: "warn" },
  { min: 50, label: "需要优化", tone: "warn" },
  { min: 40, label: "较弱", tone: "danger" },
  { min: 0, label: "建议重点重写", tone: "danger" },
];

const DIMENSION_WEIGHTS = {
  structure: 0.2,
  experience: 0.3,
  keywords: 0.2,
  achievements: 0.2,
  jobMatch: 0.1,
};

const DIMENSION_CONFIG = [
  {
    key: "structure",
    label: "结构完整度",
    aliases: ["structure", "completeness", "contentCompleteness", "moduleCompleteness"],
  },
  {
    key: "experience",
    label: "教育/经历",
    aliases: ["experience", "relevance", "educationExperience", "experienceQuality", "clarity"],
  },
  {
    key: "keywords",
    label: "技能关键词",
    aliases: ["keywords", "keywordCoverage", "skills", "skillKeywords"],
  },
  {
    key: "achievements",
    label: "成果量化",
    aliases: ["achievements", "achievementImpact", "quantification", "evidenceDensity"],
  },
  {
    key: "jobMatch",
    label: "岗位匹配度",
    aliases: ["jobMatch", "jobFit", "positionMatch", "targetMatch"],
  },
];

function getScoreMeta(score, informationSufficient = true) {
  if (!informationSufficient || score === null || score === undefined || score === "") {
    return { label: "未评分", tone: "insufficient" };
  }
  const value = Number(score);
  if (!Number.isFinite(value)) return { label: "未评分", tone: "insufficient" };
  return SCORE_LEVELS.find((item) => value >= item.min) ?? SCORE_LEVELS[SCORE_LEVELS.length - 1];
}

function formatPenaltyLabel(item) {
  return `${item.label}：${item.value}`;
}

function normalizeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function readDimensionValue(dimensions = {}, aliases = []) {
  for (const key of aliases) {
    const value = normalizeScore(dimensions[key]);
    if (value !== null) return value;
  }
  return null;
}

function buildDimensionRows(report, hasJd) {
  const dimensions = report?.dimensions ?? {};
  return DIMENSION_CONFIG.map((item) => {
    if (item.key === "jobMatch" && !hasJd) {
      return {
        ...item,
        value: null,
        note: "添加目标岗位 JD 后可获得岗位匹配分析。",
      };
    }
    return {
      ...item,
      value: readDimensionValue(dimensions, item.aliases),
      note: null,
    };
  });
}

function calculateOverallScore(raw, dimensions, hasJd) {
  return calibrateDiagnosisScore(raw, dimensions, hasJd).finalScore;
}

function calculateWeightedBaseScore(raw, dimensions, hasJd) {
  const rows = DIMENSION_CONFIG
    .filter((item) => hasJd || item.key !== "jobMatch")
    .map((item) => ({ key: item.key, value: readDimensionValue(dimensions, item.aliases) }))
    .filter((item) => item.value !== null);

  if (!rows.length) {
    const direct = normalizeScore(raw?.overallScore ?? raw?.score);
    return direct;
  }

  const totalWeight = rows.reduce((sum, item) => sum + DIMENSION_WEIGHTS[item.key], 0);
  if (!totalWeight) return null;
  return Math.round(rows.reduce((sum, item) => sum + item.value * DIMENSION_WEIGHTS[item.key], 0) / totalWeight);
}

function textIncludesAny(text, keywords) {
  const value = String(text ?? "").toLowerCase();
  return keywords.some((keyword) => value.includes(keyword.toLowerCase()));
}

function collectDiagnosisText(raw) {
  return [
    raw?.summary,
    ...(normalizeList(raw?.strengths)),
    ...(normalizeList(raw?.tags)),
    ...(normalizeList(raw?.issues).map((issue, index) => [
      getIssueTitle(issue, index),
      getIssueDescription(issue),
      getIssueSuggestion(issue),
      getIssueDimension(issue),
    ].join(" "))),
    ...(normalizeList(raw?.recommendations).map((item) => [
      item?.title,
      item?.reason,
      item?.priority,
      item?.level,
      typeof item === "string" ? item : "",
    ].join(" "))),
    ...(normalizeList(raw?.details).map((item) => [
      item?.name,
      item?.currentPerformance,
      ...(normalizeList(item?.issues)),
      ...(normalizeList(item?.suggestions)),
    ].join(" "))),
  ].filter(Boolean).join(" ");
}

function addPenalty(penalties, key, label, value) {
  if (penalties.some((item) => item.key === key)) return;
  penalties.push({ key, label, value });
}

function calibrateDiagnosisScore(raw, dimensions, hasJd) {
  if (!raw || raw.informationSufficient === false) {
    return { baseScore: null, penalties: [], cap: null, finalScore: null };
  }

  const baseScore = calculateWeightedBaseScore(raw, dimensions, hasJd);
  if (baseScore === null) return { baseScore: null, penalties: [], cap: null, finalScore: null };

  const penalties = [];
  const statistics = raw.statistics ?? {};
  const coreMetrics = raw.coreMetrics ?? {};
  const textLength = Number(statistics.textLength ?? raw.textLength ?? 0);
  const educationCount = Number(statistics.educationCount ?? 0);
  const experienceCount = Number(statistics.experienceCount ?? 0);
  const projectCount = Number(statistics.projectCount ?? 0);
  const quantifiedAchievementCount = Number(statistics.quantifiedAchievementCount ?? 0);
  const structure = readDimensionValue(dimensions, DIMENSION_CONFIG.find((item) => item.key === "structure").aliases);
  const experience = readDimensionValue(dimensions, DIMENSION_CONFIG.find((item) => item.key === "experience").aliases);
  const keywords = readDimensionValue(dimensions, DIMENSION_CONFIG.find((item) => item.key === "keywords").aliases);
  const achievements = readDimensionValue(dimensions, DIMENSION_CONFIG.find((item) => item.key === "achievements").aliases);
  const jobMatch = hasJd ? readDimensionValue(dimensions, DIMENSION_CONFIG.find((item) => item.key === "jobMatch").aliases) : null;
  const evidenceDensity = normalizeScore(coreMetrics.evidenceDensity);
  const readiness = normalizeScore(coreMetrics.applicationReadiness);
  const diagnosisText = collectDiagnosisText(raw);

  if (textLength > 0 && textLength < 650 && educationCount + experienceCount + projectCount <= 2) {
    addPenalty(penalties, "content_too_thin", "鍐呭鏄庢樉涓嶈冻", 16);
  } else if (textLength > 0 && textLength < 1100 && educationCount + experienceCount + projectCount <= 3) {
    addPenalty(penalties, "content_thin", "鏈夋晥淇℃伅鍋忓皯", 9);
  }

  if (educationCount === 0 || textIncludesAny(diagnosisText, ["鏁欒偛妯″潡涓虹┖", "鏁欒偛鑳屾櫙缂哄け", "缂哄皯鏁欒偛", "瀛﹀巻缂哄け"])) {
    addPenalty(penalties, "education_missing", "鏁欒偛鑳屾櫙淇℃伅涓嶈冻", 8);
  } else if (textIncludesAny(diagnosisText, ["鍙湁瀛︽牎", "缂哄皯涓撲笟", "缂哄皯瀛﹀巻", "姣曚笟鏃堕棿缂哄け"])) {
    addPenalty(penalties, "education_incomplete", "教育核心字段不完整", 5);
  }

  if (experienceCount === 0 && projectCount === 0) {
    addPenalty(penalties, "experience_missing", "缂哄皯鏍稿績缁忓巻鍐呭", 14);
  } else if (experience !== null && experience < 60) {
    addPenalty(penalties, "experience_weak", "经历描述竞争力不足", experience < 45 ? 10 : 6);
  }

  if (achievements !== null && achievements < 55) {
    addPenalty(penalties, "achievement_weak", "鎴愭灉璇佹嵁涓嶈冻", achievements < 40 ? 9 : 6);
  } else if (quantifiedAchievementCount === 0 && (experienceCount > 0 || projectCount > 0)) {
    addPenalty(penalties, "achievement_no_evidence", "缂哄皯鐪熷疄鎴愭灉璇佹嵁", 6);
  }

  if (keywords !== null && keywords < 55) {
    addPenalty(penalties, "keyword_weak", "鎶€鑳藉叧閿瘝瑕嗙洊涓嶈冻", keywords < 40 ? 8 : 5);
  }

  if (hasJd && jobMatch !== null && jobMatch < 60) {
    addPenalty(penalties, "job_match_weak", "岗位匹配度不足", jobMatch < 45 ? 8 : 5);
  }

  if (textIncludesAny(diagnosisText, ["求职方向不明确", "求职意向不明确", "目标岗位不明确", "求职方向过于宽泛", "意向过于宽泛"])) {
    addPenalty(penalties, "target_unclear", "求职方向不够明确", hasJd ? 7 : 5);
  }

  if (textIncludesAny(diagnosisText, ["联系方式缺失", "缺少联系方式", "电话缺失", "邮箱缺失"])) {
    addPenalty(penalties, "contact_missing", "核心联系方式缺失", 6);
  }

  if (textIncludesAny(diagnosisText, ["时间线冲突", "时间线混乱", "时间倒置", "时间异常"])) {
    addPenalty(penalties, "timeline_conflict", "时间线存在明显问题", 9);
  }

  if (readiness !== null && readiness < 55) {
    addPenalty(penalties, "readiness_low", "鎶曢€掑噯澶囧害涓嶈冻", readiness < 40 ? 8 : 5);
  }

  const penaltyTotal = penalties.reduce((sum, item) => sum + item.value, 0);
  let cap = 100;
  const missingCoreModules = [educationCount === 0, experienceCount === 0, projectCount === 0, keywords !== null && keywords < 40].filter(Boolean).length;
  if (penalties.some((item) => item.key === "content_too_thin")) cap = Math.min(cap, 45);
  if (missingCoreModules >= 3) cap = Math.min(cap, 55);
  if (penalties.some((item) => item.key === "experience_missing")) cap = Math.min(cap, 65);
  if (penalties.some((item) => item.key === "target_unclear") && hasJd) cap = Math.min(cap, 65);
  if (penalties.some((item) => ["achievement_weak", "achievement_no_evidence"].includes(item.key))) cap = Math.min(cap, 72);
  if (penalties.some((item) => item.key === "timeline_conflict")) cap = Math.min(cap, 60);
  if (baseScore < 80 || penaltyTotal >= 6 || quantifiedAchievementCount === 0) cap = Math.min(cap, 79);
  if (baseScore < 88 || penaltyTotal >= 3 || quantifiedAchievementCount < 2) cap = Math.min(cap, 89);

  const finalScore = Math.max(0, Math.min(100, cap, Math.round(baseScore - penaltyTotal)));
  return { baseScore, penalties, cap, finalScore };
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(repairReportText);
  if (typeof value === "string") return value.split(/\n|锛泑;/).map((item) => repairReportText(item.trim())).filter(Boolean);
  return [];
}

function repairReportText(value) {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.map(repairReportText).filter(Boolean).join("、");
    const candidate = value.text ?? value.content ?? value.value ?? value.title ?? value.label ?? value.description ?? value.reason;
    return candidate != null ? repairReportText(candidate) : "";
  }
  const text = String(value ?? "");
  if (!/[闂绔鍏璇瀹鐨锛�]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return repaired.includes("�") ? text : repaired;
  } catch {
    return text;
  }
}

function getIssueTitle(issue, index) {
  if (typeof issue === "string") return repairReportText(issue);
  return repairReportText(issue?.title ?? issue?.name ?? issue?.problem ?? issue?.label ?? `问题 ${index + 1}`);
}

function getIssueDescription(issue) {
  if (typeof issue === "string") return repairReportText(issue);
  return repairReportText(issue?.description ?? issue?.whyImportant ?? issue?.reason ?? issue?.currentPerformance ?? "当前诊断结果提示这一项会影响简历呈现质量。");
}

function getIssueSuggestion(issue) {
  return repairReportText(issue?.suggestion ?? issue?.advice ?? issue?.recommendation ?? issue?.action ?? "建议结合真实经历补充职责、方法、工具和可验证成果，避免编造数字。");
}

function getIssueDimension(issue) {
  if (typeof issue === "string") return "综合质量";
  return repairReportText(issue?.dimension ?? issue?.impactDimension ?? issue?.category ?? issue?.type ?? "综合质量");
}

function getIssuePriorityValue(issue, index) {
  if (typeof issue === "string") return 10 + index;
  const priorityText = String(issue?.priority ?? issue?.level ?? issue?.severity ?? "").toLowerCase();
  if (priorityText.includes("high") || priorityText.includes("高") || priorityText.includes("重要")) return 0;
  if (priorityText.includes("medium") || priorityText.includes("中")) return 1;
  if (priorityText.includes("low") || priorityText.includes("低")) return 2;
  const score = Number(issue?.score ?? issue?.impactScore);
  if (Number.isFinite(score)) return 100 - score;
  return 10 + index;
}

function buildIssues(report) {
  const issues = normalizeList(report?.issues);
  const priority = report?.priorityIssue ? [report.priorityIssue] : [];
  const merged = [...priority, ...issues].filter(Boolean);
  const seen = new Set();
  return merged
    .filter((issue, index) => {
      const key = `${getIssueTitle(issue, index)}-${getIssueDimension(issue)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => getIssuePriorityValue(a, 0) - getIssuePriorityValue(b, 0));
}

function buildOverview(report) {
  const lines = [
    ...normalizeList(report?.summary).slice(0, 1),
    ...normalizeList(report?.strengths).slice(0, 1).map((item) => `优势：${item}`),
    ...normalizeList(report?.recommendations)
      .slice(0, 2)
      .map((item) => item?.title ?? item?.reason ?? item)
      .filter(Boolean),
  ];
  if (report?.priorityIssue?.title) lines.push(`优先处理：${report.priorityIssue.title}`);
  const compact = lines.map((item) => String(item).trim()).filter(Boolean);
  return compact.length ? compact.slice(0, 3).map(repairReportText).filter(Boolean) : ["诊断已完成，请优先查看右侧关键问题并进入优化。"];
}

function shortenText(value, maxLength = 120) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function getResumeKey(resume) {
  if (!resume) return "";
  return [
    resume.id,
    resume.fileName,
    resume.fileType,
    resume.fileSize,
    resume.textLength,
    resume.uploadedAt,
  ].join("|");
}

function getJdKey(jd) {
  return jd.trim();
}

function normalizeReport(raw, fallback = {}) {
  if (!raw) return null;
  const dimensions = raw.dimensions ?? raw.dimensionScores ?? {};
  const hasJd = Boolean(fallback.jobDescription);
  const calibration = calibrateDiagnosisScore(raw, dimensions, hasJd);
  const overallScore = calibration.finalScore ?? calculateOverallScore(raw, dimensions, hasJd);
  const informationSufficient = raw.informationSufficient !== false;
  const scoreMeta = getScoreMeta(overallScore, informationSufficient);

  return {
    diagnosisId: raw.id ?? raw.diagnosisId ?? fallback.requestId,
    resumeId: raw.resumeId ?? fallback.resumeId,
    resumeName: raw.resumeName ?? fallback.resumeName,
    diagnosisType: raw.diagnosisType ?? fallback.diagnosisType,
    jobType: raw.jobType ?? fallback.jobType,
    jobId: raw.jobId ?? fallback.jobId,
    targetJobName: raw.targetJobName ?? fallback.targetJobName,
    jobDescription: fallback.jobDescription,
    createdAt: raw.createdAt ?? raw.diagnosisTime ?? new Date().toISOString(),
    persisted: Boolean(raw.persisted ?? raw.savedToDatabase),
    informationSufficient,
    overallScore,
    calibration,
    level: raw.level ?? scoreMeta.label,
    tone: scoreMeta.tone,
    summary: raw.summary ?? "",
    tags: raw.tags ?? raw.labels ?? [],
    statistics: raw.statistics ?? {},
    coreMetrics: raw.coreMetrics ?? {},
    dimensions,
    strengths: raw.strengths ?? [],
    issues: raw.issues ?? [],
    priorityIssue: raw.priorityIssue ?? raw.highestPriorityIssue ?? null,
    recommendations: raw.recommendations ?? [],
    details: raw.details ?? raw.dimensionDetails ?? [],
    disclaimer: raw.disclaimer ?? "AI辅助评估，仅供参考，不作为正式结论。",
  };
}

function saveDiagnosisDraft(payload) {
  try {
    window.sessionStorage.setItem(DIAGNOSIS_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage may be unavailable in private browsing; diagnosis still works without cache.
  }
}

export default function ResumeDiagnosisWorkspace({
  navigate,
  onExit,
  uploadedResumes,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  inputRef,
  onAddFiles,
  uploadError,
  attachments,
  onRemoveAttachment,
}) {
  const abortRef = useRef(null);
  const activeRequestRef = useRef(null);
  const currentSessionRef = useRef({ resumeKey: "", jdKey: "" });
  const latestUploadedResumeIdRef = useRef(uploadedResumes[0]?.id ?? "");
  const resultPanelRef = useRef(null);
  const workspaceRef = useRef(null);
  const leftPanelRef = useRef(null);
  const userScrolledDuringDiagnosisRef = useRef(false);

  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [manualJd, setManualJd] = useState("");
  const [status, setStatus] = useState("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [showAllIssues, setShowAllIssues] = useState(false);
  const progressTimerRef = useRef(null);
  const activeProgressLabel = DIAGNOSIS_STEPS[Math.min(stepIndex, DIAGNOSIS_STEPS.length - 1)] ?? DIAGNOSIS_STEPS[0];

  const selectedResume = uploadedResumes.find((resume) => String(resume.id) === String(selectedResumeId)) ?? null;
  const resumeKey = getResumeKey(selectedResume);
  const jdKey = getJdKey(manualJd);
  const hasJd = Boolean(jdKey);
  const diagnosisType = hasJd ? "TARGETED" : "GENERAL";
  const canStart = Boolean(selectedResume) && status !== "running";
  const attachmentsRunning = attachments?.some((item) => {
    const statusText = String(item.status ?? "").toLowerCase();
    const stillProcessing = ["queued", "uploading", "parsing", "pending"].includes(statusText)
      || statusText.includes("涓婁紶")
      || statusText.includes("瑙ｆ瀽")
      || statusText.includes("绛夊緟");
    return stillProcessing && !selectedResume;
  }) ?? false;
  const reportIsValid = Boolean(report && report.resumeSessionKey === resumeKey && report.jdSessionKey === jdKey);
  const visibleReport = reportIsValid ? report : null;
  const stepStatus = getTopStepStatus({ selectedResume, hasJd, status, visibleReport });

  useEffect(() => {
    currentSessionRef.current = { resumeKey, jdKey };
  }, [resumeKey, jdKey]);

  useEffect(() => {
    if (!selectedResume || status === "running") return;
    const cachedReport = loadDiagnosisReport(resumeKey, jdKey);
    if (!cachedReport || cachedReport.resumeSessionKey !== resumeKey || cachedReport.jdSessionKey !== jdKey) return;
    setReport(cachedReport);
    setStatus("done");
    setStepIndex(DIAGNOSIS_STEPS.length - 1);
    setProgressPercent(100);
    setError("");
  }, [selectedResume, resumeKey, jdKey]);

  useEffect(() => {
    const appMain = document.querySelector(".app-main");
    const diagnosisPage = workspaceRef.current?.closest(".ai-resume-page.has-diagnosis-workspace");
    diagnosisPage?.scrollTo?.({ top: 0, behavior: "auto" });
    if (diagnosisPage) diagnosisPage.scrollTop = 0;
    if (appMain) appMain.scrollTop = 0;
    const scrollingElement = document.scrollingElement || document.documentElement;
    if (scrollingElement) scrollingElement.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const latestResumeId = uploadedResumes[0]?.id ?? "";
    if (!latestResumeId || latestResumeId === latestUploadedResumeIdRef.current) return;
    latestUploadedResumeIdRef.current = latestResumeId;
    resetDiagnosisSession();
    setSelectedResumeId(latestResumeId);
    window.sessionStorage.setItem(LAST_UPLOADED_RESUME_KEY, latestResumeId);
  }, [uploadedResumes]);

  useEffect(() => {
    if (selectedResumeId && !uploadedResumes.some((resume) => String(resume.id) === String(selectedResumeId))) {
      resetDiagnosisSession();
      setSelectedResumeId("");
      window.sessionStorage.removeItem(LAST_UPLOADED_RESUME_KEY);
    }
  }, [selectedResumeId, uploadedResumes]);

  useEffect(() => {
    if (!report || reportIsValid) return;
    if (!selectedResume) return;
    setReport(null);
    setStatus((current) => current === "running" ? current : "idle");
    setShowAllIssues(false);
  }, [report, reportIsValid, selectedResume]);

  useEffect(() => {
    if (status !== "running") return;
    const request = activeRequestRef.current;
    if (!request) return;
    if (request.resumeKey !== resumeKey || request.jdKey !== jdKey) {
      abortRef.current?.abort();
      activeRequestRef.current = null;
      setStatus("idle");
      setStepIndex(0);
      setError("");
      setProgressPercent(0);
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      return;
    }
    applyStageProgress(stepIndex);
  }, [resumeKey, jdKey, status, stepIndex]);

  useEffect(() => {
    if (status !== "running") return;
    if (progressPercent >= 90) {
      setStepIndex((current) => Math.max(current, 4));
    } else if (progressPercent >= 72) {
      setStepIndex((current) => Math.max(current, 3));
    } else if (progressPercent >= 55) {
      setStepIndex((current) => Math.max(current, 2));
    } else if (progressPercent >= 40) {
      setStepIndex((current) => Math.max(current, 1));
    }
  }, [progressPercent, status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (status !== "running") return undefined;
    userScrolledDuringDiagnosisRef.current = false;
    const markUserScroll = () => {
      userScrolledDuringDiagnosisRef.current = true;
    };
    const options = { passive: true, capture: true };
    window.addEventListener("wheel", markUserScroll, options);
    window.addEventListener("touchmove", markUserScroll, options);
    return () => {
      window.removeEventListener("wheel", markUserScroll, options);
      window.removeEventListener("touchmove", markUserScroll, options);
    };
  }, [status]);

  function resetDiagnosisSession() {
    abortRef.current?.abort();
    activeRequestRef.current = null;
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setReport(null);
    setStatus("idle");
    setStepIndex(0);
    setProgressPercent(0);
    setError("");
    setShowAllIssues(false);
  }

  function openResumePicker() {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  function handleFileInputChange(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    resetDiagnosisSession();
    onAddFiles?.(files);
    event.target.value = "";
  }

  function handleRemoveCurrentResume() {
    resetDiagnosisSession();
    setSelectedResumeId("");
    window.sessionStorage.removeItem(LAST_UPLOADED_RESUME_KEY);
  }

  function handleSelectUploadedResume(resumeRecord) {
    if (!resumeRecord?.id) return;
    resetDiagnosisSession();
    setSelectedResumeId(String(resumeRecord.id));
    window.sessionStorage.setItem(LAST_UPLOADED_RESUME_KEY, String(resumeRecord.id));
  }

  function handleJdChange(event) {
    const nextValue = event.target.value.slice(0, JD_LIMIT);
    setManualJd(nextValue);
    if (status === "running") {
      abortRef.current?.abort();
      activeRequestRef.current = null;
      setStatus("idle");
      setStepIndex(0);
      setProgressPercent(0);
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }
    if (visibleReport && getJdKey(nextValue) !== jdKey) {
      setReport(null);
      setStatus("idle");
      setShowAllIssues(false);
    }
  }

  function getScrollTargets() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    return [
      { key: "window", element: window, getTop: () => window.scrollY, setTop: (top) => window.scrollTo({ top, behavior: "auto" }) },
      { key: "documentElement", element: document.documentElement, getTop: () => document.documentElement.scrollTop, setTop: (top) => { document.documentElement.scrollTop = top; } },
      { key: "scrollingElement", element: scrollingElement, getTop: () => scrollingElement?.scrollTop ?? 0, setTop: (top) => { if (scrollingElement) scrollingElement.scrollTop = top; } },
      { key: "appMain", element: document.querySelector(".app-main"), getTop: (element) => element?.scrollTop ?? 0, setTop: (top, element) => { if (element) element.scrollTop = top; } },
      { key: "workspace", element: workspaceRef.current, getTop: (element) => element?.scrollTop ?? 0, setTop: (top, element) => { if (element) element.scrollTop = top; } },
      { key: "resultPanel", element: resultPanelRef.current, getTop: (element) => element?.scrollTop ?? 0, setTop: (top, element) => { if (element) element.scrollTop = top; } },
    ].filter((target) => target.element);
  }

  function captureScrollSnapshot(label) {
    const targets = getScrollTargets().map((target) => ({
      key: target.key,
      top: target.getTop(target.element),
      canScroll: target.element === window
        ? document.documentElement.scrollHeight > window.innerHeight
        : target.element.scrollHeight > target.element.clientHeight,
      target,
    }));
    return {
      label,
      userScrolled: userScrolledDuringDiagnosisRef.current,
      targets,
      windowScrollY: window.scrollY,
      documentScrollTop: document.documentElement.scrollTop,
      scrollingElementTop: document.scrollingElement?.scrollTop ?? null,
      appMainTop: document.querySelector(".app-main")?.scrollTop ?? null,
      resultPanelTop: resultPanelRef.current?.scrollTop ?? null,
      workspaceTop: workspaceRef.current?.getBoundingClientRect().top ?? null,
      titleTop: document.querySelector(".diagnosis-title-line h1")?.getBoundingClientRect().top ?? null,
      stepsTop: document.querySelector(".diagnosis-top-steps")?.getBoundingClientRect().top ?? null,
      leftTop: leftPanelRef.current?.getBoundingClientRect().top ?? null,
      rightTop: resultPanelRef.current?.getBoundingClientRect().top ?? null,
    };
  }

  function restoreScrollSnapshot(snapshot) {
    if (userScrolledDuringDiagnosisRef.current || snapshot.userScrolled) return;
    snapshot.targets.forEach((entry) => {
      const currentTop = entry.target.getTop(entry.target.element);
      if (Math.abs(currentTop - entry.top) > 5) {
        entry.target.setTop(entry.top, entry.target.element);
      }
    });
  }

  function preserveScrollPosition(label, mutate) {
    const before = captureScrollSnapshot(label);
    mutate();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        restoreScrollSnapshot(before);
        console.info("[resume-diagnosis:layout]", {
          label,
          before,
          after: captureScrollSnapshot(`${label}:after`),
        });
      });
    });
  }

  function applyStageProgress(stageIndex) {
    const next = DIAGNOSIS_STAGE_PROGRESS[Math.min(stageIndex, DIAGNOSIS_STAGE_PROGRESS.length - 1)] ?? 0;
    setStepIndex((current) => Math.max(current, Math.min(stageIndex, DIAGNOSIS_STEPS.length - 1)));
    setProgressPercent((current) => Math.max(current, next));
  }

  function startProgressPulse(targetPercent = 85) {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    progressTimerRef.current = window.setInterval(() => {
      setProgressPercent((current) => {
        if (current >= targetPercent) return current;
        const remaining = targetPercent - current;
        const step = remaining > 20 ? 4 : remaining > 10 ? 2 : 1;
        return Math.min(targetPercent, current + step);
      });
    }, 520);
  }

  async function startDiagnosis({ force = false } = {}) {
    if (!selectedResume || status === "running") return;
    if (visibleReport && !force) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    const requestId = window.crypto?.randomUUID?.() ?? `diagnosis-${Date.now()}`;
    const lockedResumeKey = getResumeKey(selectedResume);
    const lockedJdKey = getJdKey(manualJd);
    const lockedDiagnosisType = lockedJdKey ? "TARGETED" : "GENERAL";
    const targetDescription = lockedJdKey || null;
    activeRequestRef.current = { requestId, resumeKey: lockedResumeKey, jdKey: lockedJdKey };
    abortRef.current = controller;
    const diagnosisStartedAt = performance.now();

    preserveScrollPosition("diagnosis-start", () => {
      setStatus("running");
      setStepIndex(0);
      setProgressPercent(20);
      setError("");
      setReport(null);
      setShowAllIssues(false);
    });
    applyStageProgress(1);
    startProgressPulse(85);

    const fallback = {
      requestId,
      resumeId: selectedResume.id,
      resumeName: selectedResume.fileName,
      diagnosisType: lockedDiagnosisType,
      jobType: lockedJdKey ? "CUSTOM" : null,
      jobId: lockedJdKey ? "manual-jd" : null,
      targetJobName: lockedJdKey ? "鎵嬪姩绮樿创JD" : "閫氱敤璇婃柇",
      jobDescription: targetDescription,
    };

    try {
      const requestStartedAt = performance.now();
      const raw = await diagnoseResume({
        resumeId: selectedResume.id,
        resumeName: selectedResume.fileName,
        diagnosisType: lockedDiagnosisType,
        jobType: fallback.jobType,
        jobId: fallback.jobId,
        jobDescription: targetDescription,
        requestId,
      }, { signal: controller.signal });

      const latestSession = currentSessionRef.current;
      const stillCurrent = activeRequestRef.current?.requestId === requestId
        && latestSession.resumeKey === lockedResumeKey
        && latestSession.jdKey === lockedJdKey;
      if (!stillCurrent || controller.signal.aborted) return;

      applyStageProgress(3);
      const normalizeStartedAt = performance.now();
      applyStageProgress(4);
      const nextReport = {
        ...normalizeReport(raw, fallback),
        resumeSessionKey: lockedResumeKey,
        jdSessionKey: lockedJdKey,
      };
      saveDiagnosisReport(lockedResumeKey, lockedJdKey, nextReport);
      const normalizeEndedAt = performance.now();
      setProgressPercent((current) => Math.max(current, 95));
      preserveScrollPosition("diagnosis-success", () => {
        setReport(nextReport);
        setStatus("done");
        setStepIndex(DIAGNOSIS_STEPS.length - 1);
        setProgressPercent(100);
      });
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      console.info("[resume-diagnosis:timing]", {
        requestId,
        resumeName: selectedResume.fileName,
        fileSize: selectedResume.fileSize,
        resumeTextLength: selectedResume.textLength,
        hasJd: Boolean(lockedJdKey),
        jdLength: lockedJdKey.length,
        aiRequestMs: Math.round(performance.now() - requestStartedAt),
        normalizeMs: Math.round(normalizeEndedAt - normalizeStartedAt),
        totalMs: Math.round(performance.now() - diagnosisStartedAt),
      });
    } catch (nextError) {
      if (controller.signal.aborted) return;
      if (activeRequestRef.current?.requestId !== requestId) return;
      preserveScrollPosition("diagnosis-failed", () => {
        setStatus("failed");
        setReport(null);
        setError(nextError.message || "AI诊断失败，请稍后重试。");
        setProgressPercent(0);
      });
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      console.info("[resume-diagnosis:timing]", {
        requestId,
        resumeName: selectedResume.fileName,
        fileSize: selectedResume.fileSize,
        resumeTextLength: selectedResume.textLength,
        hasJd: Boolean(lockedJdKey),
        jdLength: lockedJdKey.length,
        failed: true,
        totalMs: Math.round(performance.now() - diagnosisStartedAt),
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (activeRequestRef.current?.requestId === requestId) activeRequestRef.current = null;
    }
  }

  function goOptimize(issue = null) {
    if (!visibleReport || !selectedResume) return;
    const handoff = {
      resumeId: selectedResume.id,
      resumeName: selectedResume.fileName,
      diagnosisId: visibleReport.diagnosisId,
      jd: manualJd.trim(),
      issue,
      report: visibleReport,
      sourceLabel: "简历诊断报告",
      createdAt: new Date().toISOString(),
    };
    saveDiagnosisDraft({
      selectedResumeId,
      manualJd,
      status: "done",
      report: visibleReport,
      resumeSessionKey: resumeKey,
      jdSessionKey: jdKey,
    });
    try {
      window.sessionStorage.setItem(OPTIMIZATION_HANDOFF_KEY, JSON.stringify(handoff));
    } catch {
      // The optimize page can still receive the essential ids through query params.
    }

    const params = new URLSearchParams({
      mode: "optimize",
      resumeId: selectedResume.id,
      diagnosisId: visibleReport.diagnosisId ?? "local-diagnosis",
    });
    const issueId = issue?.id ?? issue?.title ?? issue?.name;
    if (issueId) params.set("issueId", String(issueId));
    navigate?.(`/dashboard?${params.toString()}`);
  }

  return (
    <section className="diagnosis-workspace diagnosis-workspace-v2" aria-label="简历诊断工作区" ref={workspaceRef}>
      <div className="diagnosis-page-head">
        <div>
          <div className="diagnosis-title-line">
            <h1>AI简历诊断</h1>
            <span>高效精准</span>
          </div>
          <p>上传简历，AI智能诊断并提供针对性优化建议，帮你快速提升竞争力</p>
        </div>
        {onExit && (
          <div className="diagnosis-head-actions">
            <button type="button" className="diagnosis-exit-button" onClick={onExit}>
              退出诊断
            </button>
          </div>
        )}
      </div>

      <div className="diagnosis-layout-grid">
        <div className="diagnosis-shell-left">
          <div className="diagnosis-left" ref={leftPanelRef}>
            <header className="diagnosis-assistant-head">
              <div>
                <span className="ai-title-avatar" aria-hidden="true">律</span>
                <div>
                  <strong>小律 · 简历诊断助手</strong>
                  <small>我会帮你找出简历中的关键问题，并提供可执行的优化建议。</small>
                </div>
              </div>
            </header>

            <div className="diagnosis-top-steps" aria-label="诊断流程">
              <StepPill index="1" title="上传简历" desc="支持 PDF / DOC / DOCX" status={stepStatus.upload} />
              <StepPill index="2" title="可选添加岗位JD" desc="更精准匹配目标岗位" status={stepStatus.jd} />
              <StepPill index="3" title="一键开始诊断" desc="生成诊断报告与建议" status={stepStatus.result} />
            </div>

            <div className="diagnosis-left-scroll">
              <section className="diagnosis-card diagnosis-upload-card">
                <div className="diagnosis-section-title">
                  <div>
                    <h3>1. 上传你的简历</h3>
                    <p>支持 PDF / DOC / DOCX，文件大小不超过 10MB。</p>
                  </div>
                </div>

                <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={handleFileInputChange} />
                {selectedResume ? (
                  <div className="diagnosis-selected-file">
                    <div>
                      <strong title={selectedResume.fileName}>{selectedResume.fileName}</strong>
                      <span>{selectedResume.fileType} · {formatFileSize(selectedResume.fileSize)}</span>
                      <small>{selectedResume.textLength ? `已解析 · ${selectedResume.textLength} 字符` : "等待解析"}</small>
                    </div>
                    <div className="diagnosis-selected-file-actions">
                      <button type="button" onClick={openResumePicker}>更换</button>
                      <button type="button" className="ghost" onClick={handleRemoveCurrentResume}>移除</button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`diagnosis-upload-zone ${isDragging ? "dragging" : ""}`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                  >
                    <div className="diagnosis-upload-icon" aria-hidden="true">↑</div>
                    <strong>拖拽或上传简历</strong>
                    <p>支持 PDF / DOC / DOCX 格式，文件不超过 10MB</p>
                    <button type="button" onClick={openResumePicker}>选择文件上传</button>
                  </div>
                )}

                {!selectedResume && attachments?.length > 0 ? (
                  <div className="diagnosis-upload-list">
                    {attachments.map((item) => (
                      <div key={item.id} className="diagnosis-upload-item">
                        <button
                          type="button"
                          className="diagnosis-upload-item-select"
                          onClick={() => handleSelectUploadedResume(item.resumeRecord)}
                          disabled={!item.resumeRecord?.id}
                          aria-label={`选择${item.file.name}作为当前简历`}
                        >
                          <span>{item.file.name}</span>
                          <small>{item.status} · {item.progress ?? 0}%</small>
                        </button>
                        <button type="button" onClick={() => onRemoveAttachment?.(item.id)}>移除</button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {uploadError ? <p className="diagnosis-error">{uploadError}</p> : null}
                <p className="diagnosis-privacy">上传的简历仅用于本次分析与当前产品功能处理。</p>
              </section>

              <section className="diagnosis-card diagnosis-jd-card">
                <div className="diagnosis-section-title">
                  <div>
                    <h3>2. 目标岗位 JD（可选）</h3>
                    <p>添加岗位描述后，AI可以判断简历与目标岗位的匹配程度。</p>
                  </div>
                </div>
                <div className="diagnosis-jd-input-shell">
                  <textarea
                    value={manualJd}
                    onChange={handleJdChange}
                    maxLength={JD_LIMIT}
                    placeholder="将岗位JD描述复制粘贴到这里"
                  />
                  <span>{hasJd ? "将自动执行带岗位匹配的诊断" : "未填写时自动执行通用诊断"}</span>
                </div>
              </section>

              <section className="diagnosis-card diagnosis-coverage-card">
                <h3>诊断重点覆盖</h3>
                <div className="diagnosis-coverage-grid">
                  {COVERAGE_ITEMS.map((item) => <span key={item.key}>{item.label}</span>)}
                </div>
              </section>

              <button
                className="diagnosis-start-button"
                type="button"
                disabled={!canStart || attachmentsRunning}
                onClick={() => startDiagnosis({ force: true })}
              >
                {status === "running" ? `AI诊断中 · ${progressPercent}%` : "✦ 开始诊断"}
              </button>
              {!selectedResume ? <p className="diagnosis-inline-tip">请先上传或选择一份简历。</p> : null}
              {error ? <p className="diagnosis-error">{error}</p> : null}
            </div>
          </div>
        </div>

        <div className="diagnosis-right" ref={resultPanelRef}>
          {status === "running" ? (
            <DiagnosisLoadingPanel
              stepIndex={stepIndex}
              progressPercent={progressPercent}
              diagnosisType={diagnosisType}
            />
          ) : visibleReport ? (
            <DiagnosisReportPanel
              report={visibleReport}
              hasJd={hasJd}
              dimensionRows={buildDimensionRows(visibleReport, hasJd)}
              issues={buildIssues(visibleReport)}
              overview={buildOverview(visibleReport)}
              showAllIssues={showAllIssues}
              onToggleIssues={() => setShowAllIssues((current) => !current)}
              onOptimize={goOptimize}
              onReDiagnose={() => startDiagnosis({ force: true })}
              onReUpload={openResumePicker}
            />
          ) : (
            <DiagnosisReadyPanel selectedResume={selectedResume} hasJd={hasJd} error={status === "failed" ? error : ""} />
          )}
        </div>
      </div>
    </section>
  );
}

function getTopStepStatus({ selectedResume, hasJd, status, visibleReport }) {
  return {
    upload: selectedResume ? "done" : "active",
    jd: hasJd ? "done" : selectedResume ? "active" : "idle",
    result: status === "running" ? "active" : visibleReport ? "done" : "idle",
  };
}

function StepPill({ index, title, desc, status }) {
  return (
    <div className={`diagnosis-step-pill ${status}`}>
      <span>{index}</span>
      <div>
        <strong>{title}</strong>
        <small>{desc}</small>
      </div>
    </div>
  );
}

function DiagnosisLoadingPanel({ stepIndex, progressPercent, diagnosisType }) {
  const stageLabel = DIAGNOSIS_STEPS[Math.min(stepIndex, DIAGNOSIS_STEPS.length - 1)] ?? DIAGNOSIS_STEPS[0];
  const visibleProgress = Math.max(0, Math.min(99, Math.round(progressPercent ?? 0)));
  const progressBlocks = Math.max(1, Math.round(visibleProgress / 5));
  const progressLine = `${"■".repeat(Math.min(progressBlocks, 20))}${"□".repeat(Math.max(0, 20 - progressBlocks))}`;

  return (
    <section className="diagnosis-loading-panel diagnosis-report-anchor" aria-live="polite">
      <span className="diagnosis-kicker">AI Resume Diagnosis</span>
      <h2>正在生成诊断报告</h2>
      <p>小律正在调用真实 AI 诊断接口，当前模式为{diagnosisType === "TARGETED" ? "针对岗位诊断" : "通用诊断"}。</p>
      <div className="diagnosis-progress-block" aria-label={`诊断进度 ${visibleProgress}%`}>
        <strong>诊断进度 {visibleProgress}%</strong>
        <div className="diagnosis-progress-bar" aria-hidden="true">
          <span style={{ width: `${visibleProgress}%` }} />
        </div>
        <code>{progressLine}</code>
        <small>提取技能与成果证据，预计一分钟左右，请稍候...</small>
      </div>
      <div className="diagnosis-loading-steps">
        {DIAGNOSIS_STEPS.map((item, index) => (
          <div key={item} className={index < stepIndex ? "done" : index === stepIndex ? "active" : ""}>
            <i>{index + 1}</i>
            <span>{item.replace(/^正在/, "")}</span>
          </div>
        ))}
      </div>
      <p className="diagnosis-muted">诊断过程中按钮已锁定，旧请求不会覆盖当前简历的结果。</p>
    </section>
  );
}

function DiagnosisReadyPanel({ selectedResume, hasJd, error }) {
  return (
    <section className="diagnosis-ready-panel diagnosis-report-anchor">
      <header className="diagnosis-ready-head">
        <div>
          <span className="diagnosis-kicker">AI RESUME DIAGNOSIS</span>
          <h2>AI简历诊断</h2>
          <p>上传简历后，小律会从以下维度帮你检查，诊断完成前不会展示示例评分。</p>
        </div>
      </header>
      <div className="diagnosis-ready-grid">
        {READY_COVERAGE_ITEMS.map((item) => (
          <div key={item.key}>
            <strong>{item.label}</strong>
            <small>{item.key === "jobMatch" && !hasJd ? "暂无JD时未评估" : "等待诊断"}</small>
          </div>
        ))}
      </div>
      {error ? <p className="diagnosis-error">{error}</p> : null}
    </section>
  );
}

function DiagnosisReportPanel({
  report,
  hasJd,
  dimensionRows,
  issues,
  overview,
  showAllIssues,
  onToggleIssues,
  onOptimize,
  onReDiagnose,
  onReUpload,
}) {
  const scoreMeta = getScoreMeta(report.overallScore, report.informationSufficient);
  const visibleIssues = showAllIssues ? issues : issues.slice(0, 3);

  return (
    <section className="diagnosis-report-panel diagnosis-report-anchor">
      <header className="diagnosis-report-top">
        <div>
          <div className="diagnosis-report-title-row">
            <h2>诊断报告</h2>
            <span className="diagnosis-kicker">诊断完成</span>
          </div>
          <p>{hasJd ? "基于简历内容与目标岗位JD的匹配分析" : "基于简历内容的通用质量诊断"}</p>
        </div>
        <div className="diagnosis-report-actions">
          <button type="button" onClick={onReUpload}>重新上传</button>
          <button type="button" onClick={() => onReDiagnose?.()}>重新诊断</button>
        </div>
      </header>

      <div className="diagnosis-score-overview">
        <div className="diagnosis-score-card">
          <span>综合评分</span>
          <strong>{report.overallScore ?? "--"}<small>{report.overallScore == null ? "" : " / 100"}</small></strong>
          <em className={scoreMeta.tone}>{scoreMeta.label}</em>
          <p>{report.overallScore == null ? "当前接口未返回可计算评分。" : "评分来自真实诊断结果或接口维度分的确定性汇总。"}</p>
        </div>

        <div className="diagnosis-dimensions-card">
          <h3>诊断维度</h3>
          <div className="diagnosis-dimension-list">
            {dimensionRows.map((item) => <DimensionBar key={item.key} item={item} />)}
          </div>
        </div>

        <div className="diagnosis-overview-card">
          <h3>诊断概要</h3>
          <ul>
            {overview.map((item) => <li key={item}>{shortenText(item, 92)}</li>)}
          </ul>
          <button type="button" onClick={() => onOptimize?.(issues[0] ?? report.priorityIssue)}>去优化简历</button>
        </div>
      </div>

      <section className="diagnosis-key-issues">
        <div className="diagnosis-card-title-row">
          <div>
            <h3>关键问题</h3>
            <p>{issues.length ? "优先优化以下问题，可显著提升简历竞争力。" : "当前报告未返回明确问题。"}</p>
          </div>
        </div>
        <div className="diagnosis-issue-list">
          {visibleIssues.length ? visibleIssues.map((issue, index) => (
            <IssueCard key={`${getIssueTitle(issue, index)}-${index}`} issue={issue} index={index} onOptimize={onOptimize} />
          )) : (
            <div className="diagnosis-empty-issues">暂无关键问题，可前往优化页继续微调表达。</div>
          )}
        </div>
        {issues.length > 3 ? (
          <button type="button" className="diagnosis-show-all-button" onClick={onToggleIssues}>
            {showAllIssues ? "收起问题" : `查看全部问题（共 ${issues.length} 项）`}
          </button>
        ) : null}
      </section>

      <p className="diagnosis-muted">{report.disclaimer}</p>
    </section>
  );
}

function diagnosisReportCacheKey(resumeKey, jdKey) {
  return `${DIAGNOSIS_REPORT_CACHE_PREFIX}${encodeURIComponent(`${resumeKey}::${jdKey}`)}`;
}

function loadDiagnosisReport(resumeKey, jdKey) {
  if (!resumeKey) return null;
  try {
    const raw = window.localStorage.getItem(diagnosisReportCacheKey(resumeKey, jdKey));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDiagnosisReport(resumeKey, jdKey, report) {
  if (!resumeKey || !report) return;
  try {
    window.localStorage.setItem(diagnosisReportCacheKey(resumeKey, jdKey), JSON.stringify(report));
  } catch {
    // Report recovery is best effort when browser storage is unavailable.
  }
}

function DimensionBar({ item }) {
  const evaluated = item.value !== null && item.value !== undefined;
  const scoreMeta = getScoreMeta(item.value, evaluated);
  const width = evaluated ? `${item.value}%` : "0%";
  return (
    <div className={`diagnosis-dimension-item ${evaluated ? "" : "unevaluated"}`}>
      <div>
        <strong>{item.label}</strong>
        <span>{evaluated ? `${item.value} · ${scoreMeta.label}` : "未评估"}</span>
      </div>
      <div className="diagnosis-progress"><i style={{ width }} /></div>
      {item.note ? <p>{item.note}</p> : null}
    </div>
  );
}
function IssueCard({ issue, index, onOptimize }) {
  return (
    <article className="diagnosis-issue-card">
      <div className="diagnosis-issue-index">{String(index + 1).padStart(2, "0")}</div>
      <div className="diagnosis-issue-body">
        <h4>{shortenText(getIssueTitle(issue, index), 34)}</h4>
        <p>{shortenText(getIssueDescription(issue), 96)}</p>
        <div className="diagnosis-issue-meta">
          <span>影响维度：{getIssueDimension(issue)}</span>
        </div>
        <strong>建议修改方向</strong>
        <p>{shortenText(getIssueSuggestion(issue), 92)}</p>
      </div>
      <button type="button" onClick={() => onOptimize?.(issue)}>AI帮我修改</button>
    </article>
  );
}


