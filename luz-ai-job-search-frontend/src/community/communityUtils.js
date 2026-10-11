export const SHARE_ORIGIN = "https://www.gqldjob.com";
export const PAGE_SIZE = 12;
export const YEARS = ["", "2026", "2025", "2024", "2023"];

export function readSearchParams() {
  return new URLSearchParams(window.location.search);
}

export function getPostIdFromPath() {
  const match = window.location.pathname.match(/^\/community\/post\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function formatTime(value) {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function categoryLabel(categories, key) {
  const normalized = key === "recommended" ? "recommend" : key;
  return categories.find((item) => item.key === normalized)?.label ?? "推荐";
}

export function postTypeLabel(types, key) {
  return types.find((item) => item.key === key)?.label ?? "经验分享";
}

export function updateCommunityQuery(navigate, patch) {
  const params = readSearchParams();
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null || value === "" || value === "all") params.delete(key);
    else params.set(key, String(value));
  });
  const query = params.toString();
  navigate(`/community${query ? `?${query}` : ""}`);
}

export function currentUserLiked(item, user) {
  return Boolean(user?.id && item?.likedBy?.includes(user.id));
}

export function currentUserBookmarked(item, user) {
  return Boolean(user?.id && item?.bookmarkedBy?.includes(user.id));
}

export function sanitizeTag(tag) {
  return String(tag ?? "").replace(/^#/, "").trim().slice(0, 18);
}

export function splitTags(value) {
  return String(value ?? "")
    .split(/[\s,，、]+/)
    .map(sanitizeTag)
    .filter(Boolean)
    .slice(0, 5);
}

export function stripUnsafeText(value) {
  return String(value ?? "").replace(/[<>]/g, "").trim();
}

