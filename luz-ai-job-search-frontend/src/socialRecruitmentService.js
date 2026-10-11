import {
  demoSocialRecruitmentJobs,
  socialRecruitmentOptions,
  socialRecruitmentSearchConfig,
} from "./socialRecruitmentConfig.js";

const searchCache = new Map();

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[\s._-]+/g, "")
    .replace(/前端工程师/g, "前端开发")
    .replace(/web前端/g, "前端开发")
    .replace(/react\.?js/g, "react")
    .replace(/vue\.?js/g, "vue")
    .replace(/springboot/g, "springboot");
}

function splitExcludeKeywords(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean);
  }
  return cleanText(value)
    .split(/[,，、\s]+/)
    .map(cleanText)
    .filter(Boolean);
}

function getSynonymTerms(keyword) {
  const normalizedKeyword = normalizeText(keyword);
  const groups = socialRecruitmentSearchConfig.synonymGroups;
  const group = groups.find((items) => items.some((item) => normalizeText(item) === normalizedKeyword || normalizedKeyword.includes(normalizeText(item))));
  if (!group) return [cleanText(keyword)].filter(Boolean);
  return Array.from(new Set([cleanText(keyword), ...group])).filter(Boolean);
}

function containsAny(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function getJobText(job) {
  return [
    job.positionName,
    job.companyName,
    job.city,
    job.industry,
    job.workType,
    job.experience,
    job.education,
    job.description,
    ...(job.keywords ?? []),
  ].join(" ");
}

function parseSalary(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseExperienceRange(value) {
  const text = cleanText(value);
  if (!text) return null;
  if (/不限|应届|无经验/.test(text)) return { min: 0, max: 99 };
  if (/10年以上/.test(text)) return { min: 10, max: 99 };
  if (/1年以内/.test(text)) return { min: 0, max: 1 };
  const range = text.match(/(\d+)\s*[-至]\s*(\d+)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/(\d+)/);
  if (single) {
    const year = Number(single[1]);
    return { min: year, max: year };
  }
  return null;
}

function getEducationLevel(value) {
  const text = cleanText(value);
  if (!text || /不限/.test(text)) return 0;
  if (/大专/.test(text)) return 1;
  if (/本科/.test(text)) return 2;
  if (/硕士|研究生/.test(text)) return 3;
  if (/博士/.test(text)) return 4;
  return null;
}

function rangesOverlap(aMin, aMax, bMin, bMax) {
  return aMin <= bMax && bMin <= aMax;
}

function scoreTitle(job, criteria) {
  const terms = getSynonymTerms(criteria.keyword);
  const title = job.positionName ?? "";
  const text = getJobText(job);
  if (containsAny(title, terms)) {
    return { ratio: 1, reason: "岗位名称命中关键词或同义岗位方向。" };
  }
  if (containsAny(text, terms)) {
    return { ratio: 0.72, reason: "岗位描述或技能标签命中相关关键词。" };
  }
  return { ratio: 0.35, reason: "岗位方向与关键词关联较弱。" };
}

function scoreCity(job, criteria) {
  const expected = cleanText(criteria.city);
  const city = cleanText(job.city);
  if (!expected || expected === "全国") return { ratio: 0.85, reason: "城市设置为全国，保留多地机会。" };
  if (!city) return { ratio: 0.65, reason: "岗位城市未明确，按信息缺失中性处理。" };
  if (expected === "远程") {
    const remote = city.includes("远程") || cleanText(job.workType).includes("远程");
    return remote
      ? { ratio: 1, reason: "岗位支持远程工作。" }
      : { ratio: 0.35, reason: "岗位未标明远程，可能不符合远程偏好。" };
  }
  if (city.includes(expected)) return { ratio: 1, reason: "工作城市符合期望。" };
  if (city.includes("全国") || city.includes("多地") || city.includes("远程")) return { ratio: 0.82, reason: "岗位为全国/多地/远程机会，城市匹配较宽松。" };
  return { ratio: 0.38, reason: "工作城市与期望城市不同。" };
}

function scoreSalary(job, criteria) {
  const expectedMin = parseSalary(criteria.salaryMin);
  const expectedMax = parseSalary(criteria.salaryMax);
  const jobMin = parseSalary(job.salaryMin);
  const jobMax = parseSalary(job.salaryMax);
  if (!expectedMin && !expectedMax) return { ratio: 0.75, reason: "未填写期望薪资，薪资项按中性偏上处理。" };
  if (!jobMin || !jobMax) return { ratio: 0.65, reason: "岗位薪资字段缺失，未直接判为不匹配。" };
  const targetMin = expectedMin ?? 0;
  const targetMax = expectedMax ?? 999999;
  if (rangesOverlap(jobMin, jobMax, targetMin, targetMax)) return { ratio: 1, reason: "岗位薪资区间与期望区间有交集。" };
  if (jobMax < targetMin) return { ratio: 0.25, reason: "岗位薪资上限低于期望最低薪资。" };
  return { ratio: 0.7, reason: "岗位薪资高于期望上限，需确认职级和要求是否匹配。" };
}

function scoreExperience(job, criteria) {
  const expected = parseExperienceRange(criteria.experience);
  const required = parseExperienceRange(job.experience);
  if (!expected) return { ratio: 0.75, reason: "未填写工作经验，经验项按中性处理。" };
  if (!required) return { ratio: 0.65, reason: "岗位经验要求缺失，未直接判为不匹配。" };
  if (rangesOverlap(expected.min, expected.max, required.min, required.max)) return { ratio: 1, reason: "工作经验范围符合岗位要求。" };
  if (expected.max < required.min) return { ratio: 0.35, reason: "岗位要求年限高于当前期望经验段。" };
  return { ratio: 0.78, reason: "经验高于岗位要求，匹配度仍然保留。" };
}

function scoreEducation(job, criteria) {
  const expected = getEducationLevel(criteria.education);
  const required = getEducationLevel(job.education);
  if (expected == null || cleanText(criteria.education) === "") return { ratio: 0.75, reason: "未填写学历条件，学历项按中性处理。" };
  if (required == null) return { ratio: 0.65, reason: "岗位学历字段缺失，未直接判为不匹配。" };
  if (required === 0) return { ratio: 0.85, reason: "岗位学历要求不限。" };
  return expected >= required
    ? { ratio: 1, reason: "学历条件满足岗位要求。" }
    : { ratio: 0.35, reason: "岗位学历要求高于当前填写学历。" };
}

function scoreIndustry(job, criteria) {
  const expected = cleanText(criteria.industry);
  const industry = cleanText(job.industry);
  if (!expected || expected === "不限") return { ratio: 0.75, reason: "未限定行业，保留跨行业机会。" };
  if (!industry) return { ratio: 0.65, reason: "岗位行业字段缺失，按中性处理。" };
  return normalizeText(industry).includes(normalizeText(expected)) || normalizeText(expected).includes(normalizeText(industry))
    ? { ratio: 1, reason: "所属行业符合期望。" }
    : { ratio: 0.45, reason: "所属行业与期望行业不同。" };
}

function scoreWorkType(job, criteria) {
  const expected = cleanText(criteria.workType);
  const workType = cleanText(job.workType);
  if (!expected) return { ratio: 0.75, reason: "未限定工作类型，按中性处理。" };
  if (!workType) return { ratio: 0.65, reason: "岗位工作类型缺失，按中性处理。" };
  if (expected === workType) return { ratio: 1, reason: "工作类型符合偏好。" };
  if (expected === "远程" && (workType.includes("远程") || cleanText(job.city).includes("远程"))) {
    return { ratio: 1, reason: "岗位支持远程工作。" };
  }
  return { ratio: 0.35, reason: "工作类型与偏好不同。" };
}

function getMatchLevel(score) {
  const level = socialRecruitmentSearchConfig.scoreLevels.find((item) => score >= item.min && score <= item.max);
  return level?.label ?? "匹配度较低";
}

function buildRiskWarnings(job, dimensionScores) {
  const warnings = [];
  if (!job.sourceUrl && job.source !== "演示数据") warnings.push("真实岗位缺少有效来源链接，已不建议展示。");
  if (!job.sourceUrl && job.source === "演示数据") warnings.push("演示数据暂无原岗位链接，不能作为真实投递依据。");
  if (!job.salaryMin || !job.salaryMax) warnings.push("岗位薪资信息不完整，投递前需要二次核实。");
  if (!job.education) warnings.push("岗位学历要求未明确，建议查看原平台详情。");
  if (dimensionScores.city.ratio < 0.5) warnings.push("工作城市与期望不一致。");
  if (dimensionScores.experience.ratio < 0.5) warnings.push("经验年限可能不满足岗位要求。");
  return warnings;
}

function scoreJob(job, criteria) {
  const dimensions = {
    title: scoreTitle(job, criteria),
    city: scoreCity(job, criteria),
    salary: scoreSalary(job, criteria),
    experience: scoreExperience(job, criteria),
    education: scoreEducation(job, criteria),
    industry: scoreIndustry(job, criteria),
    workType: scoreWorkType(job, criteria),
  };
  const weighted = Object.entries(socialRecruitmentSearchConfig.weights).reduce((sum, [key, weight]) => {
    return sum + weight * dimensions[key].ratio;
  }, 0);
  const matchScore = Math.max(0, Math.min(100, Math.round(weighted)));
  return {
    ...job,
    matchScore,
    matchLevel: getMatchLevel(matchScore),
    matchReasons: Object.values(dimensions).map((item) => item.reason),
    riskWarnings: buildRiskWarnings(job, dimensions),
    scoreDetails: dimensions,
  };
}

function dedupeJobs(jobs) {
  const map = new Map();
  jobs.forEach((job) => {
    const key = [job.positionName, job.companyName, job.city].map(normalizeText).join("|");
    const existing = map.get(key);
    if (!existing || cleanText(job.publishedAt) > cleanText(existing.publishedAt)) {
      map.set(key, job);
    }
  });
  return Array.from(map.values());
}

function isRealJobDisplayable(job, mode) {
  if (mode !== "real") return true;
  return /^https?:\/\//i.test(cleanText(job.sourceUrl));
}

function filterCandidateJobs(jobs, criteria) {
  const terms = getSynonymTerms(criteria.keyword);
  const excludes = splitExcludeKeywords(criteria.excludeKeywords);
  return jobs.filter((job) => {
    const text = getJobText(job);
    const matchesKeyword = containsAny(text, terms);
    const blocked = excludes.some((keyword) => containsAny(text, [keyword]));
    return matchesKeyword && !blocked;
  });
}

function createCacheKey(criteria) {
  return JSON.stringify({
    keyword: cleanText(criteria.keyword),
    city: cleanText(criteria.city),
    salaryMin: cleanText(criteria.salaryMin),
    salaryMax: cleanText(criteria.salaryMax),
    experience: cleanText(criteria.experience),
    education: cleanText(criteria.education),
    industry: cleanText(criteria.industry),
    workType: cleanText(criteria.workType),
    excludeKeywords: splitExcludeKeywords(criteria.excludeKeywords),
  });
}

function createResponse(mode, jobs, criteria) {
  const scoredJobs = dedupeJobs(filterCandidateJobs(jobs, criteria))
    .map((job) => scoreJob(job, criteria))
    .filter((job) => isRealJobDisplayable(job, mode));
  return {
    success: true,
    mode,
    searchedAt: new Date().toISOString(),
    jobs: scoredJobs,
  };
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("搜索已取消。", "AbortError"));
    }, { once: true });
  });
}

