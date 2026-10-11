/**
 * 登录令牌的本地存储。
 *
 * <p>扫码登录成功后，/status 会返回一个已写入 Redis 的 token，前端把它存到
 * localStorage 里，供后续需要携带令牌的接口通过 {@link getAuthToken} 读取。</p>
 */
const AUTH_TOKEN_KEY = "gqld-auth-token";

/** 写入登录令牌；传入空值时移除。 */
export function setAuthToken(token) {
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

/** 读取当前登录令牌；未登录时为 null。 */
export function getAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

/** 移除登录令牌。 */
export function clearAuthToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}
