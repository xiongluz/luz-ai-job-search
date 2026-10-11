import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildJobMatchSessionPayload,
  createJobMatchSession,
  getJobMatchProgress,
  getJobMatchResults,
  rematchJobMatchSession,
  validateJobMatchResumeFile,
} from "./jobMatchApi.js";
import { searchCampusRecruitmentByDocument } from "./recruitmentApi.js";
import {
  buildJobRoleCatalog,
  buildSmartRoleGroups,
  filterJobRoleGroups,
} from "./jobMatchCatalog.js";
import {
  buildJobMatchPreferenceLabels,
  clearJobMatchPreferences,
  getDefaultJobMatchPreferenceDraft,
  loadJobMatchPreferences,
  normalizeJobMatchPreferenceDraft,
  saveJobMatchPreferences,
} from "./jobMatchPreferences.js";

const STATUS_COPY = {
  PENDING: { title: "正在准备匹配", stage: "准备匹配", detail: "后端正在接收你的条件并初始化会话" },
  PARSING_RESUME: { title: "正在分析简历", stage: "简历解析", detail: "后端正在提取简历中的学历、专业和技能信息" },
  FILTERING: { title: "正在筛选符合条件的岗位", stage: "全库筛选", detail: "后端正在对全库岗位做硬筛选" },
  SCORING: { title: "正在计算岗位匹配度", stage: "匹配评分", detail: "后端正在计算匹配度与差距" },
  RANKING: { title: "正在生成推荐排序", stage: "推荐排序", detail: "后端正在整理推荐结果顺序" },
  COMPLETED: { title: "匹配完成", stage: "结果就绪", detail: "推荐结果已经生成完毕" },
  FAILED: { title: "匹配失败", stage: "任务异常", detail: "后端返回了可见错误信息" },
};

const EMPTY_REFERENCE = {
  cities: ["上海", "杭州", "北京", "深圳", "广州", "南京", "成都", "武汉"],
  recruitmentBatches: ["提前批", "秋招", "春招", "补录"],
  companyTypes: ["国企", "央企", "民企", "外企", "事业单位"],
  educationLevels: ["本科", "硕士", "博士"],
  industries: ["互联网", "金融", "制造", "教育", "医疗"],
  majors: ["计算机", "软件工程", "机械", "金融学", "市场营销"],
  graduationYears: ["2027", "2026", "2025"],
};

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  const text = String(value ?? "").trim();
  return text ? [text] : [];
}

function uniqueList(items) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => String(item ?? "").trim()).filter(Boolean)));
}

function mergeOptions(...lists) {
  return uniqueList(lists.flatMap((list) => normalizeList(list)));
}

function formatDateTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return "未提供更新时间";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatResumeProfileTags(profile) {
  const sections = [
    ["学历", profile?.educationLevels],
    ["专业", profile?.majors],
    ["技能", profile?.skills],
    ["方向", profile?.jobDirections],
    ["经历", profile?.experiences],
    ["项目", profile?.projects],
  ];

  return sections
    .map(([label, values]) => ({ label, values: uniqueList(normalizeList(values)).slice(0, 3) }))
    .filter((item) => item.values.length > 0);
}