async function requestSocialRecruitmentSearchApi(criteria, { signal } = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), socialRecruitmentSearchConfig.requestTimeoutMs);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const response = await fetch(socialRecruitmentSearchConfig.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...criteria,
        excludeKeywords: splitExcludeKeywords(criteria.excludeKeywords),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("社招搜索接口暂时不可用，请稍后重试。");
    }
    const data = await response.json();
    return {
      success: Boolean(data.success),
      mode: data.mode === "real" ? "real" : "demo",
      searchedAt: data.searchedAt ?? new Date().toISOString(),
      jobs: (data.jobs ?? []).filter((job) => isRealJobDisplayable(job, data.mode === "real" ? "real" : "demo")),
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("社招搜索超时，请缩小条件后重新搜索。");
      timeoutError.code = "TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function searchSocialRecruitmentJobs(criteria, options = {}) {
  if (!cleanText(criteria.keyword)) {
    const error = new Error("请填写岗位关键词。");
    error.code = "VALIDATION";
    throw error;
  }

  const cacheKey = createCacheKey(criteria);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < socialRecruitmentSearchConfig.cacheTtlMs) {
    return cached.data;
  }

  const data = socialRecruitmentSearchConfig.mode === "api"
    ? await requestSocialRecruitmentSearchApi(criteria, options)
    : await delay(socialRecruitmentSearchConfig.demoLatencyMs, options.signal).then(() => createResponse("demo", demoSocialRecruitmentJobs, criteria));

  searchCache.set(cacheKey, { createdAt: Date.now(), data });
  return data;
}

