const DEFAULT_PAGE_SIZE = 10;
const pageCache = new Map();

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function requestJson(path, { signal } = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`招聘数据接口请求失败：HTTP ${response.status}`);
  }

  return response.json();
}

function normalizePage(result) {
  if (Array.isArray(result)) {
    return {
      content: result,
      page: 0,
      size: result.length,
      totalElements: result.length,
      totalPages: 1,
    };
  }

  if (Array.isArray(result?.content)) return result;

  return {
    content: [],
    page: 0,
    size: 0,
    totalElements: 0,
    totalPages: 0,
  };
}

export async function getRecruitmentCategories(options = {}) {
  const result = await requestJson("/api/recruitment/categories", options);
  return normalizePage(result).content;
}

export async function getRecruitmentCompanies(params = {}, options = {}) {
  return requestJson(`/api/recruitment/companies${buildQuery(params)}`, options);
}

export async function getRecruitmentCompanyDetail(slug, options = {}) {
  if (!slug) throw new Error("公司 slug 不能为空");
  return requestJson(`/api/recruitment/companies/${encodeURIComponent(slug)}`, options);
}

export async function getRecruitmentPositions(params = {}, options = {}) {
  return requestJson(`/api/recruitment/positions${buildQuery(params)}`, options);
}

export async function getRecruitmentPositionPage(params = {}, options = {}) {
  const page = Number(params.page ?? 1); // 前端 page 从 1 起
  const normalizedParams = {
    ...params,
    page: Math.max(0, page - 1), // 旧接口 /api/recruitment/positions 为 Spring Data，page 从 0 起
    size: Number(params.size ?? DEFAULT_PAGE_SIZE),
  };
  const path = `/api/recruitment/positions${buildQuery(normalizedParams)}`;
  const cacheKey = path;
  if (pageCache.has(cacheKey)) return pageCache.get(cacheKey);

  const result = normalizePage(await requestJson(path, options));
  pageCache.set(cacheKey, result);
  return result;
}

export async function getRecruitmentRecommendationPage(params = {}, options = {}) {
  const page = Number(params.page ?? 0);
  const normalizedParams = {
    ...params,
    page: Number.isFinite(page) && page >= 0 ? page : 0,
    size: Number(params.size ?? DEFAULT_PAGE_SIZE),
  };
  return normalizePage(await requestJson(`/api/recruitment/positions/recommend${buildQuery(normalizedParams)}`, options));
}

export async function getReferralCodes(params = {}, options = {}) {
  return requestJson(`/api/recruitment/referral-codes${buildQuery(params)}`, options);
}

/**
 * 校招岗位分页列表。后端入参 page/pageSize 必填，另有 5 个可选筛选字段；
 * 回参是自定义分页结构 {list,total,pageNum,pageSize,pages,...}，这里统一映射成
 * RecruitingMarketPage 认识的 {content,number,size,totalElements,totalPages}。
 */
export async function getCampusRecruitmentList(params = {}, options = {}) {
  const page = Number(params.page ?? 1); // 前后端 page 均从 1 起
  const pageSize = Number(params.pageSize ?? params.size ?? 10);
  const queryParams = {
    page,
    pageSize,
    recruitmentTargetFarewell: params.recruitmentTarget,
    position: params.position,
    city: params.city,
    recruitmentTargetEducationBackground: params.recruitmentBatch,
    businessType: params.businessType,
  };
  const result = await requestJson(`/api/campusRecruitment/findCampusRecruitment${buildQuery(queryParams)}`, options);
  const list = Array.isArray(result?.list) ? result.list : [];
  return {
    content: list,
    number: Number(result?.pageNum ?? page),
    size: Number(result?.pageSize ?? pageSize),
    totalElements: Number(result?.total ?? list.length),
    totalPages: Math.max(1, Number(result?.pages ?? 1)),
  };
}