function buildJobMatchDraft(jobType, initialDraft = {}, selectedResumeId = "") {
  if (jobType !== "CAMPUS" && jobType !== "INTERNSHIP") return null;
  const saved = loadJobMatchPreferences(jobType);
  const normalizedInitial = normalizeJobMatchPreferenceDraft(initialDraft, jobType);
  const merged = {
    ...saved,
    ...normalizedInitial,
    targetRoles: normalizedInitial.targetRoles.length > 0 ? normalizedInitial.targetRoles : saved.targetRoles,
    cities: normalizedInitial.cities.length > 0 ? normalizedInitial.cities : saved.cities,
    graduation: normalizedInitial.graduation || saved.graduation,
    recruitmentBatch: normalizedInitial.recruitmentBatch || saved.recruitmentBatch,
    companyType: normalizedInitial.companyType || saved.companyType,
    industry: normalizedInitial.industry || saved.industry,
    education: normalizedInitial.education || saved.education,
    acceptWrittenTest: normalizedInitial.acceptWrittenTest || saved.acceptWrittenTest,
    acceptRelatedJobs: normalizedInitial.acceptRelatedJobs || saved.acceptRelatedJobs,
    onlyUnexpired: typeof normalizedInitial.onlyUnexpired === "boolean" ? normalizedInitial.onlyUnexpired : saved.onlyUnexpired,
    keywords: normalizedInitial.keywords || saved.keywords,
    recruitmentType: normalizedInitial.recruitmentType || saved.recruitmentType || jobType,
    resumeId: selectedResumeId || normalizedInitial.resumeId || saved.resumeId || "",
  };
  return normalizeJobMatchPreferenceDraft(merged, jobType);
}

function getSelectedResume(resumeChoices, selectedResumeId) {
  return (Array.isArray(resumeChoices) ? resumeChoices : []).find((item) => String(item.id) === String(selectedResumeId)) ?? null;
}

function getStatusCopy(status) {
  return STATUS_COPY[status] ?? STATUS_COPY.PENDING;
}

function normalizeMatchSummary(progress, results) {
  return {
    sessionId: progress.sessionId ?? results.sessionId ?? "",
    status: progress.status ?? results.status ?? "COMPLETED",
    progress: Number(progress.progress ?? results.progress ?? 100),
    batchNumber: Number(results.batchNumber ?? 1),
    batchSize: Number(results.batchSize ?? 15),
    totalMatched: Number(results.totalMatched ?? results.results?.length ?? 0),
    hasMore: Boolean(results.hasMore),
    filtersSnapshot: results.filtersSnapshot ?? {},
    results: Array.isArray(results.results) ? results.results : [],
  };
}

function buildResumeOptionLabel(resume) {
  const parts = [resume.fileName];
  if (resume.uploadedAt) parts.push(formatDateTime(resume.uploadedAt));
  return parts.filter(Boolean).join(" · ");
}

function normalizeSelectOptions(options) {
  return (Array.isArray(options) ? options : []).map((option) => {
    if (typeof option === "string") return { value: option, label: option };
    return {
      value: String(option?.value ?? ""),
      label: String(option?.label ?? option?.value ?? ""),
      disabled: Boolean(option?.disabled),
    };
  });
}