export async function recommendSocialJobs(resumeId, idealRole = "", options = {}) {
  const response = await fetch("/api/ai/jobs/social-recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeId, idealRole }),
    signal: options.signal,
  });
  if (!response.ok) {
    let message = "暂时无法获取最新岗位，请稍后重试。";
    try {
      const error = await response.json();
      if (error.message === "SEARCH_PROVIDER_NOT_CONFIGURED") message = "岗位搜索服务尚未配置。";
    } catch {
      // Keep the user-facing fallback above for non-JSON responses.
    }
    throw new Error(message);
  }
  const data = await response.json();
  const jobs = (Array.isArray(data.jobs) ? data.jobs : []).map((job, index) => ({
    id: job.id ?? `deepseek-social-${index}`,
    positionName: job.岗位名称 ?? job.positionName ?? job.title ?? "未命名岗位",
    companyName: job.公司名称 ?? job.companyName ?? "公司信息未注明",
    city: job.工作地点 ?? job.city ?? "地点未注明",
    salaryText: job.薪资范围 ?? job.salaryText ?? "薪资未注明",
    experience: job.经验要求 ?? job.experience ?? "经验要求未注明",
    description: job.岗位描述 ?? job.description ?? "",
    matchReasons: [job.匹配原因 ?? job.matchReason ?? ""].filter(Boolean),
    matchScore: Number(job.matchScore ?? job.匹配度 ?? 0),
    sourceUrl: job.岗位来源 ?? job.sourceUrl ?? "",
    applicationUrl: job.投递官网 ?? job.applicationUrl ?? job.applyUrl ?? "",
    source: job.来源 ?? job.source ?? "公司招聘官网",
  }));
  return { ...data, mode: "reference", jobs };
}

export function sortSocialRecruitmentJobs(jobs, sortBy) {
  const nextJobs = [...jobs];
  if (sortBy === "publishedAt") {
    return nextJobs.sort((a, b) => cleanText(b.publishedAt).localeCompare(cleanText(a.publishedAt)) || b.matchScore - a.matchScore);
  }
  if (sortBy === "salary") {
    return nextJobs.sort((a, b) => {
      const aSalary = (Number(a.salaryMax) || 0) + (Number(a.salaryMin) || 0);
      const bSalary = (Number(b.salaryMax) || 0) + (Number(b.salaryMin) || 0);
      return bSalary - aSalary || b.matchScore - a.matchScore;
    });
  }
  return nextJobs.sort((a, b) => b.matchScore - a.matchScore || cleanText(b.publishedAt).localeCompare(cleanText(a.publishedAt)));
}

export function formatSocialSalary(job) {
  if (job.salaryText) return job.salaryText;
  const min = Number(job.salaryMin);
  const max = Number(job.salaryMax);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return "薪资未注明";
  return `${min / 1000}k-${max / 1000}k`;
}

export { socialRecruitmentOptions };
