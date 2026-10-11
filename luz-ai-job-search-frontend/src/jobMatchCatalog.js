export const JOB_ROLE_CATALOG = [
  {
    id: "technology",
    label: "互联网与技术",
    keywords: ["计算机", "软件", "Java", "Spring", "前端", "后端", "算法", "数据", "运维", "测试", "开发"],
    roles: ["Java开发", "前端开发", "后端开发", "测试工程师", "算法工程师", "运维工程师", "数据开发", "数据分析师", "全栈开发", "安全工程师"],
  },
  {
    id: "product-design",
    label: "产品与设计",
    keywords: ["产品", "设计", "用户", "交互", "视觉", "体验", "工业设计"],
    roles: ["产品经理", "产品运营", "视觉设计", "工业设计", "用户研究", "交互设计", "UI设计", "UX设计", "产品助理"],
  },
  {
    id: "operation-media",
    label: "运营与传媒",
    keywords: ["运营", "传媒", "内容", "编辑", "新媒体", "直播", "编导", "视频"],
    roles: ["新媒体运营", "内容运营", "编辑", "编导", "直播运营", "活动运营", "社区运营", "短视频运营", "用户运营"],
  },
  {
    id: "marketing-sales",
    label: "市场与销售",
    keywords: ["市场", "销售", "品牌", "商务", "电商", "渠道", "营销", "客户"],
    roles: ["市场营销", "品牌策划", "销售顾问", "商务拓展", "电商运营", "市场策划", "渠道销售", "客户经理", "销售运营"],
  },
  {
    id: "finance-accounting",
    label: "金融与财会",
    keywords: ["金融", "财务", "会计", "审计", "证券", "银行", "投资", "税务", "统计"],
    roles: ["会计", "审计", "财务分析", "银行柜员", "证券分析", "投资顾问", "税务专员", "风控专员", "金融产品"],
  },
  {
    id: "engineering-manufacturing",
    label: "工程与制造",
    keywords: ["机械", "电气", "自动化", "土木", "制造", "质量", "工艺", "设备", "工程"],
    roles: ["机械工程", "电气工程", "自动化", "土木工程", "质量管理", "工艺工程", "设备工程", "结构工程", "供应链"],
  },
  {
    id: "education-research",
    label: "教育与科研",
    keywords: ["教育", "教师", "教研", "科研", "实验", "课程", "学术", "培训"],
    roles: ["教师", "教研", "科研助理", "实验员", "课程顾问", "学术研究", "教务", "培训讲师", "助教"],
  },
  {
    id: "healthcare",
    label: "医疗与健康",
    keywords: ["医学", "医疗", "护理", "药", "临床", "健康", "检验", "医药"],
    roles: ["医生", "护士", "药师", "医学检验", "医药代表", "护理", "临床研究", "健康管理", "医疗器械"],
  },
  {
    id: "hr-admin-legal",
    label: "人事、行政与法务",
    keywords: ["人力", "招聘", "行政", "法务", "律师", "组织", "培训", "劳动"],
    roles: ["人力资源", "招聘", "行政", "法务", "律师助理", "培训专员", "组织发展", "员工关系", "行政专员"],
  },
];

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean);
  const text = normalizeText(value);
  return text ? [text] : [];
}

function uniqueList(items) {
  return Array.from(new Set(items.map(normalizeText).filter(Boolean)));
}

function roleMatchesGroup(role, group) {
  const text = normalizeText(role);
  return group.keywords.some((keyword) => text.includes(keyword)) || group.roles.some((item) => text.includes(item) || item.includes(text));
}

export function buildJobRoleCatalog(referenceData = {}) {
  const backendRoles = normalizeList(referenceData.jobCategories);
  const assigned = new Set();
  const groups = JOB_ROLE_CATALOG.map((group) => {
    const extraRoles = backendRoles.filter((role) => roleMatchesGroup(role, group));
    extraRoles.forEach((role) => assigned.add(role));
    return {
      ...group,
      roles: uniqueList([...group.roles, ...extraRoles]),
    };
  });
  const unassigned = backendRoles.filter((role) => !assigned.has(role));
  if (unassigned.length > 0) {
    groups.push({
      id: "backend-reference",
      label: "接口岗位字典",
      keywords: unassigned,
      roles: uniqueList(unassigned),
    });
  }
  return groups;
}

export function flattenJobRoles(groups) {
  return uniqueList(groups.flatMap((group) => group.roles));
}

export function filterJobRoleGroups(groups, query) {
  const normalizedQuery = normalizeText(query).toLowerCase();
  if (!normalizedQuery) return groups;
  return groups
    .map((group) => {
      const groupMatched = group.label.toLowerCase().includes(normalizedQuery);
      const roles = group.roles.filter((role) => role.toLowerCase().includes(normalizedQuery) || groupMatched);
      return { ...group, roles };
    })
    .filter((group) => group.roles.length > 0);
}

export function buildSmartRoleGroups(profile, groups) {
  const signals = [
    ...normalizeList(profile?.jobDirections),
    ...normalizeList(profile?.skills),
    ...normalizeList(profile?.majors),
    ...normalizeList(profile?.experiences),
    ...normalizeList(profile?.projects),
    ...normalizeList(profile?.keywords),
  ];
  if (signals.length === 0) return [];
  const signalText = signals.join(" ").toLowerCase();
  return groups
    .map((group) => {
      const score = group.keywords.reduce((total, keyword) => (
        signalText.includes(keyword.toLowerCase()) ? total + 1 : total
      ), 0);
      const directRoles = group.roles.filter((role) => signalText.includes(role.toLowerCase()));
      return {
        ...group,
        score: score + directRoles.length,
        roles: uniqueList([...directRoles, ...group.roles]).slice(0, 8),
      };
    })
    .filter((group) => group.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
