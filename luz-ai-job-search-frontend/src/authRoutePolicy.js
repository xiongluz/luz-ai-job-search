/** 去掉末尾斜杠并把空路径规范化为首页。 */
export function normalizePath(pathname) {
  return String(pathname || "/").replace(/\/+$/, "") || "/";
}

/** 从站内导航地址中提取规范化 pathname。 */
export function pathnameFromPath(path, origin = "http://localhost") {
  try {
    return normalizePath(new URL(path || "/", origin).pathname);
  } catch {
    return "/";
  }
}

/** 只有首页公开；业务页面和旧版工作台 hash 路径都必须先登录。 */
export function requiresLoginForPath(path, origin = "http://localhost") {
  return pathnameFromPath(path, origin) !== "/" || String(path || "").includes("#/workspace/");
}
