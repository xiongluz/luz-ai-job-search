import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sendResumeAssistantJsonMessage, sendResumeAssistantMessage } from "./aiResumeService.js";

const BUILDER_DRAFT_KEY = "guangqi-careerai-resume-builder-draft";
const BUILDER_SESSION_KEY = "guangqi-careerai-resume-builder-session-id";

const templates = [
  {
    id: "campus",
    name: "校招版",
    tag: "应届/实习",
    hint: "按正式校招简历结构突出核心能力、教育背景、实习与项目经历",
    accent: "#4672f2",
  },
  {
    id: "social",
    name: "社招版",
    tag: "运营/职场",
    hint: "突出个人优势、核心技能、工作业绩、项目案例和教育证书",
    accent: "#1f2933",
  },
];

const identityOptions = [
  {
    value: "student",
    label: "在校生",
    subtitle: "在读本科 / 专科",
    description: "优先梳理教育背景、校园经历、实习、项目、获奖和求职目标。",
  },
  {
    value: "graduate",
    label: "应届生",
    subtitle: "毕业 1 年内",
    description: "突出校招/应届身份、实习项目、校园成果和可投递方向。",
  },
  {
    value: "professional",
    label: "有工作经验",
    subtitle: "1 年以上工作经验",
    description: "优先梳理当前职位、工作年限、核心业绩、管理经验和目标职位。",
  },
];

const emptyDraft = {
  draftId: "",
  resumeName: "我的校招简历",
  identity: "",
  currentStep: 0,
  flowStage: 0,
  templateId: "campus",
  updatedAt: "",
  missingFields: [],
  followUpQuestions: [],
  basic: {
    name: "",
    phone: "",
    email: "",
    city: "",
    status: "",
    photoName: "",
  },
  target: {
    role: "",
    cities: "",
    industry: "",
    jobType: "",
    recruitType: "",
  },
  education: [],
  experience: [],
  projects: [],
  extras: {
    professionalSkills: "",
    tools: "",
    programmingLanguages: "",
    languageAbility: "",
    certificates: "",
    awards: "",
    campusActivities: "",
    strengths: "",
  },
  summary: "",
};

function createEmptyEducation() {
  return {
    id: `edu_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    school: "",
    major: "",
    degree: "",
    start: "",
    end: "",
    gpa: "",
    courses: "",
    campus: "",
  };
}

function createEmptyExperience() {
  return {
    id: `exp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    company: "",
    role: "",
    department: "",
    start: "",
    end: "",
    content: "",
    achievements: "",
    management: "",
  };
}

function createEmptyProject() {
  return {
    id: `project_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: "",
    role: "",
    time: "",
    background: "",
    responsibility: "",
    skills: "",
    result: "",
    link: "",
  };
}

function normalizeDraft(value) {
  const templateId = templates.some((item) => item.id === value?.templateId)
    ? value.templateId
    : (value?.identity === "professional" ? "social" : "campus");

  return {
    ...emptyDraft,
    ...(value ?? {}),
    flowStage: Number.isFinite(value?.flowStage) ? value.flowStage : emptyDraft.flowStage,
    templateId,
    basic: { ...emptyDraft.basic, ...(value?.basic ?? {}) },
    target: { ...emptyDraft.target, ...(value?.target ?? {}) },
    extras: { ...emptyDraft.extras, ...(value?.extras ?? {}) },
    education: Array.isArray(value?.education) ? value.education : [],
    experience: Array.isArray(value?.experience) ? value.experience : [],
    projects: Array.isArray(value?.projects) ? value.projects : [],
    missingFields: Array.isArray(value?.missingFields) ? value.missingFields : [],
    followUpQuestions: Array.isArray(value?.followUpQuestions) ? value.followUpQuestions : [],
  };
}

function loadDraft() {
  try {
    const raw = window.localStorage.getItem(BUILDER_DRAFT_KEY);
    if (!raw) return { ...emptyDraft, draftId: `local_${Date.now()}` };
    return normalizeDraft(JSON.parse(raw));
  } catch {
    return { ...emptyDraft, draftId: `local_${Date.now()}` };
  }
}

function saveDraft(draft) {
  const next = { ...draft, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(next));
  return next;
}

function createBuilderSessionId() {
  return window.crypto?.randomUUID?.() ?? `builder-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createGenerationDraft(templateId = "campus", context = null, sessionId = null) {
  const nextSessionId = sessionId || createBuilderSessionId();
  return normalizeDraft({
    ...emptyDraft,
    draftId: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    sessionId: nextSessionId,
    currentStep: 0,
    flowStage: 0,
    templateId: templates.some((item) => item.id === templateId) ? templateId : "campus",
    generationStatus: "idle",
    generationError: "",
    chatInput: "",
    target: {
      ...emptyDraft.target,
      role: context?.role ?? "",
      recruitType: context?.sourceLabel ?? "",
    },
    updatedAt: "",
  });
}

function loadCurrentGenerationDraft(context = null) {
  const storedDraft = loadDraft();
  const sessionId = window.sessionStorage.getItem(BUILDER_SESSION_KEY);

  if (sessionId) {
    if (storedDraft.sessionId === sessionId) {
      return storedDraft;
    }
    return createGenerationDraft("campus", context, sessionId);
  }

  if (storedDraft.sessionId) {
    window.sessionStorage.setItem(BUILDER_SESSION_KEY, storedDraft.sessionId);
    return storedDraft;
  }

  const nextSessionId = createBuilderSessionId();
  window.sessionStorage.setItem(BUILDER_SESSION_KEY, nextSessionId);
  return createGenerationDraft("campus", context, nextSessionId);
}

function getSteps(identity) {
  const professional = identity === "professional";
  return [
    {
      key: "identity",
      title: "选择身份",
      description: "先确定你的求职身份，后续问题会按学生或职场人士调整。",
      assistant: "先选择你的身份。我会根据学生或职场人士的重点，切换不同的简历结构。",
    },
    {
      key: "basic",
      title: "基本信息",
      description: "填写简历头部信息，照片可稍后补充。",
      assistant: "接下来补充姓名、手机号、邮箱、城市和求职状态，右侧简历头部会同步更新。",
    },
    {
      key: "target",
      title: "目标岗位",
      description: professional ? "明确目标职位、城市、行业和岗位类型。" : "明确校招、实习或应届生投递方向。",
      assistant: "现在确认目标岗位。你可以选择建议项，也可以直接填写自己的目标。",
    },
    {
      key: "education",
      title: "教育经历",
      description: professional ? "职场人士可简化教育经历，保留最高学历和相关信息。" : "学生简历优先展示学校、专业、课程和校园经历。",
      assistant: professional
        ? "教育经历可以简洁一些，重点写最高学历和与岗位相关的信息。"
        : "学生简历会优先看教育背景，可以添加多段学历、课程和校园经历。",
    },
    {
      key: "experience",
      title: professional ? "工作经历" : "实习经历",
      description: professional ? "突出职责、核心业绩、管理经验和业务结果。" : "突出实习职责、协作范围和可验证成果。",
      assistant: professional
        ? "请写工作经历。重点是你负责什么、做成了什么、带来了什么结果。"
        : "请写实习经历。没有实习也可以暂时跳过，后面用项目经历补足。",
    },
    {
      key: "projects",
      title: "项目经历",
      description: "填写项目目标、核心动作、使用方法或工具、项目成果和链接。",
      assistant: "项目经历要写清你的角色和成果。我不会替你编数字，只会提示你补充可验证的结果。",
    },
    {
      key: "extras",
      title: "技能和附加信息",
      description: professional ? "整理技能、工具、语言、证书、获奖和个人优势。" : "整理技能、证书、获奖、校园活动和个人优势。",
      assistant: "把技能和附加信息整理进来，建议按专业能力、专业工具、语言能力、证书和优势分组。",
    },
    {
      key: "summary",
      title: "个人总结和最终确认",
      description: "检查缺失信息、重复内容和岗位匹配，确认后再生成最终简历。",
      assistant: "最后确认简历结构。你可以补充个人总结，再检查缺失项后生成最终版本。",
    },
  ];
}

function splitLines(value) {
  return String(value ?? "")
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function projectContentText(item) {
  return [item?.responsibility, item?.background, item?.skills, item?.result]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

function extrasContentText(extras) {
  return [
    extras?.professionalSkills,
    extras?.tools,
    extras?.languageAbility,
    extras?.certificates,
    extras?.awards,
    extras?.campusActivities,
    extras?.strengths,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

function countRequiredDone(draft) {
  const checks = [
    Boolean(draft.identity),
    Boolean(draft.basic.name && draft.basic.phone && draft.basic.email && draft.basic.city),
    Boolean(draft.target.role),
    draft.education.some((item) => item.school && item.major),
    draft.experience.some((item) => item.company || item.role || item.content || item.management),
    draft.projects.some((item) => item.name || projectContentText(item)),
    Boolean(draft.extras.professionalSkills || draft.extras.tools || draft.extras.certificates || draft.extras.awards),
    Boolean(draft.summary),
  ];
  return checks.filter(Boolean).length;
}

function getMissingItems(draft) {
  const missing = [];
  if (!draft.identity) missing.push("身份");
  if (!draft.basic.name) missing.push("姓名");
  if (!draft.basic.phone) missing.push("手机号");
  if (!draft.basic.email) missing.push("邮箱");
  if (!draft.basic.city) missing.push("所在城市");
  if (!draft.target.role) missing.push("目标岗位");
  if (!draft.education.some((item) => item.school && item.major)) missing.push("教育经历");
  if (!draft.summary) missing.push("个人总结");
  return missing;
}

function getDownloadMissingItems(draft) {
  const missing = getMissingItems(draft);
  const hasExperience = draft.experience.some((item) => item.company || item.role || item.content || item.management);
  const hasProject = draft.projects.some((item) => item.name || projectContentText(item));
  const hasSkills = Boolean(draft.extras.professionalSkills || draft.extras.tools || draft.extras.strengths);
  if (!hasExperience && !hasProject) missing.push("工作/实习经历或项目经历");
  if (!hasSkills) missing.push("核心能力/专业技能");
  return missing;
}

function formatDate(value) {
  if (!value) return "";
  return value.slice(0, 7);
}

function createDownloadFileName(draft) {
  const name = draft.basic.name || draft.resumeName || "我的简历";
  const role = draft.target.role || "求职简历";
  return `${name}-${role}`.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "").slice(0, 48) || "律动求职简历";
}

function normalizeCourseSuggestions(text) {
  const cleaned = String(text ?? "")
    .replace(/```(?:text|json)?/gi, "")
    .replace(/```/g, "")
    .replace(/主修课程[:：]?/g, "")
    .trim();

  const courses = cleaned
    .split(/[\n,，、;；|]/)
    .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.、）)]?)\s*/, "").trim())
    .filter((item) => item && item.length <= 24 && !/[{}[\]]/.test(item));

  return Array.from(new Set(courses)).slice(0, 12).join("、");
}

function removePrintPlaceholders(root) {
  root.querySelectorAll(".paper-placeholder, .is-placeholder").forEach((node) => node.remove());
  root.querySelectorAll("section").forEach((section) => {
    const bodyText = [...section.childNodes]
      .filter((node) => !(node.nodeType === 1 && ["H3"].includes(node.tagName)))
      .map((node) => node.textContent?.trim() ?? "")
      .join("");
    if (!bodyText) section.remove();
  });
}