function JobMatchSelect({
  value,
  options,
  placeholder = "请选择",
  onChange,
  ariaLabel,
  className = "",
  disabled = false,
}) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const normalizedOptions = useMemo(() => normalizeSelectOptions(options), [options]);
  const selectedIndex = normalizedOptions.findIndex((option) => option.value === String(value ?? ""));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const [menuStyle, setMenuStyle] = useState(null);
  const selectedOption = selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null;

  useEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedHeight = Math.min(280, Math.max(48, normalizedOptions.length * 38 + 8));
      const openAbove = window.innerHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight;
      const belowSpace = Math.max(120, window.innerHeight - rect.bottom - 16);
      const aboveSpace = Math.max(120, rect.top - 16);
      setMenuStyle({
        top: openAbove ? Math.max(8, rect.top - estimatedHeight) : rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(280, openAbove ? aboveSpace : belowSpace),
      });
    }

    function handlePointerDown(event) {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((current) => {
          let next = current;
          for (let index = 0; index < normalizedOptions.length; index += 1) {
            next = (next + direction + normalizedOptions.length) % normalizedOptions.length;
            if (!normalizedOptions[next]?.disabled) return next;
          }
          return current;
        });
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const direction = event.key === "Home" ? 1 : -1;
        const start = event.key === "Home" ? 0 : normalizedOptions.length - 1;
        for (let offset = 0; offset < normalizedOptions.length; offset += 1) {
          const index = (start + offset * direction + normalizedOptions.length) % normalizedOptions.length;
          if (!normalizedOptions[index]?.disabled) {
            setActiveIndex(index);
            break;
          }
        }
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const option = normalizedOptions[activeIndex];
        if (option && !option.disabled) {
          onChange?.(option.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    }

    updatePosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [activeIndex, normalizedOptions, onChange, open]);

  useEffect(() => {
    if (selectedIndex >= 0) setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  function toggleOpen() {
    if (disabled) return;
    setOpen((current) => !current);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }

  function chooseOption(option) {
    if (option.disabled) return;
    onChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <div className={`job-match-select ${className}`}>
        <button
          ref={triggerRef}
          type="button"
          className="job-match-select-trigger"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={menuId}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={toggleOpen}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
            }
            if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
            }
          }}
        >
          <span className={selectedOption ? "" : "is-placeholder"}>
            {selectedOption?.label || placeholder}
          </span>
          <i aria-hidden="true">{open ? "⌃" : "⌄"}</i>
        </button>
      </div>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className="job-match-select-menu"
          role="listbox"
          aria-label={ariaLabel}
          style={menuStyle}
        >
          {normalizedOptions.length > 0 ? normalizedOptions.map((option, index) => (
            <button
              key={`${option.value}-${index}`}
              type="button"
              role="option"
              aria-selected={String(value ?? "") === option.value}
              aria-disabled={option.disabled}
              className={[
                "job-match-select-option",
                String(value ?? "") === option.value ? "is-selected" : "",
                activeIndex === index ? "is-active" : "",
                option.disabled ? "is-disabled" : "",
              ].filter(Boolean).join(" ")}
              disabled={option.disabled}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => chooseOption(option)}
            >
              <span>{option.label}</span>
              {String(value ?? "") === option.value && <i aria-hidden="true">✓</i>}
            </button>
          )) : (
            <div className="job-match-select-empty">暂无可选项</div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

function RolePickerPanel({
  open,
  groups,
  smartGroups,
  selection,
  query,
  onQueryChange,
  tab,
  onTabChange,
  activeGroupId,
  onActiveGroupIdChange,
  onSelectionChange,
  onCancel,
  onConfirm,
}) {
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) {
      setLocalError("");
      return;
    }
    if (tab === "smart" && smartGroups.length > 0 && !smartGroups.some((group) => group.id === activeGroupId)) {
      onActiveGroupIdChange(smartGroups[0]?.id ?? groups[0]?.id ?? "");
    }
    if (tab === "all" && groups.length > 0 && !groups.some((group) => group.id === activeGroupId)) {
      onActiveGroupIdChange(groups[0]?.id ?? "");
    }
  }, [open, tab, smartGroups, groups, activeGroupId, onActiveGroupIdChange]);

  const visibleGroups = useMemo(() => {
    const source = tab === "smart" ? smartGroups : groups;
    const normalizedQuery = String(query ?? "").trim().toLowerCase();
    const mapped = source.map((group) => {
      const roles = group.roles.filter((role) => {
        if (!normalizedQuery) return true;
        return role.toLowerCase().includes(normalizedQuery) || group.label.toLowerCase().includes(normalizedQuery);
      });
      return { ...group, roles };
    }).filter((group) => group.roles.length > 0);
    return mapped;
  }, [groups, smartGroups, query, tab]);

  const activeGroup = visibleGroups.find((group) => group.id === activeGroupId) ?? visibleGroups[0] ?? null;

  function toggleRole(role) {
    const text = String(role ?? "").trim();
    if (!text) return;
    setLocalError("");
    const current = Array.isArray(selection) ? selection : [];
    if (current.includes(text)) {
      onSelectionChange(current.filter((item) => item !== text));
      return;
    }
    if (current.length >= 3) {
      setLocalError("目标岗位最多选择 3 个。");
      return;
    }
    onSelectionChange([...current, text]);
  }

  function removeRole(role) {
    onSelectionChange(selection.filter((item) => item !== role));
  }

  if (!open) return null;

  return (
    <div className="job-role-picker" id="job-role-picker" role="dialog" aria-modal="true" aria-label="目标岗位选择器">
      <div className="job-role-picker-tabs">
        <button type="button" className={tab === "smart" ? "is-active" : ""} onClick={() => onTabChange("smart")}>
          智能推荐
        </button>
        <button type="button" className={tab === "all" ? "is-active" : ""} onClick={() => onTabChange("all")}>
          全部岗位
        </button>
      </div>

      <label className="job-role-picker-search">
        <span className="sr-only">搜索岗位</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={tab === "smart" ? "搜索智能推荐岗位，例如：会计、机械、运营" : "搜索全部岗位，例如：Java、教师、护士"}
          aria-label="搜索岗位"
        />
      </label>

      <div className="job-role-picker-body">
        <aside className="job-role-picker-sidebar" aria-label="岗位分类">
          {visibleGroups.length > 0 ? visibleGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={group.id === activeGroup?.id ? "is-active" : ""}
              onClick={() => onActiveGroupIdChange(group.id)}
            >
              <span>{group.label}</span>
              {typeof group.score === "number" && <i>{group.score}</i>}
            </button>
          )) : (
            <div className="job-role-picker-empty">没有找到匹配的岗位分类。</div>
          )}
        </aside>

        <div className="job-role-picker-main">
          {tab === "smart" && smartGroups.length === 0 ? (
            <div className="job-role-picker-empty is-tip">
              暂时没有足够的简历解析信息，先使用“全部岗位”浏览全行业岗位。
            </div>
          ) : activeGroup ? (
            <>
              <div className="job-role-picker-group-head">
                <div>
                  <strong>{activeGroup.label}</strong>
                  <p>{tab === "smart" && typeof activeGroup.score === "number" ? `智能相关度 ${activeGroup.score}` : "热门岗位导航，不限制真实岗位范围"}</p>
                </div>
              </div>

              <div className="job-role-picker-grid" role="list">
                {activeGroup.roles.map((role) => {
                  const selected = selection.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      className={selected ? "is-selected" : ""}
                      onClick={() => toggleRole(role)}
                      aria-pressed={selected}
                    >
                      <span>{role}</span>
                      {selected && <i aria-hidden="true">✓</i>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="job-role-picker-empty">没有可展示的岗位。</div>
          )}
        </div>
      </div>

      <div className="job-role-picker-selected">
        <span>已选择 {selection.length} / 3</span>
        <div>
          {selection.length > 0 ? selection.map((role) => (
            <button key={role} type="button" onClick={() => removeRole(role)}>
              {role} ×
            </button>
          )) : <em>请最多选择 3 个目标岗位</em>}
        </div>
      </div>

      {localError && <p className="job-match-inline-error">{localError}</p>}

      <div className="job-role-picker-footer">
        <button type="button" onClick={onCancel}>取消</button>
        <button type="button" className="is-primary" onClick={onConfirm} disabled={selection.length === 0}>
          确认选择
        </button>
      </div>
    </div>
  );
}

export default function JobMatchModal({
  open,
  onClose,
  jobType,
  initialDraft,
  targetJobId = "",
  onDraftChange,
  resumeChoices = [],
  selectedResumeId,
  onSelectResumeId,
  referenceData,
  onComplete,
  onRequireLogin,
  rematchSessionId = "",
}) {
  const isValidJobType = jobType === "CAMPUS" || jobType === "INTERNSHIP";
  const modalDescription = jobType === "INTERNSHIP"
    ? "从全部实习岗位中筛选最适合你的15个岗位"
    : "从全部校招岗位中筛选最适合你的15个岗位";
  const uploadActionLabel = "匹配岗位";
  const [draft, setDraft] = useState(() => buildJobMatchDraft(jobType, initialDraft, selectedResumeId));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [pickedFile, setPickedFile] = useState(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [progressState, setProgressState] = useState(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [rolePickerTab, setRolePickerTab] = useState("smart");
  const [roleSearch, setRoleSearch] = useState("");
  const [pickerGroupId, setPickerGroupId] = useState("");
  const [pickerSelection, setPickerSelection] = useState([]);
  const [dirty, setDirty] = useState(false);
  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);
  const requestSeqRef = useRef(0);
  const abortRef = useRef(null);
  const baselineRef = useRef(null);
  const startLockRef = useRef(false);
  const uploadedFileRef = useRef(null);
  const activeDraft = draft ?? {
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
  const activeTargetJobId = String(targetJobId ?? "").trim();
  const selectedResume = useMemo(() => getSelectedResume(resumeChoices, selectedResumeId ?? activeDraft.resumeId), [resumeChoices, selectedResumeId, activeDraft.resumeId]);

  const referenceSets = useMemo(() => {
    const source = referenceData ?? {};
    return {
      cities: mergeOptions(EMPTY_REFERENCE.cities, source.cities),
      recruitmentBatches: mergeOptions(EMPTY_REFERENCE.recruitmentBatches, source.recruitmentBatches),
      companyTypes: mergeOptions(EMPTY_REFERENCE.companyTypes, source.companyTypes),
      industries: mergeOptions(EMPTY_REFERENCE.industries, source.industries),
      educationLevels: mergeOptions(EMPTY_REFERENCE.educationLevels, source.educationLevels),
      majors: mergeOptions(EMPTY_REFERENCE.majors, source.majors),
      graduationYears: mergeOptions(EMPTY_REFERENCE.graduationYears, source.graduationYears),
    };
  }, [referenceData]);

  const roleGroups = useMemo(() => buildJobRoleCatalog(referenceData ?? {}), [referenceData]);
  const smartGroups = useMemo(() => buildSmartRoleGroups(selectedResume?.profile, roleGroups), [selectedResume, roleGroups]);
  const selectedResumeProfileTags = useMemo(() => formatResumeProfileTags(selectedResume?.profile), [selectedResume]);
  const visibleSelectedRoles = useMemo(() => uniqueList(activeDraft.targetRoles), [activeDraft.targetRoles]);
  const visibleSelectedCities = useMemo(() => uniqueList(activeDraft.cities), [activeDraft.cities]);
  const visiblePreferenceLabels = useMemo(() => buildJobMatchPreferenceLabels(activeDraft), [activeDraft]);
  const currentStatusCopy = getStatusCopy(progressState?.status);
  const progressValue = Math.max(0, Math.min(100, Math.round(progressState?.progress ?? 0)));
  const canStart = isValidJobType
    && !uploading
    && !matching
    && Boolean(selectedResume?.id || selectedResumeId || activeDraft.resumeId || uploadedFileRef.current);

  useEffect(() => {
    if (!isValidJobType) {
      setMatchError("岗位匹配入口类型无效，无法创建 session。");
    }
  }, [isValidJobType]);

  useEffect(() => {
    if (!open || !isValidJobType) {
      return undefined;
    }
    const nextDraft = buildJobMatchDraft(jobType, initialDraft, selectedResumeId);
    if (!nextDraft) return undefined;
    if (activeTargetJobId) {
      nextDraft.jobId = activeTargetJobId;
    }
    baselineRef.current = normalizeJobMatchPreferenceDraft(nextDraft, jobType);
    setDraft(nextDraft);
    setDirty(false);
    setUploadError("");
    setUploadMessage("");
    setMatchError("");
    setProgressState(null);
    uploadedFileRef.current = null;
    setPickedFile(null);
    setRolePickerOpen(false);
    setRoleSearch("");
    setRolePickerTab("smart");
    setPickerSelection(nextDraft.targetRoles);
    if (nextDraft.resumeId && String(nextDraft.resumeId) !== String(selectedResumeId)) {
      onSelectResumeId?.(nextDraft.resumeId);
    }
    return undefined;
  }, [activeTargetJobId, open, initialDraft, isValidJobType, jobType, selectedResumeId, onSelectResumeId]);

  useEffect(() => {
    if (!open || !draft || !isValidJobType) return;
    const normalizedDraft = normalizeJobMatchPreferenceDraft(draft, jobType);
    setDirty(JSON.stringify(normalizedDraft) !== JSON.stringify(baselineRef.current ?? normalizedDraft));
  }, [draft, isValidJobType, jobType, open]);

  useEffect(() => {
    if (!open || !isValidJobType) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        requestClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, matching, progressState, dirty, isValidJobType]);

  useEffect(() => () => {
    requestSeqRef.current += 1;
    abortRef.current?.abort();
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open || !isValidJobType || !draft) return;
    if (selectedResumeId && String(selectedResumeId) !== String(draft.resumeId)) {
      setDraft((current) => ({ ...current, resumeId: String(selectedResumeId) }));
    }
  }, [open, isValidJobType, selectedResumeId, draft?.resumeId]);

  function persistDraft(nextDraft) {
    const normalized = normalizeJobMatchPreferenceDraft(nextDraft, jobType);
    setDraft(normalized);
    onDraftChange?.(normalized);
    saveJobMatchPreferences(jobType, normalized);
    setDirty(JSON.stringify(normalized) !== JSON.stringify(baselineRef.current ?? normalized));
  }

  function requestClose() {
    if (matching) {
      const ok = window.confirm("匹配正在进行中，关闭后会停止本次轮询，确认关闭吗？");
      if (!ok) return;
    } else if (dirty) {
      const ok = window.confirm("你已修改求职偏好，确认关闭并放弃这些修改吗？");
      if (!ok) return;
    }

    requestSeqRef.current += 1;
    abortRef.current?.abort();
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setMatching(false);
    setMatchError("");
    setProgressState(null);
    onClose();
  }

  function updateDraftField(key, value) {
    if (key === "recruitmentType" && isValidJobType) {
      persistDraft({ ...draft, recruitmentType: jobType });
      return;
    }
    persistDraft({ ...draft, [key]: value });
  }

  function toggleArrayValue(key, value) {
    const text = String(value ?? "").trim();
    if (!text) return;
    const current = Array.isArray(draft[key]) ? draft[key] : [];
    const nextValues = current.includes(text) ? current.filter((item) => item !== text) : [...current, text];
    persistDraft({ ...draft, [key]: nextValues });
  }

  function removeArrayValue(key, value) {
    persistDraft({ ...draft, [key]: (Array.isArray(draft[key]) ? draft[key] : []).filter((item) => item !== value) });
  }

  function handleRoleInputClick() {
    setPickerSelection(visibleSelectedRoles);
    const nextGroups = rolePickerTab === "smart" && smartGroups.length > 0 ? smartGroups : roleGroups;
    setPickerGroupId(nextGroups[0]?.id ?? "");
    setRolePickerOpen(true);
  }

  function handleRolePickerCancel() {
    setRolePickerOpen(false);
    setRoleSearch("");
  }

  function handleRolePickerConfirm() {
    persistDraft({ ...draft, targetRoles: pickerSelection });
    setRolePickerOpen(false);
    setRoleSearch("");
  }

  function resetPreferenceDraft() {
    const resetDraft = getDefaultJobMatchPreferenceDraft(jobType);
    const next = normalizeJobMatchPreferenceDraft({
      ...resetDraft,
      resumeId: draft.resumeId,
      targetRoles: [],
      cities: [],
    }, jobType);
    baselineRef.current = normalizeJobMatchPreferenceDraft(next, jobType);
    persistDraft(next);
    setPickerSelection([]);
    clearJobMatchPreferences(jobType);
    saveJobMatchPreferences(jobType, next);
  }

  function handleUploadResume(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validateJobMatchResumeFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    uploadedFileRef.current = file;
    setPickedFile({ name: file.name, size: file.size });
    setUploadError("");
    setUploadMessage(`已选择简历 ${file.name}，点击「匹配岗位」开始检索`);
  }

  async function pollProgress(sessionId, resumeId, resumeName, sessionDraft) {
    const currentRequestId = ++requestSeqRef.current;

    const poll = async () => {
      try {
        const progress = await getJobMatchProgress(sessionId, { signal: abortRef.current?.signal });
        if (requestSeqRef.current !== currentRequestId) return;

        setProgressState(progress);
        setMatchError("");

        if (progress.status === "COMPLETED") {
          const results = await getJobMatchResults(sessionId, { signal: abortRef.current?.signal });
          if (requestSeqRef.current !== currentRequestId) return;
          onComplete?.({
            ...normalizeMatchSummary(progress, results),
            resumeId,
            resumeName,
            draft: sessionDraft,
          });
          setMatching(false);
          return;
        }

        if (progress.status === "FAILED") {
          setMatching(false);
          setMatchError(progress.message || "匹配失败，请稍后重试。");
          return;
        }

        pollTimerRef.current = window.setTimeout(poll, 700);
      } catch (error) {
        if (requestSeqRef.current !== currentRequestId) return;
        if (error?.name === "AbortError") return;
        if (error?.status === 401) {
          setMatchError("登录已失效，请重新登录后再继续匹配。");
          onRequireLogin?.();
        } else {
          setMatchError(error.message || "进度查询失败，请稍后重试。");
        }
        setMatching(false);
      }
    };

    pollTimerRef.current = window.setTimeout(poll, 0);
  }

  async function handleStartMatch() {
    if (!isValidJobType) {
      setMatchError("岗位匹配入口类型无效，无法匹配。");
      return;
    }
    if (startLockRef.current) return;

    const uploadedFile = uploadedFileRef.current;
    if (!uploadedFile) {
      setMatchError("请先上传简历文件后再匹配岗位。");
      return;
    }

    startLockRef.current = true;
    setMatching(true);
    setMatchError("");
    setUploadError("");
    setUploadMessage("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await searchCampusRecruitmentByDocument(
        { page: 1, pageSize: 10, file: uploadedFile },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const list = Array.isArray(result?.list) ? result.list : [];
      if (list.length === 0) {
        setMatchError("未匹配到符合条件的岗位，请更换简历或稍后重试。");
        setMatching(false);
        return;
      }
      // 只把第一页交给前端展示；file/total 一并传回，由前端在切换页码时按 pageNum/pageSize 再请求后端。
      onComplete?.({
        results: list,
        total: Number(result?.total ?? list.length),
        file: uploadedFile,
      });
      setMatching(false);
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (error?.status === 401) {
        setMatchError("请先登录后再开始精准匹配。");
        onRequireLogin?.();
      } else {
        setMatchError(error.message || "匹配失败，请稍后重试。");
      }
      setMatching(false);
    } finally {
      startLockRef.current = false;
    }
  }

  if (!open) return null;

  if (!isValidJobType || !draft) {
    return createPortal(
      <div className="job-match-overlay" role="presentation">
        <section
          className="job-match-modal"
          role="dialog"
          aria-modal="true"
          aria-label="岗位匹配"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="job-match-header">
            <div>
              <h2>精准岗位匹配</h2>
              <p>岗位匹配入口类型无效，无法创建 session。</p>
            </div>
            <button type="button" className="job-match-close" onClick={requestClose} aria-label="关闭岗位匹配">
              ×
            </button>
          </header>
        </section>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="job-match-overlay" role="presentation" onMouseDown={requestClose}>
      <section
        className="job-match-modal"
        role="dialog"
        aria-modal="true"
        aria-label="精准岗位匹配"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="job-match-header">
          <div>
            <h2>精准岗位匹配</h2>
            <p>{modalDescription}</p>
          </div>
          <button type="button" className="job-match-close" onClick={requestClose} aria-label="关闭精准岗位匹配">
            ×
          </button>
        </header>

        <div className="job-match-body">
          <div className="job-match-core-grid is-resume-only">
            <div className="job-match-field is-resume">
              <span className="job-match-field-label">使用简历</span>
              <div className={`job-match-resume-box ${selectedResume || pickedFile ? "has-selection" : "is-empty"}`}>
                {pickedFile ? (
                  <>
                    <div className="job-match-resume-meta">
                      <strong>{pickedFile.name}</strong>
                      <span>已选择本地简历</span>
                    </div>
                    <div className="job-match-resume-actions">
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || matching}>
                        更换
                      </button>
                    </div>
                  </>
                ) : selectedResume ? (
                  <>
                    <div className="job-match-resume-meta">
                      <strong>{selectedResume.fileName}</strong>
                      <span>{buildResumeOptionLabel(selectedResume)}</span>
                    </div>
                    <div className="job-match-resume-actions">
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || matching}>
                        更换
                      </button>
                      {resumeChoices.length > 1 && (
                        <JobMatchSelect
                          aria-label="选择历史简历"
                          ariaLabel="选择历史简历"
                          value={selectedResume?.id ?? ""}
                          options={resumeChoices.map((resume) => ({ value: String(resume.id), label: resume.fileName }))}
                          onChange={(value) => {
                            onSelectResumeId?.(value);
                            persistDraft({ ...draft, resumeId: value });
                          }}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="job-match-upload-placeholder"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || matching}
                  >
                    <span className="job-match-upload-icon" aria-hidden="true">↑</span>
                    <strong>上传本地简历</strong>
                    <small>支持 PDF、DOC、DOCX。选择后点击「匹配岗位」开始检索。</small>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleUploadResume}
              />
              <small className="job-match-resume-hint">{uploadMessage || "支持后端真实解析后的学历、专业、技能标签。不要选择未确认的简历。"}</small>
            </div>
          </div>

          {selectedResumeProfileTags.length > 0 && (
            <div className="job-match-profile-panel">
              {selectedResumeProfileTags.map((section) => (
                <div key={section.label}>
                  <strong>{section.label}</strong>
                  <div>
                    {section.values.map((value) => <span key={value}>{value}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {uploadError && <p className="job-match-error">{uploadError}</p>}
          {matchError && <p className="job-match-error">{matchError}</p>}

          {progressState && (
            <div className="job-match-progress-card" aria-live="polite">
              <div className="job-match-progress-head">
                <div>
                  <strong>{currentStatusCopy.title}</strong>
                  <span>{currentStatusCopy.detail}</span>
                </div>
                <b>{progressValue}%</b>
              </div>
              <div className="job-match-progress-bar" aria-hidden="true">
                <i style={{ width: `${progressValue}%` }} />
              </div>
              <div className="job-match-progress-meta">
                <span>当前阶段：{currentStatusCopy.stage}</span>
                <span>候选岗位：{progressState?.totalCandidates ?? 0}</span>
                <span>可重试：{progressState?.retryable ? "是" : "否"}</span>
              </div>
              <p>{progressState?.message || currentStatusCopy.detail}</p>
            </div>
          )}

          <div className="job-match-actions">
            <button type="button" onClick={requestClose} disabled={matching && !(progressState?.retryable)}>
              取消
            </button>
            <button type="button" className="is-primary" onClick={handleStartMatch} disabled={!canStart}>
              {matching ? "正在匹配..." : uploadActionLabel}
            </button>
          </div>
        </div>

        <RolePickerPanel
          open={rolePickerOpen}
          groups={filterJobRoleGroups(roleGroups, roleSearch)}
          smartGroups={filterJobRoleGroups(smartGroups, roleSearch)}
          selection={pickerSelection}
          query={roleSearch}
          onQueryChange={setRoleSearch}
          tab={rolePickerTab}
          onTabChange={(nextTab) => {
            setRolePickerTab(nextTab);
            const nextGroups = nextTab === "smart" && smartGroups.length > 0 ? smartGroups : roleGroups;
            setPickerGroupId((current) => nextGroups.some((group) => group.id === current) ? current : (nextGroups[0]?.id ?? ""));
          }}
          activeGroupId={pickerGroupId}
          onActiveGroupIdChange={setPickerGroupId}
          onSelectionChange={setPickerSelection}
          onCancel={handleRolePickerCancel}
          onConfirm={handleRolePickerConfirm}
        />
      </section>
    </div>,
    document.body,
  );
}
