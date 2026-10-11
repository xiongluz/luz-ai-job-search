const ADMIN_TOKEN_KEY = "gqld-recruitment-admin-token";

export function getRecruitmentAdminToken() {
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

export function setRecruitmentAdminToken(token) {
  if (token) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  else window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminJson(path, options = {}) {
  const token = getRecruitmentAdminToken();
  const headers = {
    Accept: "application/json",
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api/recruitment/admin${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || `管理员接口请求失败：HTTP ${response.status}`);
  return data;
}

export const recruitmentAdminApi = {
  login: (payload) => adminJson("/login", { method: "POST", body: JSON.stringify(payload) }),
  dashboard: () => adminJson("/dashboard"),
  companies: (page = 0, size = 20, q = "") => adminJson(`/companies?page=${page}&size=${size}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  createCompany: (payload) => adminJson("/companies", { method: "POST", body: JSON.stringify(payload) }),
  updateCompany: (id, payload) => adminJson(`/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  programs: (page = 0, size = 20) => adminJson(`/programs?page=${page}&size=${size}`),
  createProgram: (payload) => adminJson("/programs", { method: "POST", body: JSON.stringify(payload) }),
  updateProgram: (id, payload) => adminJson(`/programs/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  positions: (page = 0, size = 20, q = "") => adminJson(`/positions?page=${page}&size=${size}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  createPosition: (payload) => adminJson("/positions", { method: "POST", body: JSON.stringify(payload) }),
  updatePosition: (id, payload) => adminJson(`/positions/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  publishPosition: (id) => adminJson(`/positions/${id}/publish`, { method: "POST" }),
  archivePosition: (id) => adminJson(`/positions/${id}/archive`, { method: "POST" }),
  links: (page = 0, size = 20) => adminJson(`/application-links?page=${page}&size=${size}`),
  createLink: (payload) => adminJson("/application-links", { method: "POST", body: JSON.stringify(payload) }),
  updateLink: (id, payload) => adminJson(`/application-links/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  referrals: (page = 0, size = 20) => adminJson(`/referral-codes?page=${page}&size=${size}`),
  createReferral: (payload) => adminJson("/referral-codes", { method: "POST", body: JSON.stringify(payload) }),
  updateReferral: (id, payload) => adminJson(`/referral-codes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  importPreview: (file) => {
    const form = new FormData();
    form.append("file", file);
    return adminJson("/import/preview", { method: "POST", body: form });
  },
  importCommit: (file) => {
    const form = new FormData();
    form.append("file", file);
    return adminJson("/import/commit", { method: "POST", body: form });
  },
  auditLogs: (page = 0, size = 20) => adminJson(`/audit-logs?page=${page}&size=${size}`),
};