function openResumePrintWindow(paperElement, draft, template) {
  const printWindow = window.open("", "_blank", "width=980,height=1200");
  if (!printWindow) return false;

  const clonedPaper = paperElement.cloneNode(true);
  removePrintPlaceholders(clonedPaper);
  const stylesheetNodes = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((node) => node.outerHTML)
    .join("\n");
  const fileName = createDownloadFileName(draft);
  const templateName = template?.name || "简历模板";

  printWindow.document.write(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${fileName}</title>
  ${stylesheetNodes}
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      width: 210mm;
      min-height: 297mm;
      margin: 0;
      background: #ffffff !important;
      color: #111827;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      display: block;
      padding: 0;
      font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
    }
    .resume-print-shell {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #ffffff;
    }
    .builder-resume-paper {
      width: 210mm !important;
      min-height: 297mm !important;
      margin: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      transform: none !important;
    }
    .resume-print-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      background: #071827;
      color: #dffdfa;
      font-size: 13px;
    }
    .resume-print-toolbar button {
      border: 0;
      border-radius: 999px;
      padding: 8px 14px;
      background: linear-gradient(135deg, #22dac5, #3a8dff);
      color: #041322;
      font-weight: 700;
      cursor: pointer;
    }
    @media print {
      .resume-print-toolbar { display: none !important; }
      .resume-print-shell { width: 210mm; }
      .builder-resume-paper { page-break-after: auto; }
    }
  </style>
</head>
<body>
  <div class="resume-print-toolbar">
    <span>${templateName} · 请选择“另存为 PDF”完成下载</span>
    <button type="button" onclick="window.print()">打印 / 另存为 PDF</button>
  </div>
  <main class="resume-print-shell">${clonedPaper.outerHTML}</main>
  <script>
    window.addEventListener("load", function () {
      window.setTimeout(function () { window.print(); }, 300);
    });
  </script>
</body>
</html>`);
  printWindow.document.close();
  return true;
}

function moveItem(list, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function aiEndpointFor(action) {
  if (action === "summary") return "POST /api/ai/resumes/summary";
  if (action === "keywords") return "POST /api/ai/resumes/keywords";
  if (action === "check") return "POST /api/ai/resumes/completeness-check";
  if (action === "generate") return "POST /api/ai/resumes/generate";
  return "POST /api/ai/resumes/section-polish";
}

const aiActionLabels = {
  polish: "AI润色",
  bullets: "生成要点",
  keywords: "提取关键词",
  metrics: "量化成果建议",
  summary: "生成个人总结",
};

const sectionLabels = {
  experience: "工作/实习经历",
  project: "项目经历",
  skills: "技能和附加信息",
  summary: "个人总结",
};

function cleanAiSuggestion(text) {
  return String(text ?? "")
    .replace(/```(?:text|markdown|json)?/gi, "")
    .replace(/```/g, "")
    .replace(/^AI建议[:：]\s*/i, "")
    .trim();
}

function buildAiAssistPrompt({ action, sectionType, originalContent, draft, targetJobContext }) {
  const targetRole = draft.target.role || targetJobContext?.role || "未填写";
  const targetIndustry = draft.target.industry || targetJobContext?.industry || "未填写";
  const identity = draft.identity === "professional" ? "社招/职场人士" : "校招/实习求职者";
  const actionGuide = {
    polish: "在不改变事实的前提下，润色为更专业、简洁、有动作结果的简历表达。",
    bullets: "生成适合直接放入简历的条目化要点，每条聚焦动作、方法、结果或证据。",
    keywords: "提取并整理与目标岗位相关、且能由原文支撑的关键词和能力表达。",
    metrics: "提出可量化成果的改写方向；没有真实数字时不要编造数字，只提示可补充的数据口径。",
    summary: "生成一段适合简历顶部的个人总结，突出定位、能力、经验证据和求职方向。",
  };

  return [
    "你是律动求职的AI简历填写助手，请帮助用户完善简历字段。",
    `任务：${aiActionLabels[action] ?? action}`,
    `模块：${sectionLabels[sectionType] ?? sectionType}`,
    `求职身份：${identity}`,
    `目标岗位：${targetRole}`,
    `目标行业：${targetIndustry}`,
    draft.target.cities ? `目标城市：${draft.target.cities}` : "",
    draft.basic.status ? `当前状态：${draft.basic.status}` : "",
    "",
    "用户原文：",
    originalContent?.trim() || "用户尚未填写具体内容。",
    "",
    "输出要求：",
    actionGuide[action] ?? actionGuide.polish,
    "只输出可粘贴进简历字段的正文，不要输出解释、标题、JSON或Markdown代码块。",
    "不能虚构公司、学校、项目、证书、奖项、经历、数字或成果。",
    "如果信息不足，请输出可直接填写的方向性文本，并用“可补充：”提示用户需要补充的真实信息。",
    "语言使用中文，表达自然、克制、专业。",
  ].filter(Boolean).join("\n");
}

function identityLabel(value) {
  return identityOptions.find((option) => option.value === value)?.label || "未选择";
}

function resumeNameForIdentity(value) {
  if (value === "professional") return "我的岗位定制简历";
  if (value === "graduate") return "我的应届简历";
  return "我的校招简历";
}

function templateForIdentity(value) {
  return value === "professional" ? "social" : "campus";
}

function normalizeGeneratedText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeGeneratedText(item)).filter(Boolean).join("、");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map((item) => normalizeGeneratedText(item)).filter(Boolean).join("；");
  }
  return String(value ?? "").trim();
}

function normalizeEvidenceText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。；;、,.|/\\()[\]（）【】《》<>:："'“”‘’_-]/g, "");
}

function hasSourceEvidence(value, sourceText) {
  const valueText = normalizeEvidenceText(value);
  const source = normalizeEvidenceText(sourceText);
  if (!valueText) return false;
  if (source.includes(valueText)) return true;
  if (valueText.length < 4) return source.includes(valueText);

  const chunks = new Set();
  for (let index = 0; index <= valueText.length - 2; index += 1) {
    const chunk = valueText.slice(index, index + 2);
    if (!/^\d+$/.test(chunk)) chunks.add(chunk);
  }
  const matched = [...chunks].filter((chunk) => source.includes(chunk)).length;
  return matched >= Math.min(3, Math.max(2, Math.ceil(chunks.size * 0.5)));
}

function keepOnlyIfProvided(value, sourceText) {
  const text = normalizeGeneratedText(value);
  return text && hasSourceEvidence(text, sourceText) ? text : "";
}

function clearUnsupportedPlaceholders(value, sourceText) {
  const text = normalizeGeneratedText(value);
  if (!text) return "";
  const riskyPatterns = [
    /张三|李四|王五|赵六/,
    /example\.com/i,
    /13800138000|188[-\s]?8888[-\s]?8888/,
    /北京大学|清华大学|复旦大学|上海交通大学|浙江大学/,
    /XX大学|某大学|某科技|某公司|阿里巴巴|腾讯|字节跳动|百度/,
    /某互联网公司|某平台|某学校|某项目/,
    /\d+%/,
  ];
  const hasRisk = riskyPatterns.some((pattern) => pattern.test(text));
  if (hasRisk && !hasSourceEvidence(text, sourceText)) return "";
  return text;
}

function sanitizeGeneratedResumePayload(generatedPayload, inputText, currentDraft) {
  const generated = generatedPayload && typeof generatedPayload === "object" ? { ...generatedPayload } : {};
  const sourceText = [
    inputText,
    currentDraft?.basic?.name,
    currentDraft?.basic?.phone,
    currentDraft?.basic?.email,
    currentDraft?.basic?.city,
    currentDraft?.education?.map((item) => [item.school, item.major].filter(Boolean).join(" ")).join(" "),
    currentDraft?.experience?.map((item) => [item.company, item.role].filter(Boolean).join(" ")).join(" "),
    currentDraft?.projects?.map((item) => item.name).filter(Boolean).join(" "),
  ].filter(Boolean).join("\n");

  if (generated.basic && typeof generated.basic === "object") {
    generated.basic = {
      ...generated.basic,
      name: keepOnlyIfProvided(generated.basic.name, sourceText),
      phone: keepOnlyIfProvided(generated.basic.phone, sourceText),
      email: keepOnlyIfProvided(generated.basic.email, sourceText),
      city: keepOnlyIfProvided(generated.basic.city, sourceText),
      photoName: "",
    };
  }

  if (Array.isArray(generated.education)) {
    generated.education = generated.education.map((item) => ({
      ...item,
      school: keepOnlyIfProvided(item?.school, sourceText),
    }));
  }

  if (Array.isArray(generated.experience)) {
    generated.experience = generated.experience.map((item) => ({
      ...item,
      company: keepOnlyIfProvided(item?.company, sourceText),
      content: clearUnsupportedPlaceholders(item?.content, sourceText),
      achievements: clearUnsupportedPlaceholders(item?.achievements, sourceText),
      management: clearUnsupportedPlaceholders(item?.management, sourceText),
    }));
  }

  if (Array.isArray(generated.projects)) {
    generated.projects = generated.projects.map((item) => ({
      ...item,
      name: keepOnlyIfProvided(item?.name, sourceText),
      background: clearUnsupportedPlaceholders(item?.background, sourceText),
      responsibility: clearUnsupportedPlaceholders(item?.responsibility, sourceText),
      skills: clearUnsupportedPlaceholders(item?.skills, sourceText),
      result: clearUnsupportedPlaceholders(item?.result, sourceText),
    }));
  }

  if (generated.summary) {
    generated.summary = clearUnsupportedPlaceholders(generated.summary, sourceText);
  }

  return generated;
}

function extractJsonCandidate(text) {
  const cleaned = String(text ?? "")
    .replace(/```(?:json|javascript|js|text)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return cleaned.slice(start, end + 1);
}

function parseGeneratedResumePayload(text) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object") return null;
    const resume = parsed.resume && typeof parsed.resume === "object"
      ? parsed.resume
      : (parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data) ? parsed.data : parsed);
    return {
      ...parsed,
      resume,
    };
  } catch {
    return null;
  }
}

function normalizeGeneratedCollection(list, factory, mapper) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      const empty = factory();
      const mapped = mapper(item ?? {});
      const hasContent = Object.values(mapped).some((value) => String(value ?? "").trim());
      return hasContent ? { ...empty, ...mapped, id: empty.id } : null;
    })
    .filter(Boolean);
}

function mergeGeneratedResumeDraft(currentDraft, generatedPayload) {
  const generated = generatedPayload ?? {};
  const next = normalizeDraft(currentDraft);
  const generatedIdentity = ["student", "graduate", "professional"].includes(generated.identity)
    ? generated.identity
    : next.identity;
  const nextIdentity = generatedIdentity || next.identity || "student";

  if (nextIdentity) {
    next.identity = nextIdentity;
    next.resumeName = normalizeGeneratedText(generated.resumeName) || next.resumeName || resumeNameForIdentity(nextIdentity);
  }

  if (templates.some((item) => item.id === generated.templateId)) {
    next.templateId = generated.templateId;
  } else if (nextIdentity === "professional" && next.templateId === "campus") {
    next.templateId = "social";
  } else if (nextIdentity && nextIdentity !== "professional" && !next.templateId) {
    next.templateId = "campus";
  }

  if (generated.basic && typeof generated.basic === "object") {
    next.basic = {
      ...next.basic,
      name: normalizeGeneratedText(generated.basic.name) || next.basic.name,
      phone: normalizeGeneratedText(generated.basic.phone) || next.basic.phone,
      email: normalizeGeneratedText(generated.basic.email) || next.basic.email,
      city: normalizeGeneratedText(generated.basic.city) || next.basic.city,
      status: normalizeGeneratedText(generated.basic.status) || next.basic.status,
      photoName: next.basic.photoName,
    };
  }

  if (generated.target && typeof generated.target === "object") {
    next.target = {
      ...next.target,
      role: normalizeGeneratedText(generated.target.role) || next.target.role,
      cities: normalizeGeneratedText(generated.target.cities) || next.target.cities,
      industry: normalizeGeneratedText(generated.target.industry) || next.target.industry,
      jobType: normalizeGeneratedText(generated.target.jobType) || next.target.jobType,
      recruitType: normalizeGeneratedText(generated.target.recruitType) || next.target.recruitType,
    };
  }

  const education = normalizeGeneratedCollection(generated.education, createEmptyEducation, (item) => ({
    school: normalizeGeneratedText(item.school),
    major: normalizeGeneratedText(item.major),
    degree: normalizeGeneratedText(item.degree),
    start: normalizeGeneratedText(item.start),
    end: normalizeGeneratedText(item.end),
    gpa: normalizeGeneratedText(item.gpa),
    courses: normalizeGeneratedText(item.courses),
    campus: normalizeGeneratedText(item.campus),
  }));
  if (education.length) next.education = education;

  const experience = normalizeGeneratedCollection(generated.experience, createEmptyExperience, (item) => ({
    company: normalizeGeneratedText(item.company),
    role: normalizeGeneratedText(item.role),
    department: normalizeGeneratedText(item.department),
    start: normalizeGeneratedText(item.start),
    end: normalizeGeneratedText(item.end),
    content: normalizeGeneratedText(item.content),
    achievements: normalizeGeneratedText(item.achievements),
    management: normalizeGeneratedText(item.management),
  }));
  if (experience.length) next.experience = experience;

  const projects = normalizeGeneratedCollection(generated.projects, createEmptyProject, (item) => ({
    name: normalizeGeneratedText(item.name),
    role: normalizeGeneratedText(item.role),
    time: normalizeGeneratedText(item.time),
    background: normalizeGeneratedText(item.background),
    responsibility: normalizeGeneratedText(item.responsibility),
    skills: normalizeGeneratedText(item.skills),
    result: normalizeGeneratedText(item.result),
    link: normalizeGeneratedText(item.link),
  }));
  if (projects.length) next.projects = projects;

  if (generated.extras && typeof generated.extras === "object") {
    next.extras = {
      ...next.extras,
      professionalSkills: normalizeGeneratedText(generated.extras.professionalSkills) || next.extras.professionalSkills,
      tools: normalizeGeneratedText(generated.extras.tools) || next.extras.tools,
      programmingLanguages: normalizeGeneratedText(generated.extras.programmingLanguages) || next.extras.programmingLanguages,
      languageAbility: normalizeGeneratedText(generated.extras.languageAbility) || next.extras.languageAbility,
      certificates: normalizeGeneratedText(generated.extras.certificates) || next.extras.certificates,
      awards: normalizeGeneratedText(generated.extras.awards) || next.extras.awards,
      campusActivities: normalizeGeneratedText(generated.extras.campusActivities) || next.extras.campusActivities,
      strengths: normalizeGeneratedText(generated.extras.strengths) || next.extras.strengths,
    };
  }

  next.summary = normalizeGeneratedText(generated.summary) || next.summary;
  next.flowStage = Number.isFinite(generated.flowStage) ? generated.flowStage : next.flowStage;
  next.missingFields = normalizeStringList(generated.missingFields);
  next.followUpQuestions = normalizeStringList(generated.followUpQuestions);
  next.sessionId = normalizeGeneratedText(generated.sessionId) || normalizeGeneratedText(generated.generationSessionId) || next.sessionId;
  return normalizeDraft(next);
}

