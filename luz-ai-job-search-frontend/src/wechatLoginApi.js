import { apiUrl } from "./apiConfig.js";

/**
 * 本地开发免扫码开关。import.meta.env.DEV 是 Vite 在构建时注入的常量，
 * 因此即使误把环境变量带进生产构建，也不会启用该路径。
 */
export const LOCAL_AUTH_BYPASS_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_AUTH_BYPASS === "true";

async function parseResponse(response) {
  const text = await response.text().catch(() => "");
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || "微信登录服务请求失败");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload ?? {};
}

function request(path, options = {}) {
  return fetch(apiUrl(path), {
    ...options,
    credentials: "include",
    headers: { Accept: "application/json", ...(options.headers || {}) },
  }).then(parseResponse);
}

/** 创建一条本地内存中的微信扫码登录会话。 */
export function createWechatLoginQr() {
  return request("/login/wechat/qrcode");
}

/** 查询指定 scene 的扫码登录状态。 */
export function getWechatLoginStatus(scene) {
  return request("/login/wechat/status?scene=" + encodeURIComponent(scene));
}

/** 获取已经扫码会话对应的微信公众号网页授权地址。 */
export function getWechatOAuthUrl(scene) {
  return request("/login/wechat/oauth/url?scene=" + encodeURIComponent(scene));
}

/** 查询由后端 HttpSession 维护的当前浏览器登录状态。 */
export function getWechatCurrentSession() {
  return request("/login/wechat/session");
}

/**
 * 在后端创建本机开发会话。
 *
 * 调用方必须同时检查 Vite 开发模式和 VITE_LOCAL_AUTH_BYPASS，后端还会独立校验
 * local profile、显式开关、内存仓库和 loopback 来源。
 */
export function createLocalDevSession() {
  return request("/login/wechat/dev-session", { method: "POST" });
}

/** 注销当前浏览器会话，随后可以安全切换微信账号。 */
export function logoutWechatSession() {
  return request("/login/wechat/logout", { method: "POST" });
}
