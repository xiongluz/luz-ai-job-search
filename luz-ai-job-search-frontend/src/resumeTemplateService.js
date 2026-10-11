export const RESUME_TEMPLATE_DRAFT_KEY = "guangqi-ai-resume-template-draft";

export const resumeTemplates = [
  {
    id: "campus-clear",
    name: "校招版",
    audience: "应届毕业生、校招、实习申请",
    highlight: "突出核心能力、教育背景、实习经历、项目经历和校园经历",
    tags: ["校招", "应届生", "实习"],
    baseScore: 90,
    badge: "推荐",
    tone: "campus",
  },
  {
    id: "social-standard",
    name: "社招版",
    audience: "电商运营、数字化营销、职场人士、社会招聘",
    highlight: "突出个人优势、核心技能、工作业绩、项目案例和教育证书",
    tags: ["社招", "运营", "营销"],
    baseScore: 84,
    badge: "社招",
    tone: "social",
  },
];
export const emptyResumeData = {
  basicInfo: {
    name: "",
    phone: "",
    email: "",
    location: "",
  },
  jobTarget: "",
  education: "",
  experience: "",
  projects: "",
  skills: "",
  campusExperience: "",
  summary: "",
  selectedTemplate: "campus-clear",
};

const templateRules = {
  "campus-clear": ["应届", "毕业", "校招", "实习", "学生", "校园", "本科", "硕士", "课程", "项目", "求职简历"],
  "social-standard": ["社招", "职场", "工作", "年限", "管理", "业绩", "业务", "岗位定制", "团队", "部门", "成果"],
};
export function loadResumeTemplateDraft() {
  try {
    const saved = window.localStorage.getItem(RESUME_TEMPLATE_DRAFT_KEY);
    if (!saved) return emptyResumeData;
    const parsed = { ...emptyResumeData, ...JSON.parse(saved) };
    if (!resumeTemplates.some((template) => template.id === parsed.selectedTemplate)) {
      parsed.selectedTemplate = "campus-clear";
    }
    return parsed;
  } catch {
    return emptyResumeData;
  }
}

export function saveResumeTemplateDraft(data) {
  window.localStorage.setItem(RESUME_TEMPLATE_DRAFT_KEY, JSON.stringify(data));
}

export function shouldOpenTemplatePanel(text) {
  const normalized = text.toLowerCase();
  return [
    "帮我生成一份简历",
    "制作简历",
    "创建简历",
    "推荐简历模板",
    "我需要一份求职简历",
    "根据我的经历生成简历",
    "生成简历",
    "简历模板",
  ].some((keyword) => normalized.includes(keyword.toLowerCase()));
}

export function inferResumeDataFromText(previousData, text) {
  const value = text.trim();
  if (!value) return previousData;

  const next = structuredCloneSafe(previousData);
  const lower = value.toLowerCase();

  const targetMatch = value.match(/(?:求职方向|目标岗位|应聘岗位|申请岗位|想投岗位)[：:是为\s]*([^，。；\n]{2,32})/);
  if (targetMatch?.[1]) {
    next.jobTarget = cleanValue(targetMatch[1]);
  } else if (!next.jobTarget && /产品|运营|算法|开发|工程师|数据|咨询|金融|市场|校招|实习/.test(value)) {
    next.jobTarget = cleanValue(value.slice(0, 36));
  }

  const nameMatch = value.match(/(?:我叫|姓名[：:是\s]*)([\u4e00-\u9fa5A-Za-z·]{2,12})/);
  if (nameMatch?.[1]) next.basicInfo.name = nameMatch[1];
                                                                                                                                  
  const phoneMatch = value.match(/1[3-9]\d{9}/);
  if (phoneMatch?.[0]) next.basicInfo.phone = phoneMatch[0];

  const emailMatch = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (emailMatch?.[0]) next.basicInfo.email = emailMatch[0];

  const cityMatch = value.match(/(?:在|城市|地点|所在地)[：:是\s]*([\u4e00-\u9fa5]{2,8})(?:工作|求职|，|。|$)/);
  if (cityMatch?.[1]) next.basicInfo.location = cityMatch[1];

  if (/学校|大学|学院|本科|硕士|博士|专业|gpa/i.test(value)) {
    next.education = mergeLine(next.education, value);
  }

  if (/实习|工作|公司|负责|运营|增长|协作|用户|业务/.test(value)) {
    next.experience = mergeLine(next.experience, value);
  }

  if (/项目|系统|平台|网站|app|spring|boot|python|java|react|vue|算法|模型|数据库|github/i.test(value)) {
    next.projects = mergeLine(next.projects, value);
  }

  if (/技能|熟悉|掌握|工具|语言|sql|excel|figma|axure|python|java|react|spring/i.test(value)) {
    next.skills = mergeLine(next.skills, value);
  }

  if (/学生会|社团|竞赛|奖学金|志愿|校园|班委/.test(value)) {
    next.campusExperience = mergeLine(next.campusExperience, value);
  }

  if (/优势|评价|认真|沟通|学习|抗压|复盘|主动|自我/.test(value)) {
    next.summary = mergeLine(next.summary, value);
  }

  return next;
}

export function recommendResumeTemplates(resumeData, messages = []) {
  const text = [
    resumeData.jobTarget,
    resumeData.education,
    resumeData.experience,
    resumeData.projects,
    resumeData.skills,
    resumeData.campusExperience,
    resumeData.summary,
    ...messages.map((message) => message.text ?? ""),
  ].join(" ").toLowerCase();

  return resumeTemplates
    .map((template) => {
      const scoreBoost = (templateRules[template.id] ?? []).reduce((score, keyword) => (
        text.includes(keyword.toLowerCase()) ? score + 3 : score
      ), 0);
      const score = Math.min(99, template.baseScore + scoreBoost);
      return {
        ...template,
        score,
        reason: createRecommendationReason(template, text),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function createRecommendationReason(template, text) {
  if (template.id === "campus-clear" && /校招|应届|毕业|实习|校园|学生|课程|项目/.test(text)) {
    return "当前内容更偏校招或实习申请，适合用校招版把核心能力、教育背景、实习和项目经历按正式简历结构展开。";
  }
  if (template.id === "social-standard" && /社招|职场|工作|年限|管理|业绩|业务|团队|部门|成果/.test(text)) {
    return "当前内容更偏社招岗位申请，社招版会优先突出个人优势、核心技能、工作经历、项目案例和业务结果。";
  }
  return `该模板适合${template.audience}，能帮助你把经历按更清晰的层级展示。`;
}
function mergeLine(existing, value) {
  if (!existing) return cleanValue(value);
  if (existing.includes(value)) return existing;
  return `${existing}\n${cleanValue(value)}`;
}

function cleanValue(value) {
  return value.replace(/[。；;，,]$/g, "").trim();
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