function deriveFlowStage(draft) {
  const hasStructuredContent = Boolean(
    draft.summary
    || draft.education.length
    || draft.experience.length
    || draft.projects.length
    || draft.extras.professionalSkills
    || draft.extras.strengths
  );
  if (hasStructuredContent && draft.templateId) return 2;
  if (draft.identity || draft.basic.name || draft.target.role) return 1;
  return 0;
}

function deriveGenerationStatus(draft) {
  if (draft?.generationStatus) return draft.generationStatus;
  return deriveFlowStage(draft) === 2 ? "success" : "idle";
}

function hasMeaningfulDraftContent(draft) {
  const current = normalizeDraft(draft);
  const hasObjectText = (value) => Object.values(value ?? {}).some((item) => String(item ?? "").trim());
  const hasListText = (list) => list.some((item) => hasObjectText(item));
  return Boolean(
    current.identity
    || hasObjectText(current.basic)
    || hasObjectText(current.target)
    || hasListText(current.education)
    || hasListText(current.experience)
    || hasListText(current.projects)
    || hasObjectText(current.extras)
    || String(current.summary ?? "").trim()
  );
}

function hasScrollablePreviewContent(draft) {
  const current = normalizeDraft(draft);
  const hasObjectText = (value) => Object.values(value ?? {}).some((item) => String(item ?? "").trim());
  const hasListText = (list) => list.some((item) => hasObjectText(item));
  return Boolean(
    hasListText(current.education)
    || hasListText(current.experience)
    || hasListText(current.projects)
    || hasObjectText(current.extras)
    || String(current.summary ?? "").trim()
  );
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeGeneratedResumeShape(resume) {
  if (!resume || typeof resume !== "object" || Array.isArray(resume)) return resume;
  const next = { ...resume };

  if (Array.isArray(next.education)) {
    next.education = next.education.map((item) => ({
      ...item,
      school: normalizeGeneratedText(item.school),
      major: normalizeGeneratedText(item.major),
      degree: normalizeGeneratedText(item.degree),
      start: normalizeGeneratedText(item.start ?? item.startDate),
      end: normalizeGeneratedText(item.end ?? item.endDate),
      gpa: normalizeGeneratedText(item.gpa),
      courses: normalizeGeneratedText(item.courses),
      campus: normalizeGeneratedText(item.campus),
    }));
  }

  if (Array.isArray(next.experience)) {
    next.experience = next.experience.map((item) => ({
      ...item,
      company: normalizeGeneratedText(item.company),
      role: normalizeGeneratedText(item.role),
      department: normalizeGeneratedText(item.department),
      start: normalizeGeneratedText(item.start ?? item.startDate),
      end: normalizeGeneratedText(item.end ?? item.endDate),
      content: normalizeGeneratedText(item.content ?? item.description),
      achievements: normalizeGeneratedText(item.achievements),
      management: normalizeGeneratedText(item.management),
    }));
  }

  if (Array.isArray(next.projects)) {
    next.projects = next.projects.map((item) => ({
      ...item,
      name: normalizeGeneratedText(item.name ?? item.projectName),
      role: normalizeGeneratedText(item.role),
      time: normalizeGeneratedText(item.time ?? item.period),
      background: normalizeGeneratedText(item.background ?? item.context),
      responsibility: normalizeGeneratedText(item.responsibility ?? item.description),
      skills: normalizeGeneratedText(item.skills ?? item.techStack),
      result: normalizeGeneratedText(item.result ?? item.outcome),
      link: normalizeGeneratedText(item.link),
    }));
  }

  return next;
}

function assessResumeInputCompleteness(draft, inputText, targetJobContext) {
  const sourceText = [
    inputText,
    draft.identity,
    draft.basic.name,
    draft.basic.city,
    draft.target.role,
    draft.target.industry,
    targetJobContext?.company,
    targetJobContext?.role,
    draft.education.map((item) => [item.school, item.major, item.degree, item.start, item.end].filter(Boolean).join(" ")).join(" "),
    draft.experience.map((item) => [item.company, item.role, item.content, item.achievements, item.management].filter(Boolean).join(" ")).join(" "),
    draft.projects.map((item) => [item.name, item.role, item.background, item.responsibility, item.skills, item.result].filter(Boolean).join(" ")).join(" "),
    Object.values(draft.extras).join(" "),
    draft.summary,
  ].filter(Boolean).join("\n");

  const educationRows = draft.education.filter((item) => item.school || item.major || item.degree || item.start || item.end);
  const hasSchool = /学校|大学|学院|本科|专科|硕士|博士|在读|毕业|应届|年级/.test(sourceText) || educationRows.some((item) => Boolean(item.school));
  const hasMajorOrDegree = /专业|学历|学位|大专|本科|硕士|博士|专科|研究生/.test(sourceText) || educationRows.some((item) => Boolean(item.major || item.degree));
  const hasEducationTime = /20\d{2}|毕业|入学|至今/.test(sourceText) || educationRows.some((item) => Boolean(item.start || item.end));
  const hasTarget = Boolean(draft.target.role || draft.target.industry || draft.target.jobType || /岗位|求职|投递|前端|后端|产品|测试|运营|算法|设计|Java|React|Vue|Python/.test(sourceText));
  const hasExperience = draft.experience.some((item) => Boolean(item.company || item.role || item.content || item.achievements || item.management))
    || draft.projects.some((item) => Boolean(item.name || item.background || item.responsibility || item.result))
    || /实习|工作|项目|校园|社团|竞赛|志愿|比赛|课程设计/.test(sourceText);
  const hasSkills = Boolean(Object.values(draft.extras).some((value) => String(value ?? "").trim()))
    || /熟悉|掌握|会|Java|Python|React|Vue|MySQL|SQL|Spring|C\+\+|C#|Go|Node|HTML|CSS|JavaScript|TypeScript|Excel|PPT|PS|Figma/.test(sourceText);
  const hasResults = /提升|优化|增长|降低|完成|负责|参与|独立|获奖|证书|排名|通过|成交|转化|\d+%|\d+人|\d+万/.test(sourceText);

  const missingFields = [];
  if (!hasSchool) missingFields.push("学校");
  if (!hasMajorOrDegree) missingFields.push("专业");
  if (!hasEducationTime) missingFields.push("毕业时间");
  if (!hasTarget) missingFields.push("目标岗位");
  if (!hasExperience) missingFields.push("实习 / 项目 / 校园经历");
  if (!hasSkills) missingFields.push("技能");
  if (!hasResults) missingFields.push("职责或成果");

  const score = [hasSchool, hasMajorOrDegree, hasEducationTime, hasTarget, hasExperience, hasSkills, hasResults].filter(Boolean).length;
  const isSparse = score <= 3 || missingFields.length >= 3;
  const knownFacts = [
    draft.identity ? `身份：${identityLabel(draft.identity)}` : "",
    draft.basic.name ? `姓名：${draft.basic.name}` : "",
    draft.target.role ? `目标岗位：${draft.target.role}` : "",
    draft.target.industry ? `目标行业：${draft.target.industry}` : "",
    draft.basic.city ? `城市：${draft.basic.city}` : "",
    educationRows.map((item) => [item.school, item.major, item.degree, item.start || item.end ? `${formatDate(item.start)}-${formatDate(item.end)}` : ""].filter(Boolean).join(" / ")).join("；"),
  ].filter(Boolean);
  const followUpQuestions = [];
  if (!hasSchool) followUpQuestions.push("你的学校是什么？");
  if (!hasMajorOrDegree) followUpQuestions.push("你的专业和学历是什么？");
  if (!hasEducationTime) followUpQuestions.push("哪一年毕业或者预计什么时候毕业？");
  if (!hasExperience) followUpQuestions.push("有没有实习、项目或校园经历？");
  if (!hasSkills) followUpQuestions.push("你熟悉哪些技能或工具？");
  if (!hasTarget) followUpQuestions.push("你想投什么岗位或方向？");
  if (!hasResults) followUpQuestions.push("有没有能体现职责或成果的内容？");

  return {
    isSparse,
    missingFields,
    followUpQuestions: followUpQuestions.slice(0, 5),
    score,
    sourceText,
    knownFacts,
    hasEducationTime,
    hasResults,
  };
}

function buildNaturalResumePrompt({ draft, inputText, targetJobContext, assessment, forceGenerate = false }) {
  const existingDraft = {
    identity: draft.identity,
    basic: draft.basic,
    target: draft.target,
    education: draft.education,
    experience: draft.experience,
    projects: draft.projects,
    extras: draft.extras,
    summary: draft.summary,
    templateId: draft.templateId,
  };

  return [
    "你是专业中文求职简历编辑助手。",
    "目标：把用户提供的真实经历整理成专业、结构化、适合招聘筛选的简历。",
    "必须遵守：",
    "1. 不得虚构事实。",
    "2. 可以润色表达。",
    "3. 可以拆分用户已有职责。",
    "4. 可以重组结构。",
    "5. 不得编造公司、项目、时间、数字、成果。",
    "6. 缺失信息必须明确返回 missingFields。",
    "7. 可以返回 followUpQuestions。",
    "8. 没有真实量化数据时不得编造百分比。",
    "9. 根据身份调整内容重点：在校生和应届生优先教育、项目、校园；有工作经验者优先工作、项目、业务结果和技能。当前未选择身份时，必须根据用户描述推断 identity；仍无法判断时使用 student。",
    "10. 输出必须能写入当前 Resume Builder 数据结构。",
    "必须只返回严格 JSON，不要返回解释、标题、Markdown 或代码块。",
    "JSON 顶层字段建议包含：resume、missingFields、followUpQuestions。",
    "resume 必须包含：resumeName、identity、templateId、basic、target、education、experience、projects、extras、summary。",
    "identity 只能是 student、graduate、professional；templateId 只能是 campus 或 social。",
    "basic 字段：name、phone、email、city、status、photoName。",
    "target 字段：role、cities、industry、jobType、recruitType。",
    "education 数组字段：school、major、degree、start、end、gpa、courses、campus。",
    "experience 数组字段：company、role、department、start、end、content、achievements、management。",
    "projects 数组字段：name、role、time、background、responsibility、skills、result、link。",
    "字段名必须严格使用上述当前 Builder 数据结构，不要返回 startDate、endDate、projectName、description 这类别名字段。",
    "extras 字段：professionalSkills、tools、programmingLanguages、languageAbility、certificates、awards、campusActivities、strengths。",
    "如果信息不足，resume 中无法确认的字段保持空字符串或空数组，不得脑补。",
    "如果信息不足，missingFields 和 followUpQuestions 要明确返回；followUpQuestions 控制在 3 到 5 个。",
    "如果用户选择“先生成看看”，也只能基于已知信息生成，缺失项保持空白或待补充。",
    `当前选择身份：${identityLabel(draft.identity)}`,
    targetJobContext ? `目标岗位上下文：${targetJobContext.company || ""} ${targetJobContext.role || ""}` : "",
    assessment?.knownFacts?.length ? `已识别的真实信息：${assessment.knownFacts.join("；")}` : "",
    assessment?.missingFields?.length ? `当前缺失项：${assessment.missingFields.join("、")}` : "",
    assessment?.followUpQuestions?.length ? `建议追问：${assessment.followUpQuestions.join("；")}` : "",
    `生成模式：${forceGenerate ? "允许先生成看看" : "优先补全后生成"}`,
    "当前已填写草稿，仅用于保留已有真实信息：",
    JSON.stringify(existingDraft),
    "用户自然语言描述：",
    inputText.trim(),
  ].filter(Boolean).join("\n");
}

const generationStatusText = {
  idle: {
    label: "待生成",
    description: "在左侧输入你的信息，AI将为你生成专属简历",
  },
  generating: {
    label: "生成中...",
    description: "AI正在读取你的输入并整理简历结构，请稍候",
  },
  success: {
    label: "已生成",
    description: "简历已根据真实 AI 返回内容同步更新，可继续完善或下载",
  },
  error: {
    label: "生成失败，请重试",
    description: "AI生成失败，请稍后重试",
  },
};

function getGenerationStatusCopy(status, errorMessage) {
  const copy = generationStatusText[status] ?? generationStatusText.idle;
  return {
    ...copy,
    description: status === "error" && errorMessage ? errorMessage : copy.description,
  };
}

export default function ResumeBuilderWorkspace({ onExit, navigate, targetJobContext }) {
  const isEditMode = Boolean(targetJobContext?.mode === "edit" && targetJobContext?.resumeId);
  const initialDraftRef = useRef(null);
  if (initialDraftRef.current === null) {
    initialDraftRef.current = isEditMode ? loadDraft() : loadCurrentGenerationDraft(targetJobContext);
  }
  const initialDraft = initialDraftRef.current;
  const [draft, setDraft] = useState(() => initialDraft);
  const [mobileView, setMobileView] = useState("form");
  const [flowStage, setFlowStage] = useState(() => initialDraft.flowStage ?? deriveFlowStage(initialDraft));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [aiPanel, setAiPanel] = useState(null);
  const [generatingCoursesId, setGeneratingCoursesId] = useState("");
  const [isGeneratingResume, setIsGeneratingResume] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [generationStatus, setGenerationStatus] = useState(() => deriveGenerationStatus(initialDraft));
  const [generationError, setGenerationError] = useState(() => initialDraft.generationError ?? "");
  const [notice, setNotice] = useState("当前保存为本地草稿");
  const [chatInput, setChatInput] = useState(() => initialDraft.chatInput ?? "");
  const [messages, setMessages] = useState(() => [
    {
      id: "intro",
      role: "assistant",
      text: "我是小律 · AI简历生成助手。这里会用结构化表单一步步帮你完成简历，右侧预览只展示你真实填写的数据。",
    },
  ]);
  const steps = useMemo(() => getSteps(draft.identity), [draft.identity]);
  const activeStep = steps[Math.min(draft.currentStep, steps.length - 1)];
  const completion = Math.round((countRequiredDone(draft) / steps.length) * 100);
  const missing = getMissingItems(draft);
  const selectedTemplate = templates.find((item) => item.id === draft.templateId) ?? templates[0];
  const generationStatusCopy = getGenerationStatusCopy(generationStatus, generationError);
  const generationAssessment = useMemo(
    () => assessResumeInputCompleteness(draft, chatInput, targetJobContext),
    [draft, chatInput, targetJobContext],
  );
  const canDownloadResume = generationStatus === "success" || (isEditMode && hasMeaningfulDraftContent(draft));
  const generationStatusDescription = generationStatus === "success" && generationAssessment.missingFields.length
    ? `已生成，但建议补充 ${generationAssessment.missingFields.length} 项信息，可继续去高级AI编辑完善。`
    : generationStatusCopy.description;
  const previewIsStatic = generationStatus !== "success" && !hasScrollablePreviewContent(draft);
  const conversationRef = useRef(null);
  const leftPanelRef = useRef(null);
  const previewPaperRef = useRef(null);
  const advancedPanelRef = useRef(null);
  const aiPanelRequestRef = useRef(0);
  const generationSessionRef = useRef(0);
  const generationRequestRef = useRef(0);

  useLayoutEffect(() => {
    const container = previewPaperRef.current;
    if (!container) return undefined;

    if (!previewIsStatic) {
      container.style.removeProperty("--builder-preview-scale");
      return undefined;
    }

    const paper = container.querySelector(".builder-resume-paper");
    if (!paper) return undefined;

    const updateScale = () => {
      const style = window.getComputedStyle(container);
      const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const availableWidth = Math.max(1, container.clientWidth - horizontalPadding);
      const availableHeight = Math.max(1, container.clientHeight - verticalPadding);
      const paperWidth = Math.max(1, paper.offsetWidth);
      const paperHeight = Math.max(1, paper.scrollHeight);
      const scale = Math.max(0.1, Math.min(1, availableWidth / paperWidth, availableHeight / paperHeight));
      container.style.setProperty("--builder-preview-scale", String(scale));
    };

    updateScale();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateScale) : null;
    observer?.observe(container);
    observer?.observe(paper);
    window.addEventListener("resize", updateScale);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateScale);
      container.style.removeProperty("--builder-preview-scale");
    };
  }, [previewIsStatic, draft.templateId]);

  useEffect(() => {
    const container = conversationRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages.length, draft.currentStep, aiPanel]);

  useEffect(() => {
    updateDraft((current) => (
      current.chatInput === chatInput
        ? current
        : { ...current, chatInput }
    ));
  }, [chatInput]);

  useEffect(() => {
    updateDraft((current) => (
      current.generationStatus === generationStatus && (current.generationError ?? "") === (generationError ?? "")
        ? current
        : { ...current, generationStatus, generationError }
    ));
  }, [generationStatus, generationError]);

  useEffect(() => {
    try {
      saveDraft(draft);
    } catch {
      setNotice("草稿自动保存失败，请点击保存草稿重试。");
    }
  }, [draft]);

  useEffect(() => {
    updateDraft((current) => (
      current.flowStage === flowStage
        ? current
        : { ...current, flowStage }
    ));
  }, [flowStage]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const step = steps[draft.currentStep];
    if (!step) return;
    setMessages((current) => {
      const id = `step_${step.key}_${draft.currentStep}_${draft.identity || "unset"}`;
      if (current.some((message) => message.id === id)) return current;
      return [...current, { id, role: "assistant", text: step.assistant }];
    });
  }, [draft.currentStep, draft.identity, steps]);

  function updateDraft(updater) {
    setDraft((current) => normalizeDraft(typeof updater === "function" ? updater(current) : updater));
  }

  function patchSection(section, patch) {
    updateDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...patch,
      },
    }));
  }

  function updateTemplate(templateId) {
    updateDraft((current) => ({ ...current, templateId }));
    if (generationStatus === "success" || isEditMode) setFlowStage(2);
  }

  function openAdvancedEditor(stepIndex = draft.currentStep) {
    setAdvancedOpen(true);
    if (Number.isFinite(stepIndex)) {
      updateDraft((current) => ({ ...current, currentStep: Math.min(Math.max(stepIndex, 0), steps.length - 1) }));
    }
    window.setTimeout(() => advancedPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function closeAdvancedEditor() {
    setAdvancedOpen(false);
    window.requestAnimationFrame(() => leftPanelRef.current?.scrollTo({ top: 0, behavior: "auto" }));
  }

  function updateCollection(section, id, patch) {
    updateDraft((current) => ({
      ...current,
      [section]: current[section].map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function addCollectionItem(section) {
    const factory = section === "education" ? createEmptyEducation : section === "experience" ? createEmptyExperience : createEmptyProject;
    updateDraft((current) => ({ ...current, [section]: [...current[section], factory()] }));
  }

  function removeCollectionItem(section, id) {
    updateDraft((current) => ({ ...current, [section]: current[section].filter((item) => item.id !== id) }));
  }

  function moveCollectionItem(section, index, direction) {
    updateDraft((current) => ({ ...current, [section]: moveItem(current[section], index, direction) }));
  }

  function completeStep() {
    setMessages((current) => [
      ...current,
      {
        id: `done_${activeStep.key}_${Date.now()}`,
        role: "user",
        text: `已保存：${activeStep.title}`,
      },
    ]);
    updateDraft((current) => ({ ...current, currentStep: Math.min(current.currentStep + 1, steps.length - 1) }));
  }

  function skipStep() {
    setMessages((current) => [...current, { id: `skip_${Date.now()}`, role: "user", text: `暂时跳过：${activeStep.title}` }]);
    updateDraft((current) => ({ ...current, currentStep: Math.min(current.currentStep + 1, steps.length - 1) }));
  }

  function previousStep() {
    updateDraft((current) => ({ ...current, currentStep: Math.max(0, current.currentStep - 1) }));
  }

  function saveCurrentBuilderDraft() {
    try {
      const sessionId = draft.sessionId || window.sessionStorage.getItem(BUILDER_SESSION_KEY) || createBuilderSessionId();
      window.sessionStorage.setItem(BUILDER_SESSION_KEY, sessionId);
      const snapshot = saveDraft(normalizeDraft({
        ...draft,
        sessionId,
        chatInput,
        generationStatus,
        generationError,
        flowStage,
      }));
      setDraft(snapshot);
      setNotice("草稿已保存");
      return snapshot;
    } catch {
      setNotice("草稿保存失败，请稍后重试。");
      return null;
    }
  }

  function resetGenerationSession({ preserveTemplate = true } = {}) {
    const nextSessionId = createBuilderSessionId();
    window.sessionStorage.setItem(BUILDER_SESSION_KEY, nextSessionId);
    generationSessionRef.current += 1;
    generationRequestRef.current += 1;
    window.localStorage.removeItem(BUILDER_DRAFT_KEY);
    setDraft(createGenerationDraft(preserveTemplate ? draft.templateId : "campus", targetJobContext, nextSessionId));
    setChatInput("");
    setMobileView("form");
    setAiPanel(null);
    closeAdvancedEditor();
    setGeneratingCoursesId("");
    setIsGeneratingResume(false);
    setIsGeneratingSummary(false);
    setGenerationStatus("idle");
    setGenerationError("");
    setFlowStage(0);
    setMessages([{ id: `restart_${Date.now()}`, role: "assistant", text: "已重新开始。请直接输入本轮经历内容，我会根据描述判断求职身份。" }]);
    setNotice("\u5df2\u5f00\u59cb\u65b0\u7684AI\u7b80\u5386\u751f\u6210\u4f1a\u8bdd\uff0c\u4e0a\u4e00\u8f6e\u5de5\u4f5c\u533a\u5185\u5bb9\u5df2\u6e05\u7a7a\u3002");
    return true;
  }

  function handleReturn() {
    const snapshot = saveCurrentBuilderDraft();
    if (!snapshot) return;
    generationSessionRef.current += 1;
    generationRequestRef.current += 1;
    if (typeof onExit === "function") onExit();
    else if (typeof navigate === "function") navigate("/dashboard");
    else window.history.back();
  }

  function restart() {
    setResetConfirmOpen(true);
  }

  function restoreDraft() {
    const restored = loadDraft();
    setDraft(restored);
    setFlowStage(restored.flowStage ?? deriveFlowStage(restored));
    setMessages((current) => [...current, { id: `restore_${Date.now()}`, role: "assistant", text: "已恢复本地草稿。" }]);
  }

  async function generateResumeFromNaturalInput({ forceGenerate = false } = {}) {
    const value = chatInput.trim();
    if (isGeneratingResume) return;
    if (!value) {
      setNotice("请先告诉小律你的教育背景、实习/工作经历、项目经验或技能特长。");
      return;
    }

    if (generationAssessment.isSparse && !forceGenerate) {
      setGenerationStatus((current) => (current === "error" || current === "generating" ? "idle" : current));
      setGenerationError("");
      setFlowStage((current) => Math.max(current, 1));
      setNotice("小律还需要了解一些关键内容，下面已经列出 3 到 5 个问题。你也可以点“先生成看看”。");
      setMessages((current) => [
        ...current,
        {
          id: `followup_${Date.now()}`,
          role: "assistant",
          text: generationAssessment.followUpQuestions.length
            ? `小律还需要了解：${generationAssessment.followUpQuestions.join("；")}`
            : "小律还需要了解一些关键内容，补充后能生成更完整的简历。",
        },
      ]);
      return;
    }

    const sessionId = generationSessionRef.current;
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;

    setIsGeneratingResume(true);
    setGenerationStatus("generating");
    setGenerationError("");
    setFlowStage(1);
    setNotice("AI正在整理你的经历，并同步生成简历草稿...");
    setMessages((current) => [
      ...current,
      { id: `simple_user_${Date.now()}`, role: "user", text: value },
      { id: `simple_ai_wait_${Date.now()}`, role: "assistant", text: "收到。我会只基于你提供的真实信息进行结构化整理，不会替你编造经历或结果。" },
    ]);

    try {
      const answer = await sendResumeAssistantJsonMessage({
        mode: "generate",
        message: buildNaturalResumePrompt({
          draft,
          inputText: value,
          targetJobContext,
          assessment: generationAssessment,
          forceGenerate,
        }),
      });
      if (generationSessionRef.current !== sessionId || generationRequestRef.current !== requestId) return;
      const generated = parseGeneratedResumePayload(answer);
      if (!generated) {
        throw new Error("AI返回内容暂时无法直接同步到简历结构，请稍后重试，或打开高级AI编辑手动填写。");
      }

      const resumePayload = normalizeGeneratedResumeShape(
        generated.resume && typeof generated.resume === "object" ? generated.resume : generated,
      );
      const sanitizedResume = sanitizeGeneratedResumePayload(resumePayload, value, draft);
      const finalPayload = {
        ...sanitizedResume,
        missingFields: normalizeStringList(generated.missingFields),
        followUpQuestions: normalizeStringList(generated.followUpQuestions),
        flowStage: Number.isFinite(generated.flowStage) ? generated.flowStage : 2,
        sessionId,
      };
      const nextDraft = mergeGeneratedResumeDraft(draft, finalPayload);
      const nextAssessment = assessResumeInputCompleteness(nextDraft, value, targetJobContext);

      setDraft(saveDraft(nextDraft));
      setGenerationStatus("success");
      setGenerationError("");
      const missingCount = finalPayload.missingFields?.length || nextAssessment.missingFields.length;
      setNotice(missingCount
        ? `已生成 · 建议补充 ${missingCount} 项信息`
        : "AI已整理为简历草稿，右侧预览和高级AI编辑已同步更新。");
      setMessages((current) => [
        ...current,
        {
          id: `simple_ai_done_${Date.now()}`,
          role: "assistant",
          text: missingCount
            ? `已生成简历初稿，仍建议补充 ${missingCount} 项关键信息。你可以继续补充，也可以先生成看看后再完善。`
            : "已生成简历初稿。你可以继续补充信息，也可以打开高级AI编辑检查每个字段。",
        },
      ]);
      setFlowStage(2);
    } catch (error) {
      if (generationSessionRef.current !== sessionId || generationRequestRef.current !== requestId) return;
      setFlowStage(1);
      const message = error.message || "AI生成失败，请稍后重试";
      setGenerationStatus("error");
      setGenerationError(message);
      setNotice(message);
      setMessages((current) => [
        ...current,
        {
          id: `simple_ai_error_${Date.now()}`,
          role: "assistant",
          text: message,
        },
      ]);
    } finally {
      if (generationSessionRef.current === sessionId && generationRequestRef.current === requestId) {
        setIsGeneratingResume(false);
      }
    }
  }

  async function generateSummaryFromCurrentDraft() {
    if (isGeneratingSummary) return;
    const source = [
      draft.target.role ? `目标岗位：${draft.target.role}` : "",
      draft.basic.status ? `当前状态：${draft.basic.status}` : "",
      draft.education.map((item) => [item.school, item.major, item.degree, item.courses, item.campus].filter(Boolean).join("；")).filter(Boolean).join("\n"),
      draft.experience.map((item) => [item.company, item.role, item.content, item.achievements].filter(Boolean).join("；")).filter(Boolean).join("\n"),
      draft.projects.map((item) => [item.name, item.role, item.background, item.responsibility, item.result].filter(Boolean).join("；")).filter(Boolean).join("\n"),
      Object.values(draft.extras).filter(Boolean).join("；"),
      chatInput.trim() ? `补充描述：${chatInput.trim()}` : "",
    ].filter(Boolean).join("\n");

    if (!source) {
      setNotice("请先输入经历或在高级AI编辑中填写一些内容，再生成自我介绍。");
      return;
    }

    setIsGeneratingSummary(true);
    setNotice("AI正在根据已有真实经历生成自我介绍...");
    try {
      const answer = await sendResumeAssistantMessage({
        mode: "generate",
        message: [
          "你是律动求职的 AI 简历助手，请基于以下真实简历内容生成一段简历个人总结。",
          "只输出一段可直接放入简历的中文正文，不要输出标题、解释、JSON 或 Markdown。",
          "不要编造未提供的学校、公司、证书、奖项、数字或成果；信息不足时表达要克制。",
          source,
        ].join("\n"),
      });
      const summary = cleanAiSuggestion(answer);
      if (!summary) throw new Error("AI没有返回可用自我介绍，请稍后重试。");
      updateDraft((current) => ({ ...current, summary, currentStep: Math.max(current.currentStep, 7) }));
      setNotice("已生成自我介绍，并同步到右侧简历预览。");
      setFlowStage((current) => Math.max(current, 1));
    } catch (error) {
      setNotice(error.message || "自我介绍生成失败，请确认后端 AI 服务已启动后重试。");
    } finally {
      setIsGeneratingSummary(false);
    }
  }

  async function runAi(action, sectionType, originalContent = "", target = {}) {
    const endpoint = aiEndpointFor(action);
    const requestId = aiPanelRequestRef.current + 1;
    aiPanelRequestRef.current = requestId;
    setAiPanel({
      action,
      sectionType,
      originalContent,
      endpoint,
      target,
      loading: true,
      error: "",
      suggestion: "AI正在根据当前简历内容生成建议...",
    });
    setNotice("AI辅助填写生成中，请稍候...");

    try {
      const answer = await sendResumeAssistantMessage({
        mode: "generate",
        message: buildAiAssistPrompt({ action, sectionType, originalContent, draft, targetJobContext }),
      });
      if (aiPanelRequestRef.current !== requestId) return;
      const suggestion = cleanAiSuggestion(answer);
      if (!suggestion) throw new Error("AI没有返回可用文本，请稍后重试。");
      setAiPanel((current) => current && current.action === action
        ? { ...current, loading: false, error: "", suggestion }
        : current);
      setNotice("AI建议已生成，点击“接受”即可写入当前简历字段。");
    } catch (error) {
      if (aiPanelRequestRef.current !== requestId) return;
      setAiPanel((current) => current && current.action === action
        ? {
            ...current,
            loading: false,
            error: error.message || "AI辅助填写失败，请确认后端AI服务已启动后重试。",
            suggestion: "",
          }
        : current);
      setNotice(error.message || "AI辅助填写失败，请确认后端AI服务已启动后重试。");
    }
  }

  function acceptAiSuggestion() {
    if (!aiPanel || aiPanel.loading || aiPanel.error) return;
    const suggestion = cleanAiSuggestion(aiPanel.suggestion);
    if (!suggestion) return;
    const target = aiPanel.target ?? {};

    if (target.field === "summary") {
      updateDraft((current) => ({ ...current, summary: suggestion }));
    } else if (target.collection === "experience" && target.id) {
      updateCollection("experience", target.id, { content: suggestion });
    } else if (target.collection === "projects" && target.id) {
      updateCollection("projects", target.id, {
        responsibility: suggestion,
        background: "",
        skills: "",
        result: "",
      });
    } else if (target.section === "extras") {
      patchSection("extras", {
        professionalSkills: suggestion,
        tools: "",
        languageAbility: "",
        certificates: "",
        awards: "",
        campusActivities: "",
        strengths: "",
      });
    }

    setAiPanel(null);
    setNotice("已接受AI建议并写入简历，可继续手动微调。");
  }

  async function generateMajorCourses(educationItem) {
    if (!educationItem?.id || generatingCoursesId) return;
    const targetRole = draft.target.role || targetJobContext?.role || "目标岗位";
    const major = educationItem.major || "当前专业";
    const degree = educationItem.degree || "当前学历";

    setGeneratingCoursesId(educationItem.id);
    setNotice("正在根据目标岗位生成相关主修课程...");
    try {
      const answer = await sendResumeAssistantMessage({
        mode: "generate",
        message: [
          "请为简历教育经历生成与目标岗位相关的主修课程。",
          "只输出课程名称，用顿号分隔，不要解释，不要编号，不要编造学校经历。",
          `目标岗位：${targetRole}`,
          `专业：${major}`,
          `学历：${degree}`,
          educationItem.courses ? `已有课程：${educationItem.courses}` : "",
        ].filter(Boolean).join("\n"),
      });
      const courses = normalizeCourseSuggestions(answer);
      if (!courses) throw new Error("AI 没有返回可用课程名称");
      updateCollection("education", educationItem.id, { courses });
      setNotice(`已根据“${targetRole}”生成主修课程，可继续手动调整。`);
    } catch (error) {
      setNotice(error.message || "主修课程生成失败，请确认后端 AI 服务已启动后重试。");
    } finally {
      setGeneratingCoursesId("");
    }
  }

  function sendNaturalMessage() {
    const value = chatInput.trim();
    if (!value) return;
    setMessages((current) => [...current, { id: `user_${Date.now()}`, role: "user", text: value }]);
    setChatInput("");
    if (/目标岗位|岗位改成|求职方向/.test(value)) updateDraft((current) => ({ ...current, currentStep: 2 }));
    else if (/学校|教育|学历|专业/.test(value)) updateDraft((current) => ({ ...current, currentStep: 3 }));
    else if (/实习|工作|公司/.test(value)) updateDraft((current) => ({ ...current, currentStep: 4 }));
    else if (/项目/.test(value)) updateDraft((current) => ({ ...current, currentStep: 5 }));
    else if (/技能|证书|获奖|语言|工具/.test(value)) updateDraft((current) => ({ ...current, currentStep: 6 }));
    setMessages((current) => [
      ...current,
      {
        id: `intent_${Date.now()}`,
        role: "assistant",
        text: "我已根据你的补充定位到相关步骤。请在当前表单里修改，右侧简历会同步更新。",
      },
    ]);
  }

  function downloadResume() {
    if (!canDownloadResume) {
      setNotice("\u8bf7\u5148\u5b8c\u6210AI\u751f\u6210\u540e\u518d\u4e0b\u8f7d\u7b80\u5386\u3002");
      return;
    }
    const missingItems = getDownloadMissingItems(draft);
    const paper = previewPaperRef.current?.querySelector(".builder-resume-paper");
    if (!paper) {
      setNotice("未找到右侧简历预览，暂时无法导出。");
      return;
    }
    if (!saveCurrentBuilderDraft()) return;
    const opened = openResumePrintWindow(paper, draft, selectedTemplate);
    setNotice(opened
      ? missingItems.length
        ? `已打开打印预览。当前简历仍缺少：${missingItems.join("、")}，可先导出草稿，后续继续完善。`
        : "已打开打印预览，请选择“另存为 PDF”完成下载。"
      : "浏览器拦截了打印窗口，请允许弹窗后重试。");
  }

  return (
    <section className="resume-builder-workspace" aria-label="AI简历生成工作台">
      <div className="builder-overview">
        <div className="builder-overview-copy">
          <div className="builder-page-title">
            <h1>AI简历生成</h1>
            <span>全新升级</span>
          </div>
          <p>3步完成简历制作，让好简历为你赢得更多机会</p>
        </div>
        <button className="builder-exit-button" type="button" onClick={handleReturn}>退出生成</button>
      </div>

      {notice && (
        <div className="builder-notice-toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}

      <div className="resume-builder-mobile-tabs" role="tablist" aria-label="移动端视图切换">
        <button className={mobileView === "form" ? "active" : ""} type="button" onClick={() => setMobileView("form")}>填写信息</button>
        <button className={mobileView === "preview" ? "active" : ""} type="button" onClick={() => setMobileView("preview")}>简历预览</button>
      </div>

      <section
        className={`builder-left ${advancedOpen ? "is-advanced-open" : ""} ${mobileView === "preview" ? "mobile-hidden" : ""}`}
        ref={leftPanelRef}
      >
        <div className="builder-conversation" ref={conversationRef}>
          <section className="builder-assistant-welcome">
            <div className="builder-bot-orb" aria-hidden="true">律</div>
            <div>
              <strong>你好！我是小律，帮你快速生成专业简历 ✨</strong>
              <p>分享你的学习、实习或工作经历，我会帮你整理成一份打动HR的简历。</p>
            </div>
          </section>

          <div className="builder-flow-steps" aria-label="AI简历生成三步流程">
            {[
              { title: "告诉我你的情况", description: "简单输入，越详细越好" },
              { title: "AI自动整理", description: "智能梳理，生成简历初稿" },
              { title: "选择模板并下载", description: "挑选模板，完善后下载" },
            ].map((item, index) => (
              <div className={`builder-flow-step ${flowStage === index ? "active" : ""} ${flowStage > index ? "done" : ""}`} key={item.title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </div>
              </div>
            ))}
          </div>

          <section className="builder-simple-card" aria-label="简历快速生成">
            <label className="builder-natural-input">
              <span>告诉我你的情况</span>
              <textarea
                value={chatInput}
                rows={5}
                maxLength={2000}
                placeholder={"请输入你的教育背景、实习经历、项目经验、技能特长、获奖情况等……\n例如：我是一名大三学生，计算机专业，做过一个校园二手交易小程序项目，熟悉Python和MySQL……"}
                onChange={(event) => {
                  setChatInput(event.target.value);
                }}
              />
              <small>{chatInput.length} / 2000</small>
            </label>

            {(generationAssessment.isSparse || (generationStatus === "success" && generationAssessment.missingFields.length > 0)) && (
              <p className="builder-followup-inline">
                {generationAssessment.missingFields.length
                  ? <><span className="builder-followup-alert">还需补充</span>：{generationAssessment.missingFields.slice(0, 5).join(" · ")}</>
                  : <>信息还不够完整，<span className="builder-followup-alert">还需补充</span>专业、经历、技能和求职方向。</>}
              </p>
            )}

            <div className="builder-simple-actions">
              <button className="builder-generate-button" type="button" onClick={() => generateResumeFromNaturalInput()} disabled={isGeneratingResume}>
                {isGeneratingResume ? "AI整理中..." : "✨ AI帮我生成"}
              </button>
              <button className="builder-advanced-button" type="button" onClick={() => advancedOpen ? closeAdvancedEditor() : openAdvancedEditor()}>
                高级AI编辑
              </button>
            </div>
          </section>

          <section className="builder-recommend-panel" aria-label="小律推荐">
            <div className="builder-recommend-head">
              <strong>小律推荐：让你的简历更出色</strong>
              <button type="button" onClick={() => setNotice("已为你保留三项最常用的简历辅助能力。")}>换一换</button>
            </div>
            <div className="builder-recommend-grid">
              <button type="button" onClick={() => openAdvancedEditor(4)}>
                <span>01</span>
                <strong>自动拆分经历</strong>
                <small>智能拆分经历段落，结构更清晰</small>
              </button>
              <button type="button" onClick={() => { setNotice(getMissingItems(draft).length ? `当前还缺少：${getMissingItems(draft).join("、")}` : "当前基础结构已比较完整，可以继续检查表达。"); openAdvancedEditor(steps.length - 1); }}>
                <span>02</span>
                <strong>补全简历结构</strong>
                <small>补充缺失模块，简历更完整</small>
              </button>
              <button type="button" onClick={generateSummaryFromCurrentDraft} disabled={isGeneratingSummary}>
                <span>03</span>
                <strong>生成自我介绍</strong>
                <small>{isGeneratingSummary ? "AI生成中..." : "AI生成亮点自我介绍"}</small>
              </button>
            </div>
          </section>

          {advancedOpen && (
            <section className="builder-advanced-panel" ref={advancedPanelRef} aria-label="高级AI编辑">
              <header>
                <div>
                  <span>高级AI编辑</span>
                  <strong>完整专业模式</strong>
                  <p>保留原有详细表单能力，可逐项编辑基本信息、求职意向、教育经历、实习/工作经历、项目经历、技能、奖项和自我评价。</p>
                </div>
                <div className="builder-advanced-tools">
                  <button type="button" onClick={saveCurrentBuilderDraft}>保存草稿</button>
                  <button type="button" onClick={closeAdvancedEditor}>收起</button>
                </div>
              </header>
              <ResumeStepCard
                step={activeStep}
                steps={steps}
                draft={draft}
                patchSection={patchSection}
                updateDraft={updateDraft}
                updateCollection={updateCollection}
                addCollectionItem={addCollectionItem}
                removeCollectionItem={removeCollectionItem}
                moveCollectionItem={moveCollectionItem}
                runAi={runAi}
                generateMajorCourses={generateMajorCourses}
                generatingCoursesId={generatingCoursesId}
                completeStep={completeStep}
                skipStep={skipStep}
                previousStep={previousStep}
              />
            </section>
          )}

          {aiPanel && (
            <section className="builder-ai-panel">
              <div>
                <strong>AI辅助结果</strong>
                <button type="button" onClick={() => setAiPanel(null)}>关闭</button>
              </div>
              <div className="ai-compare-grid">
                <article>
                  <span>原文</span>
                  <p>{aiPanel.originalContent || "当前模块暂无可润色内容。"}</p>
                </article>
                <article>
                  <span>AI建议</span>
                  <p className={aiPanel.error ? "is-error" : ""}>
                    {aiPanel.error || aiPanel.suggestion}
                  </p>
                </article>
              </div>
              <div className="builder-inline-actions">
                <button type="button" onClick={acceptAiSuggestion} disabled={aiPanel.loading || Boolean(aiPanel.error) || !aiPanel.suggestion}>
                  {aiPanel.loading ? "生成中..." : "接受"}
                </button>
                <button type="button" onClick={() => setAiPanel(null)}>拒绝</button>
                <button type="button" onClick={() => runAi(aiPanel.action, aiPanel.sectionType, aiPanel.originalContent, aiPanel.target)} disabled={aiPanel.loading}>重新生成</button>
                <button type="button" onClick={() => setAiPanel(null)}>手动修改</button>
              </div>
            </section>
          )}
        </div>
      </section>

      <section className={`builder-right ${mobileView === "form" ? "mobile-hidden" : ""}`}>
        <header className="builder-preview-head">
          <div>
            <span>简历预览 <em>实时更新</em></span>
            <strong>左侧输入内容后，简历将在这里实时生成</strong>
          </div>
          <div className="builder-preview-tools">
            <div className="builder-template-toggle" role="group" aria-label="简历版本">
              {templates.map((template) => (
                <button
                  className={draft.templateId === template.id ? "active" : ""}
                  type="button"
                  key={template.id}
                  onClick={() => updateTemplate(template.id)}
                >
                  {template.name}
                </button>
              ))}
            </div>
            <label>
              模板：
              <select value={draft.templateId} onChange={(event) => updateTemplate(event.target.value)}>
                {templates.map((template) => (
                  <option value={template.id} key={template.id}>{template.name === "校招版" ? "简约蓝" : template.name}</option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className={`builder-preview-scroll ${previewIsStatic ? "is-static-preview" : "is-scrollable-preview"}`} ref={previewPaperRef}>
          <ReferenceResumePaper draft={draft} template={selectedTemplate} />
        </div>

        <footer className="builder-preview-actions">
          <div>
            <strong>
              内容生成状态：
              {generationStatus === "success" && generationAssessment.missingFields.length
                ? `已生成 · 建议补充 ${generationAssessment.missingFields.length} 项信息`
                : generationStatusCopy.label}
            </strong>
            <span>{generationStatusDescription}</span>
          </div>
          <button type="button" onClick={saveCurrentBuilderDraft}>保存草稿</button>
          <button type="button" onClick={restart}>重新生成</button>
          {generationStatus === "success" && generationAssessment.missingFields.length > 0 && (
            <button type="button" onClick={() => openAdvancedEditor(steps.length - 1)}>去高级AI编辑补充</button>
          )}
          <button className="primary" type="button" onClick={downloadResume} disabled={!canDownloadResume || isGeneratingResume}>下载简历</button>
        </footer>
      </section>

      {resetConfirmOpen && (
        <div className="builder-reset-modal" role="dialog" aria-modal="true" aria-label="重新生成确认">
          <div className="builder-reset-card">
            <strong>重新生成会清空当前工作区</strong>
            <p>这会清空当前自然语言输入、AI 生成结果和当前草稿，并开启新的 generation session。历史简历不会被删除。</p>
            <div className="builder-reset-actions">
              <button type="button" onClick={() => setResetConfirmOpen(false)}>取消</button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  setResetConfirmOpen(false);
                  resetGenerationSession({ preserveTemplate: false });
                }}
              >
                重新生成
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ResumeStepCard({
  step,
  draft,
  patchSection,
  updateDraft,
  updateCollection,
  addCollectionItem,
  removeCollectionItem,
  moveCollectionItem,
  runAi,
  generateMajorCourses,
  generatingCoursesId,
  completeStep,
  skipStep,
  previousStep,
}) {
  return (
    <section className="builder-step-card">
      <header>
        <span>{draft.currentStep + 1}</span>
        <div>
          <h2>{step.title}</h2>
          <p>{step.description}</p>
        </div>
      </header>
      <div className="builder-step-body">
        {step.key === "identity" && (
          <div className="identity-grid">
            {identityOptions.map((option) => (
              <button
                className={draft.identity === option.value ? "active" : ""}
                key={option.value}
                type="button"
                onClick={() => updateDraft((current) => ({
                  ...current,
                  identity: option.value,
                  resumeName: current.resumeName && current.resumeName !== emptyDraft.resumeName ? current.resumeName : resumeNameForIdentity(option.value),
                  templateId: templateForIdentity(option.value),
                  target: {
                    ...current.target,
                    recruitType: current.target.recruitType || (option.value === "professional" ? "社招" : option.value === "graduate" ? "校招" : "校招 / 实习"),
                  },
                }))}
              >
                <strong>{option.label}</strong>
                <small>{option.subtitle} · {option.description}</small>
              </button>
            ))}
          </div>
        )}

        {step.key === "basic" && (
          <div className="builder-form-grid">
            <Field label="姓名" value={draft.basic.name} onChange={(value) => patchSection("basic", { name: value })} required />
            <Field label="手机号" value={draft.basic.phone} onChange={(value) => patchSection("basic", { phone: value })} required />
            <Field label="邮箱" value={draft.basic.email} onChange={(value) => patchSection("basic", { email: value })} required />
            <Field label="所在城市" value={draft.basic.city} onChange={(value) => patchSection("basic", { city: value })} required />
            <Field label="求职状态" value={draft.basic.status} onChange={(value) => patchSection("basic", { status: value })} placeholder="在校 / 应届 / 在职看机会 / 离职求职" />
            <label className="builder-field">
              <span>个人照片（可选）</span>
              <input type="file" accept="image/*" onChange={(event) => patchSection("basic", { photoName: event.target.files?.[0]?.name ?? "" })} />
              {draft.basic.photoName && <small>{draft.basic.photoName}</small>}
            </label>
          </div>
        )}

        {step.key === "target" && (
          <div className="builder-form-grid">
            <Field label="目标岗位" value={draft.target.role} onChange={(value) => patchSection("target", { role: value })} required />
            <Field label="目标城市" value={draft.target.cities} onChange={(value) => patchSection("target", { cities: value })} />
            <Field label="目标行业" value={draft.target.industry} onChange={(value) => patchSection("target", { industry: value })} />
            <Field label="期望岗位类型" value={draft.target.jobType} onChange={(value) => patchSection("target", { jobType: value })} placeholder="全职 / 实习 / 远程 / 外包" />
            <Field label="招聘类型" value={draft.target.recruitType} onChange={(value) => patchSection("target", { recruitType: value })} placeholder="校招 / 实习 / 社会招聘" />
            <div className="builder-suggestion-row">
              {["产品经理", "数据分析师", "前端开发工程师", "市场营销专员", "人力资源专员"].map((role) => (
                <button type="button" key={role} onClick={() => patchSection("target", { role })}>{role}</button>
              ))}
            </div>
          </div>
        )}

        {step.key === "education" && (
          <CollectionEditor
            section="education"
            items={draft.education}
            addLabel="新增教育经历"
            onAdd={addCollectionItem}
            onRemove={removeCollectionItem}
            onMove={moveCollectionItem}
            render={(item) => (
              <div className="builder-form-grid">
                <Field label="学校名称" value={item.school} onChange={(value) => updateCollection("education", item.id, { school: value })} required />
                <Field label="专业" value={item.major} onChange={(value) => updateCollection("education", item.id, { major: value })} required />
                <Field label="学历" value={item.degree} onChange={(value) => updateCollection("education", item.id, { degree: value })} />
                <Field label="入学时间" type="month" value={item.start} onChange={(value) => updateCollection("education", item.id, { start: value })} />
                <Field label="毕业时间" type="month" value={item.end} onChange={(value) => updateCollection("education", item.id, { end: value })} />
                <Field label="主修课程" value={item.courses} onChange={(value) => updateCollection("education", item.id, { courses: value })} wide textarea />
                <div className="builder-course-ai-row">
                  <button
                    type="button"
                    onClick={() => generateMajorCourses?.(item)}
                    disabled={generatingCoursesId === item.id}
                  >
                    {generatingCoursesId === item.id ? "AI生成中..." : "AI生成主修课程"}
                  </button>
                  <small>根据目标岗位、专业和学历生成相关课程，可生成后继续手动修改。</small>
                </div>
                {draft.identity !== "professional" && <Field label="校园经历" value={item.campus} onChange={(value) => updateCollection("education", item.id, { campus: value })} wide textarea />}
              </div>
            )}
          />
        )}

        {step.key === "experience" && (
          <CollectionEditor
            section="experience"
            items={draft.experience}
            addLabel={draft.identity === "professional" ? "新增工作经历" : "新增实习经历"}
            onAdd={addCollectionItem}
            onRemove={removeCollectionItem}
            onMove={moveCollectionItem}
            render={(item) => (
              <div className="builder-form-grid">
                <Field label="公司名称" value={item.company} onChange={(value) => updateCollection("experience", item.id, { company: value })} />
                <Field label="岗位名称" value={item.role} onChange={(value) => updateCollection("experience", item.id, { role: value })} />
                <Field label="所属部门" value={item.department} onChange={(value) => updateCollection("experience", item.id, { department: value })} />
                <Field label="开始时间" type="month" value={item.start} onChange={(value) => updateCollection("experience", item.id, { start: value })} />
                <Field label="结束时间" type="month" value={item.end} onChange={(value) => updateCollection("experience", item.id, { end: value })} />
                <Field label="工作内容" value={item.content} onChange={(value) => updateCollection("experience", item.id, { content: value, achievements: "" })} wide textarea />
                {draft.identity === "professional" && <Field label="管理经验" value={item.management} onChange={(value) => updateCollection("experience", item.id, { management: value })} wide textarea />}
                <AiActionRow onRun={(action) => runAi(action, "experience", `${item.content}\n${item.management}`, { collection: "experience", id: item.id, field: "content" })} />
              </div>
            )}
          />
        )}

        {step.key === "projects" && (
          <CollectionEditor
            section="projects"
            items={draft.projects}
            addLabel="新增项目经历"
            onAdd={addCollectionItem}
            onRemove={removeCollectionItem}
            onMove={moveCollectionItem}
            render={(item) => (
              <div className="builder-form-grid">
                <Field label="项目名称" value={item.name} onChange={(value) => updateCollection("projects", item.id, { name: value })} />
                <Field label="项目角色" value={item.role} onChange={(value) => updateCollection("projects", item.id, { role: value })} />
                <Field label="项目时间" value={item.time} onChange={(value) => updateCollection("projects", item.id, { time: value })} placeholder="2025.03 - 2025.06" />
                <Field label="项目链接（可选）" value={item.link} onChange={(value) => updateCollection("projects", item.id, { link: value })} />
                <Field label="项目内容" value={projectContentText(item)} onChange={(value) => updateCollection("projects", item.id, { responsibility: value, background: "", skills: "", result: "" })} wide textarea />
                <AiActionRow onRun={(action) => runAi(action, "project", projectContentText(item), { collection: "projects", id: item.id, field: "responsibility" })} />
              </div>
            )}
          />
        )}

        {step.key === "extras" && (
          <div className="builder-form-grid">
            <Field
              label="技能和附加信息"
              value={extrasContentText(draft.extras)}
              onChange={(value) => patchSection("extras", {
                professionalSkills: value,
                tools: "",
                languageAbility: "",
                certificates: "",
                awards: "",
                campusActivities: "",
                strengths: "",
              })}
              wide
              textarea
            />
            <AiActionRow onRun={(action) => runAi(action, "skills", extrasContentText(draft.extras), { section: "extras" })} />
          </div>
        )}

        {step.key === "summary" && (
          <div className="builder-final-check">
            <Field label="个人总结" value={draft.summary} onChange={(value) => updateDraft((current) => ({ ...current, summary: value }))} wide textarea />
            <AiActionRow onRun={(action) => runAi(action === "polish" ? "summary" : action, "summary", draft.summary, { field: "summary" })} />
          </div>
        )}
      </div>

      <footer className="builder-step-actions">
        <button type="button" onClick={previousStep} disabled={draft.currentStep === 0}>上一步</button>
        <button type="button" onClick={skipStep}>暂时跳过</button>
        <button className="primary" type="button" onClick={completeStep}>保存并继续</button>
      </footer>
    </section>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", required = false, textarea = false, wide = false }) {
  return (
    <label className={`builder-field ${wide ? "is-wide" : ""}`}>
      <span>{label}{required && <b>*</b>}</span>
      {textarea ? (
        <textarea value={value ?? ""} rows={4} placeholder={placeholder || label} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input type={type} value={value ?? ""} placeholder={placeholder || label} onChange={(event) => onChange(event.target.value)} />
      )}
      {required && !String(value ?? "").trim() && <small>请填写{label}</small>}
    </label>
  );
}

function CollectionEditor({ section, items, addLabel, onAdd, onRemove, onMove, render }) {
  return (
    <div className="builder-collection">
      {items.map((item, index) => (
        <article className="builder-entry-card" key={item.id}>
          <header>
            <strong>第 {index + 1} 段</strong>
            <div>
              <button type="button" onClick={() => onMove(section, index, -1)}>上移</button>
              <button type="button" onClick={() => onMove(section, index, 1)}>下移</button>
              <button type="button" onClick={() => onRemove(section, item.id)}>删除</button>
            </div>
          </header>
          {render(item, index)}
        </article>
      ))}
      {items.length === 0 && <p className="builder-empty-tip">还没有内容，点击下方按钮新增一段。</p>}
      <button className="builder-add-button" type="button" onClick={() => onAdd(section)}>+ {addLabel}</button>
    </div>
  );
}

function AiActionRow({ onRun }) {
  return (
    <div className="builder-ai-actions">
      <button className="is-primary-ai" type="button" onClick={() => onRun("polish")}>AI润色</button>
      <button type="button" onClick={() => onRun("bullets")}>生成要点</button>
      <button type="button" onClick={() => onRun("keywords")}>提取关键词</button>
      <button type="button" onClick={() => onRun("metrics")}>量化成果建议</button>
    </div>
  );
}

function ResumePaper({ draft, template }) {
  const accentStyle = { "--builder-paper-accent": template.accent };
  return (
    <article className={`builder-resume-paper is-${template.id}`} style={accentStyle}>
      <header>
        <div>
          <h2>{draft.basic.name || "姓名"}</h2>
          <p>{draft.target.role || "求职目标"}</p>
        </div>
        <ul>
          <li>{draft.basic.phone || "手机号"}</li>
          <li>{draft.basic.email || "邮箱"}</li>
          <li>{draft.basic.city || "所在城市"}</li>
        </ul>
      </header>
      <PaperSection title="个人总结" lines={splitLines(draft.summary)} placeholder="个人总结" />
      <EducationSection items={draft.education} />
      <ExperienceSection title={draft.identity === "professional" ? "工作经历" : "实习经历"} items={draft.experience} />
      <ProjectSection items={draft.projects} />
      <PaperSection
        title="专业技能"
        lines={[
          ...splitLines(draft.extras.professionalSkills),
          ...splitLines(draft.extras.tools),
        ]}
        placeholder="专业技能 / 专业工具"
      />
      <PaperSection
        title="证书和获奖经历"
        lines={[...splitLines(draft.extras.certificates), ...splitLines(draft.extras.awards)]}
        placeholder="证书 / 获奖经历"
      />
      <PaperSection
        title="其他信息"
        lines={[...splitLines(draft.extras.languageAbility), ...splitLines(draft.extras.campusActivities), ...splitLines(draft.extras.strengths)]}
        placeholder="语言能力 / 校园活动 / 个人优势"
      />
    </article>
  );
}

function PaperSection({ title, lines, placeholder }) {
  return (
    <section>
      <h3>{title}</h3>
      {lines.length ? <ul>{lines.map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}</ul> : <p className="paper-placeholder">{placeholder}</p>}
    </section>
  );
}

function EducationSection({ items }) {
  const filled = items.filter((item) => item.school || item.major || item.degree);
  return (
    <section>
      <h3>教育经历</h3>
      {filled.length ? filled.map((item) => (
        <div className="paper-item" key={item.id}>
          <strong>{item.school || "学校名称"} · {item.major || "专业"}</strong>
          <span>{[item.degree, formatDate(item.start), formatDate(item.end)].filter(Boolean).join(" · ")}</span>
          <p>{[item.courses, item.campus].filter(Boolean).join("；")}</p>
        </div>
      )) : <p className="paper-placeholder">教育经历</p>}
    </section>
  );
}

function ExperienceSection({ title, items }) {
  const filled = items.filter((item) => item.company || item.role || item.content || item.management);
  return (
    <section>
      <h3>{title}</h3>
      {filled.length ? filled.map((item) => (
        <div className="paper-item" key={item.id}>
          <strong>{item.company || "公司名称"} · {item.role || "岗位名称"}</strong>
          <span>{[item.department, formatDate(item.start), formatDate(item.end)].filter(Boolean).join(" · ")}</span>
          <ul>{splitLines(`${item.content}\n${item.management ?? ""}`).map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}</ul>
        </div>
      )) : <p className="paper-placeholder">{title}</p>}
    </section>
  );
}

function ProjectSection({ items }) {
  const filled = items.filter((item) => item.name || projectContentText(item));
  return (
    <section>
      <h3>项目经历</h3>
      {filled.length ? filled.map((item) => (
        <div className="paper-item" key={item.id}>
          <strong>{item.name || "项目名称"} · {item.role || "项目角色"}</strong>
          <span>{item.time}</span>
          <ul>{splitLines(`${projectContentText(item)}\n${item.link}`).map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}</ul>
        </div>
      )) : <p className="paper-placeholder">项目经历</p>}
    </section>
  );
}

function ModernResumePaper({ draft, template }) {
  const accentStyle = { "--builder-paper-accent": template.accent };
  const skillLines = [
    ...splitLines(draft.extras.professionalSkills),
    ...splitLines(draft.extras.tools),
  ];
  const awardLines = [...splitLines(draft.extras.certificates), ...splitLines(draft.extras.awards)];
  const otherLines = [
    ...splitLines(draft.extras.languageAbility),
    ...splitLines(draft.extras.campusActivities),
    ...splitLines(draft.extras.strengths),
  ];

  return (
    <article className={`builder-resume-paper modern-resume-paper is-${template.id}`} style={accentStyle}>
      <header className="modern-paper-hero">
        <div className="modern-paper-name">
          <h2>{draft.basic.name || "姓名"}</h2>
          <p>{draft.target.role || "求职目标"}</p>
          {draft.basic.status && <small>{draft.basic.status}</small>}
        </div>
        <ul className="modern-paper-contact">
          <li><span>电话</span>{draft.basic.phone || "手机号"}</li>
          <li><span>邮箱</span>{draft.basic.email || "邮箱"}</li>
          <li><span>城市</span>{draft.basic.city || "所在城市"}</li>
          <li><span>方向</span>{draft.target.industry || draft.target.jobType || "目标行业"}</li>
        </ul>
      </header>

      <div className="modern-paper-layout">
        <main className="modern-paper-main">
          <ModernPaperSection title="个人优势" lines={splitLines(draft.summary)} placeholder="用 2-4 行概括求职方向、核心能力和岗位匹配优势" />
          <ModernExperienceSection title={draft.identity === "professional" ? "工作经历" : "实习经历"} items={draft.experience} />
          <ModernProjectSection items={draft.projects} />
          <ModernEducationSection items={draft.education} />
        </main>
        <aside className="modern-paper-side">
          <ModernTagSection title="核心技能" lines={skillLines} placeholder="专业技能 / 专业工具" />
          <ModernPaperSection title="证书奖项" lines={awardLines} placeholder="证书 / 获奖经历" compact />
          <ModernPaperSection title="其他信息" lines={otherLines} placeholder="语言能力 / 校园活动 / 个人优势" compact />
        </aside>
      </div>
    </article>
  );
}

function ModernPaperSection({ title, lines, placeholder, compact = false }) {
  return (
    <section className={`modern-paper-section ${compact ? "is-compact" : ""}`}>
      <h3>{title}</h3>
      {lines.length ? (
        <ul>{lines.map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}</ul>
      ) : (
        <p className="paper-placeholder">{placeholder}</p>
      )}
    </section>
  );
}

function ModernTagSection({ title, lines, placeholder }) {
  return (
    <section className="modern-paper-section modern-tag-section">
      <h3>{title}</h3>
      {lines.length ? (
        <div className="modern-paper-tags">
          {lines.map((line, index) => <span key={`${line}_${index}`}>{line}</span>)}
        </div>
      ) : (
        <p className="paper-placeholder">{placeholder}</p>
      )}
    </section>
  );
}

function ModernEducationSection({ items }) {
  const filled = items.filter((item) => item.school || item.major || item.degree);
  return (
    <section className="modern-paper-section">
      <h3>教育经历</h3>
      {filled.length ? filled.map((item) => (
        <div className="modern-paper-item" key={item.id}>
          <div className="modern-paper-item-head">
            <strong>{item.school || "学校名称"}</strong>
            <span>{[formatDate(item.start), formatDate(item.end)].filter(Boolean).join(" - ")}</span>
          </div>
          <p className="modern-paper-subtitle">{[item.degree, item.major].filter(Boolean).join(" · ") || "学历 · 专业"}</p>
          <ModernBulletList lines={[item.courses, item.campus].filter(Boolean)} />
        </div>
      )) : <p className="paper-placeholder">教育经历</p>}
    </section>
  );
}

function ModernExperienceSection({ title, items }) {
  const filled = items.filter((item) => item.company || item.role || item.content || item.management);
  return (
    <section className="modern-paper-section">
      <h3>{title}</h3>
      {filled.length ? filled.map((item) => (
        <div className="modern-paper-item" key={item.id}>
          <div className="modern-paper-item-head">
            <strong>{item.company || "公司名称"}</strong>
            <span>{[formatDate(item.start), formatDate(item.end)].filter(Boolean).join(" - ")}</span>
          </div>
          <p className="modern-paper-subtitle">{[item.role || "岗位名称", item.department].filter(Boolean).join(" · ")}</p>
          <ModernBulletList lines={splitLines(`${item.content}\n${item.management ?? ""}`)} />
        </div>
      )) : <p className="paper-placeholder">{title}</p>}
    </section>
  );
}

function ModernProjectSection({ items }) {
  const filled = items.filter((item) => item.name || projectContentText(item));
  return (
    <section className="modern-paper-section">
      <h3>项目经历</h3>
      {filled.length ? filled.map((item) => (
        <div className="modern-paper-item" key={item.id}>
          <div className="modern-paper-item-head">
            <strong>{item.name || "项目名称"}</strong>
            <span>{item.time}</span>
          </div>
          <p className="modern-paper-subtitle">{item.role || "项目角色"}</p>
          <ModernBulletList lines={splitLines(`${projectContentText(item)}\n${item.link}`)} />
        </div>
      )) : <p className="paper-placeholder">项目经历</p>}
    </section>
  );
}

function ModernBulletList({ lines }) {
  if (!lines.length) return null;
  return <ul>{lines.map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}</ul>;
}

function getReferenceEducationRows(draft) {
  const filled = draft.education.filter((item) => item.school || item.major || item.degree);
  if (!filled.length) return [];
  return filled.map((item) => ({
    title: item.school || "学校名称",
    role: [item.degree, item.major].filter(Boolean).join(" · "),
    time: [formatDate(item.start), formatDate(item.end)].filter(Boolean).join(" - "),
    bullets: [item.courses].filter(Boolean),
  }));
}

function getCampusActivityLines(draft) {
  return [
    ...draft.education.flatMap((item) => splitLines(item.campus)),
    ...splitLines(draft.extras.campusActivities),
  ];
}

function ReferenceResumePaper({ draft, template }) {
  if (template.id === "social") {
    return <SocialResumePaper draft={draft} template={template} />;
  }
  return <CampusResumePaper draft={draft} template={template} />;
}

function CampusResumePaper({ draft, template }) {
  const style = { "--builder-paper-accent": template.accent };
  const name = draft.basic.name || "姓名";
  const role = draft.target.role || "求职意向";
  const city = draft.basic.city || "城市";
  const phone = draft.basic.phone || "手机号";
  const email = draft.basic.email || "邮箱";
  const education = getReferenceEducationRows(draft);
  const experiences = getCampusExperienceRows(draft);
  const projects = getCampusProjectRows(draft);
  const campusLines = getCampusActivityLines(draft);
  const summaryLines = splitLines(draft.summary);

  return (
    <article className="builder-resume-paper campus-resume-paper" style={style}>
      <header className="campus-paper-head social-paper-head">
        <div className="campus-paper-title social-paper-title">
          <h2>{name}</h2>
          <p className="social-paper-role">{role}</p>
          <p className="social-paper-contact">
            <span>{phone}</span>
            <span>{email}</span>
            <span>{city}</span>
          </p>
        </div>
      </header>

      <CampusSection title="教育背景" hint="突出学校、专业、学历、时间、主修课程和与岗位相关的校园经历。">
        {education.length ? education.map((item) => (
          <CampusItem item={item} key={`${item.title}_${item.time}`} />
        )) : (
          <CampusItem
            item={{
              title: "学校名称",
              role: "专业 - 学历",
              time: "入学时间 ~ 毕业时间",
              bullets: ["主修课程、校园经历会在填写后展示。"],
            }}
            placeholder
          />
        )}
      </CampusSection>

      <CampusSection title={draft.identity === "professional" ? "工作经历" : "实习经历"} hint="按公司/组织、岗位、时间、职责、行动和可验证成果展开，成果不要虚构数字。">
        {experiences.map((item) => <CampusItem item={item} key={`${item.title}_${item.time}`} />)}
      </CampusSection>

      <CampusSection title="项目经历" hint="说明项目背景、个人角色、使用方法或工具、关键动作和最终结果。">
        {projects.map((item) => <CampusItem item={item} key={`${item.title}_${item.time}`} />)}
      </CampusSection>

      <CampusSection title="校园经历" hint="适合校招/实习申请，展示学生组织、社团、竞赛、志愿服务或校园活动中的职责和成果。">
        <CampusBulletList
          lines={campusLines}
          fallback={["校园活动、学生组织、竞赛或志愿经历会在填写后展示。"]}
        />
      </CampusSection>

      <CampusSection title="个人总结" hint="最终确认时生成或填写，建议围绕目标岗位、优势证据和求职动机。">
        <CampusBulletList
          lines={summaryLines}
          fallback={["个人总结会在填写或AI建议确认后展示。"]}
        />
      </CampusSection>
    </article>
  );
}

function SocialResumePaper({ draft, template }) {
  const style = { "--builder-paper-accent": template.accent };
  const name = draft.basic.name || "姓名";
  const role = draft.target.role || "目标职位";
  const city = draft.basic.city || "城市";
  const phone = draft.basic.phone || "手机号";
  const email = draft.basic.email || "邮箱";
  const experiences = getSocialExperienceRows(draft);
  const projects = getSocialProjectRows(draft);
  const education = getReferenceEducationRows(draft);
  const advantageLines = [
    ...splitLines(draft.summary),
    ...splitLines(draft.extras.strengths),
  ];

  return (
    <article className="builder-resume-paper social-resume-paper" style={style}>
      <header className="social-paper-head">
        <div className="social-paper-title">
          <h2>{name}</h2>
          <p className="social-paper-role">{role}</p>
          <p className="social-paper-contact">
            <span>{phone}</span>
            <span>{email}</span>
            <span>{city}</span>
          </p>
        </div>
      </header>

      <SocialSection title="个人优势" hint="用3-5条概括工作年限、行业沉淀、核心方法、协作能力和可验证成果。">
        <SocialBulletList
          lines={advantageLines}
          fallback={["工作年限、行业经验、业务方法、数据意识、团队协作和代表成果会在填写后展示。"]}
        />
      </SocialSection>

      <SocialSection title="工作经历" hint="按时间倒序展示公司、岗位、负责业务、关键动作和业务结果，优先呈现最近和最相关经历。">
        {experiences.map((item) => <SocialItem item={item} key={`${item.title}_${item.time}`} />)}
      </SocialSection>

      <SocialSection title="项目案例" hint="展示能证明岗位能力的代表项目，例如增长、转化、活动、流程优化、数据分析或管理改进。">
        {projects.map((item) => <SocialItem item={item} key={`${item.title}_${item.time}`} />)}
      </SocialSection>

      <SocialSection title="教育背景" hint="社招简历保持简洁，展示最高学历、专业、院校和与岗位相关的进修背景。">
        {education.length ? education.map((item) => <SocialItem item={item} key={`${item.title}_${item.time}`} />) : (
          <SocialItem item={{ title: "学校名称", role: "专业 - 学历", time: "时间", bullets: ["最高学历、专业和在职进修经历会在填写后展示。"] }} placeholder />
        )}
      </SocialSection>

    </article>
  );
}

function getSocialExperienceRows(draft) {
  const filled = draft.experience.filter((item) => item.company || item.role || item.content || item.management);
  if (!filled.length) {
    return [{
      title: "公司名称",
      role: "岗位名称 / 所属部门",
      time: "开始时间 - 结束时间",
      bullets: ["负责业务范围、关键动作、协作对象、核心指标和主要成果会在填写后展示。"],
      placeholder: true,
    }];
  }
  return filled.map((item) => ({
    title: item.company || "公司名称",
    role: [item.role || "岗位名称", item.department].filter(Boolean).join(" / "),
    time: [formatDate(item.start), formatDate(item.end)].filter(Boolean).join(" - "),
    bullets: splitLines(`${item.content}\n${item.management ?? ""}`),
    placeholder: false,
  }));
}

function getSocialProjectRows(draft) {
  const filled = draft.projects.filter((item) => item.name || projectContentText(item));
  if (!filled.length) {
    return [{
      title: "项目/活动名称",
      role: "负责角色",
      time: "项目时间",
      bullets: ["项目背景、目标人群、执行动作、使用工具、数据结果和业务影响会在填写后展示。"],
      placeholder: true,
    }];
  }
  return filled.map((item) => ({
    title: item.name || "项目/活动名称",
    role: item.role || "负责角色",
    time: item.time,
    bullets: splitLines(projectContentText(item)),
    placeholder: false,
  }));
}

function SocialSection({ title, children }) {
  return (
    <section className="social-resume-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function SocialBulletList({ lines, fallback }) {
  const displayLines = lines.length ? lines : fallback;
  return (
    <ul className={lines.length ? "social-bullet-list" : "social-bullet-list is-placeholder"}>
      {displayLines.map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}
    </ul>
  );
}

function SocialSkillTags({ lines, fallback, placeholder = false }) {
  const displayLines = lines.length ? lines : fallback;
  return (
    <div className={`social-skill-tags ${placeholder ? "is-placeholder" : ""}`}>
      {displayLines.map((line, index) => <span key={`${line}_${index}`}>{line}</span>)}
    </div>
  );
}

function SocialItem({ item, placeholder = false }) {
  return (
    <article className={`social-resume-item ${placeholder || item.placeholder ? "is-placeholder" : ""}`}>
      <div className="social-item-head">
        <strong>{item.title}</strong>
        {item.time && <time>{item.time}</time>}
      </div>
      {item.role && <p className="social-item-role">{item.role}</p>}
      {item.bullets?.length > 0 && (
        <ul>
          {item.bullets.map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}
        </ul>
      )}
    </article>
  );
}
function getCampusExperienceRows(draft) {
  const filled = draft.experience.filter((item) => item.company || item.role || item.content || item.management);
  if (!filled.length) {
    return [{
      title: "公司/组织名称",
      role: draft.identity === "professional" ? "岗位名称" : "实习岗位",
      time: "开始时间 ~ 结束时间",
      bullets: ["工作内容、职责范围、协作对象和主要成果会在填写后展示。"],
      placeholder: true,
    }];
  }
  return filled.map((item) => ({
    title: item.company || "公司/组织名称",
    role: item.role || "岗位名称",
    time: [formatDate(item.start), formatDate(item.end)].filter(Boolean).join(" - "),
    bullets: splitLines(`${item.content}\n${item.management ?? ""}`),
    placeholder: false,
  }));
}

function getCampusProjectRows(draft) {
  const filled = draft.projects.filter((item) => item.name || projectContentText(item));
  if (!filled.length) {
    return [{
      title: "项目名称",
      role: "项目角色",
      time: "项目时间",
      bullets: ["项目背景、个人职责、使用技能和项目成果会在填写后展示。"],
      placeholder: true,
    }];
  }
  return filled.map((item) => ({
    title: item.name || "项目名称",
    role: item.role || "项目角色",
    time: item.time,
    bullets: splitLines(projectContentText(item)),
    placeholder: false,
  }));
}

function CampusSection({ title, children }) {
  return (
    <section className="campus-resume-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function CampusBulletList({ lines, fallback }) {
  const displayLines = lines.length ? lines : fallback;
  return (
    <ul className={lines.length ? "campus-bullet-list" : "campus-bullet-list is-placeholder"}>
      {displayLines.map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}
    </ul>
  );
}

function CampusItem({ item, placeholder = false }) {
  return (
    <article className={`campus-resume-item ${placeholder || item.placeholder ? "is-placeholder" : ""}`}>
      <div className="campus-item-head">
        <strong>{item.title}</strong>
        {item.role && <span>{item.role}</span>}
        {item.time && <time>{item.time}</time>}
      </div>
      {item.bullets?.length > 0 && (
        <ul>
          {item.bullets.map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}
        </ul>
      )}
    </article>
  );
}

function TraditionalSection({ title, children }) {
  return (
    <section className="traditional-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function TraditionalItem({ item, placeholder = false }) {
  return (
    <article className={`traditional-item ${placeholder || item.placeholder ? "is-placeholder" : ""}`}>
      <div className="traditional-item-head">
        <strong>{item.title}</strong>
        {item.role && <span>{item.role}</span>}
        {item.time && <time>{item.time}</time>}
      </div>
      {item.bullets?.length > 0 && (
        <ul>
          {item.bullets.map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}
        </ul>
      )}
      {item.tech && <p>{item.tech}</p>}
    </article>
  );
}
function ReferenceSidebarSection({ title, children }) {
  return (
    <section className="reference-sidebar-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function ReferenceMainSection({ title, children, placeholder = false }) {
  return (
    <section className={`reference-main-section ${placeholder ? "is-placeholder" : ""}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function ReferenceTimelineItem({ item }) {
  return (
    <article className={item.placeholder ? "reference-item is-placeholder" : "reference-item"}>
      <div className="reference-item-head">
        <div>
          <strong>{item.title}</strong>
          <p>{item.role}</p>
        </div>
        <aside>
          <b>{item.time}</b>
          {item.place && <span>{item.place}</span>}
        </aside>
      </div>
      {item.bullets?.length > 0 && (
        <ul>
          {item.bullets.map((line, index) => <li key={`${line}_${index}`}>{line}</li>)}
        </ul>
      )}
      {item.tech && <p className="reference-tech-line">{item.tech}</p>}
    </article>
  );
}