/**
 * 实习岗位分页列表。后端入参 page/pageSize 必填，另有 5 个可选筛选字段；
 * 回参是自定义分页结构 {list,total,pageNum,pageSize,pages,...}，这里统一映射成
 * RecruitingMarketPage 认识的 {content,number,size,totalElements,totalPages}。
 */
export async function getInternshipList(params = {}, options = {}) {
  const page = Number(params.page ?? 1); // 前后端 page 均从 1 起
  const pageSize = Number(params.pageSize ?? params.size ?? 10);
  const queryParams = {
    page,
    pageSize,
    recruitmentTargetFarewell: params.recruitmentTarget,
    position: params.position,
    city: params.city,
    recruitmentTargetEducationBackground: params.recruitmentBatch,
    businessType: params.businessType,
  };
  const result = await requestJson(`/api/internship/findInternship${buildQuery(queryParams)}`, options);
  const list = Array.isArray(result?.list) ? result.list : [];
  return {
    content: list,
    number: Number(result?.pageNum ?? page),
    size: Number(result?.pageSize ?? pageSize),
    totalElements: Number(result?.total ?? list.length),
    totalPages: Math.max(1, Number(result?.pages ?? 1)),
  };
}

/**
 * 按简历文档精准匹配校招岗位。后端入参 page/pageSize（query，必填）+ file（multipart 文件）；
 * 回参为自定义分页结构 {list,total,pageNum,pageSize,pages,hasNext,hasPrevious}。
 */
export async function searchCampusRecruitmentByDocument({ page = 1, pageSize = 10, file } = {}, options = {}) {
  if (!file) throw new Error("简历文件不能为空");

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`/api/campusRecruitment/searchByDocument${buildQuery({ page, pageSize })}`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
    body: formData,
    signal: options.signal,
  });

  if (!response.ok) {
    let message = `文档匹配接口请求失败：HTTP ${response.status}`;
    try {
      const payload = await response.json();
      const detail = payload?.message || payload?.error || payload?.detail;
      if (detail) message = String(detail);
    } catch {
      // 无法解析错误体时保留默认提示
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * AI 岗位匹配。后端入参 requirement（query 字符串，当前岗位信息）+ file（multipart 简历文件）；
 * 回参为 String，仅返回匹配度分数。
 */
export async function aiJobMatch({ requirement, file } = {}, options = {}) {
  if (!file) throw new Error("简历文件不能为空");

  const formData = new FormData();
  formData.append("requirement", requirement ?? "");
  formData.append("file", file);

  const response = await fetch(`/api/campusRecruitment/aiJobMatch`, {
    method: "POST",
    credentials: "include",
    body: formData,
    signal: options.signal,
  });

  if (!response.ok) {
    let message = `AI岗位匹配接口请求失败：HTTP ${response.status}`;
    try {
      const payload = await response.json();
      const detail = payload?.message || payload?.error || payload?.detail;
      if (detail) message = String(detail);
    } catch {
      // 无法解析错误体时保留默认提示
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.text();
}

/**
 * 社招岗位智能匹配。后端入参 file（multipart 简历文件）；
 * 回参为 JSON：{ code, message, data }，其中 data 为字符串，
 * 内容包含公司名称、岗位信息与投递超链接。
 */
export async function jobSmartMatching({ file } = {}, options = {}) {
  if (!file) throw new Error("简历文件不能为空");

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/openRecruitment/jobSmartMatching", {
    method: "POST",
    credentials: "include",
    body: formData,
    signal: options.signal,
  });

  if (!response.ok) {
    let message = `智能匹配接口请求失败：HTTP ${response.status}`;
    try {
      const payload = await response.json();
      const detail = payload?.message || payload?.error || payload?.detail;
      if (detail) message = String(detail);
    } catch {
      // 无法解析错误体时保留默认提示
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json().catch(() => null);
  if (payload?.code != null && Number(payload.code) !== 200) {
    throw new Error(payload?.message || "智能匹配失败，请稍后重试。");
  }
  return typeof payload?.data === "string" ? payload.data : "";
}
