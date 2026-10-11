import {
  COMMUNITY_CURRENT_USER_KEY,
  COMMUNITY_LOCAL_STATE_KEY,
  communityActiveUsers,
  communityHotTopics,
  communityMockState,
  communityStats,
} from "./communityMockData.js";

const COMMUNITY_API_ROOT = "/api/community";
const MAX_PAGE_SIZE = 50;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readDevState() {
  if (typeof window === "undefined") return clone(communityMockState);
  try {
    const raw = window.localStorage.getItem(COMMUNITY_LOCAL_STATE_KEY);
    return raw ? JSON.parse(raw) : clone(communityMockState);
  } catch {
    return clone(communityMockState);
  }
}

function writeDevState(state) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COMMUNITY_LOCAL_STATE_KEY, JSON.stringify(state));
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "" || value === "all") return;
    search.set(key, String(value));
  });
  return search.toString();
}

function getCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMMUNITY_CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCurrentUser(user) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COMMUNITY_CURRENT_USER_KEY, JSON.stringify(user));
}

function ensureCurrentUser() {
  const current = getCurrentUser();
  if (current) return current;
  const guest = {
    id: "u_dev_guest",
    name: "律动访客",
    role: "开发访客",
    avatarText: "律",
    isAuthenticated: false,
  };
  setCurrentUser(guest);
  return guest;
}

async function requestJson(path, options = {}) {
  const currentUser = getCurrentUser();
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(currentUser?.id ? { "X-User-Id": currentUser.id } : {}),
      ...(options.headers ?? {}),
    },
    credentials: "include",
  });
  if (!response.ok) throw new Error(`社区接口请求失败：HTTP ${response.status}`);
  return response.status === 204 ? {} : response.json();
}

function normalizePost(post) {
  return {
    ...post,
    tags: Array.isArray(post.tags) ? post.tags : [],
    imageUrls: Array.isArray(post.imageUrls) ? post.imageUrls : [],
    likeCount: Number(post.likeCount ?? 0),
    commentCount: Number(post.commentCount ?? 0),
    viewCount: Number(post.viewCount ?? 0),
    bookmarkCount: Number(post.bookmarkCount ?? 0),
    featured: Boolean(post.featured),
    likedBy: Array.isArray(post.likedBy) ? post.likedBy : [],
    bookmarkedBy: Array.isArray(post.bookmarkedBy) ? post.bookmarkedBy : [],
  };
}

function normalizeComment(comment) {
  return {
    ...comment,
    likeCount: Number(comment.likeCount ?? 0),
    likedBy: Array.isArray(comment.likedBy) ? comment.likedBy : [],
  };
}

function normalizeCategory(category) {
  if (!category || ["recommend", "recommended", "latest", "featured"].includes(category)) return "recommend";
  return category;
}

function isAllTopic(topic) {
  return !topic || topic === "全部" || topic === "全部面经" || topic === "全部攻略";
}

function textIncludes(value, keyword) {
  return String(value ?? "").toLowerCase().includes(keyword.toLowerCase());
}

function filterPosts(posts, params = {}) {
  const category = normalizeCategory(String(params.category ?? "recommend"));
  const topic = String(params.topic ?? params.tag ?? "").trim();
  const keyword = String(params.keyword ?? "").trim();
  const company = String(params.company ?? "").trim();
  const position = String(params.position ?? "").trim();
  const year = String(params.year ?? "").trim();
  const postType = String(params.postType ?? "").trim();
  const sort = String(params.sort ?? "latest").trim();

  let result = posts.map(normalizePost).filter((post) => {
    if (category !== "recommend" && post.category !== category) return false;
    if (!isAllTopic(topic) && post.topic !== topic && !(post.tags ?? []).includes(topic)) return false;
    if (company && !textIncludes(post.company, company)) return false;
    if (position && !textIncludes(post.position, position)) return false;
    if (year && post.year !== year) return false;
    if (postType && post.postType !== postType) return false;
    if (keyword) {
      const searchable = [post.title, post.summary, post.content, post.company, post.position, post.topic, ...(post.tags ?? [])].join(" ");
      if (!textIncludes(searchable, keyword)) return false;
    }
    return true;
  });

  const byHeat = (post) => post.viewCount * 0.12 + post.likeCount * 1.8 + post.commentCount * 2.2 + Number(post.featured) * 80;
  if (sort === "views") result = result.sort((a, b) => b.viewCount - a.viewCount);
  else if (sort === "likes") result = result.sort((a, b) => b.likeCount - a.likeCount);
  else if (sort === "comments") result = result.sort((a, b) => b.commentCount - a.commentCount);
  else if (sort === "featured") result = result.sort((a, b) => Number(b.featured) - Number(a.featured) || byHeat(b) - byHeat(a));
  else result = result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return result;
}

function paginate(items, params = {}) {
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(params.pageSize ?? params.size ?? 12)));
  const page = Math.max(0, Number(params.page ?? 0));
  const totalElements = items.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize));
  const start = page * pageSize;
  return {
    content: items.slice(start, start + pageSize),
    page,
    pageSize,
    size: pageSize,
    totalElements,
    totalPages,
    first: page === 0,
    last: page >= totalPages - 1,
  };
}

async function fallback(action) {
  const state = readDevState();
  const result = await action(state);
  writeDevState(state);
  return { source: "mock", ...result };
}

export function getCommunityCurrentUser() {
  return ensureCurrentUser();
}

export function setCommunityCurrentUser(user) {
  setCurrentUser(user);
}

export async function getCommunityStats(options = {}) {
  try {
    return { source: "api", ...(await requestJson(`${COMMUNITY_API_ROOT}/stats`, options)) };
  } catch {
    return { source: "mock", stats: communityStats };
  }
}

export async function getCommunityPosts(params = {}, options = {}) {
  const query = buildQuery(params);
  try {
    const data = await requestJson(`${COMMUNITY_API_ROOT}/posts${query ? `?${query}` : ""}`, options);
    const content = data.content ?? data.posts ?? [];
    return { source: "api", ...data, content: content.map(normalizePost) };
  } catch {
    return fallback((state) => {
      const posts = filterPosts(state.posts, params);
      const page = paginate(posts, params);
      return { ...page, content: page.content.map(normalizePost) };
    });
  }
}

export async function getCommunityHotPosts(options = {}) {
  try {
    const data = await requestJson(`${COMMUNITY_API_ROOT}/posts/hot?page=0&pageSize=8`, options);
    return { source: "api", posts: (data.content ?? data.posts ?? []).map(normalizePost) };
  } catch {
    return fallback((state) => {
      const posts = [...state.posts]
        .map(normalizePost)
        .sort((a, b) => (b.viewCount + b.likeCount * 6 + b.commentCount * 10) - (a.viewCount + a.likeCount * 6 + a.commentCount * 10))
        .slice(0, 8);
      return { posts };
    });
  }
}

export async function getCommunityPostDetail(postId, options = {}) {
  try {
    const data = await requestJson(`${COMMUNITY_API_ROOT}/posts/${encodeURIComponent(postId)}`, options);
    return { source: "api", ...data, post: normalizePost(data.post ?? data) };
  } catch {
    return fallback((state) => {
      const post = state.posts.map(normalizePost).find((item) => item.id === postId);
      if (!post) throw new Error("帖子不存在");
      post.viewCount += 1;
      return { post };
    });
  }
}

export async function createCommunityPost(payload) {
  try {
    const data = await requestJson(`${COMMUNITY_API_ROOT}/posts`, { method: "POST", body: JSON.stringify(payload) });
    return { source: "api", ...data, post: normalizePost(data.post ?? data) };
  } catch {
    return fallback((state) => {
      const currentUser = ensureCurrentUser();
      const now = new Date().toISOString();
      const post = normalizePost({
        id: `post_${Date.now()}`,
        userId: currentUser.id,
        authorName: payload.anonymous ? "匿名用户" : currentUser.name,
        authorRole: currentUser.role,
        avatarText: currentUser.avatarText,
        category: payload.category,
        postType: payload.postType,
        topic: payload.topic || "全部",
        company: payload.company ?? "",
        position: payload.position ?? "",
        year: payload.year ?? "2026",
        title: payload.title,
        summary: String(payload.content ?? "").replace(/\s+/g, " ").slice(0, 140),
        content: payload.content,
        tags: payload.tags ?? [],
        imageUrls: payload.imageUrls ?? [],
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        bookmarkCount: 0,
        featured: false,
        anonymous: Boolean(payload.anonymous),
        createdAt: now,
        updatedAt: now,
        likedBy: [],
        bookmarkedBy: [],
      });
      state.posts.unshift(post);
      return { post };
    });
  }
}

async function updatePostSet(postId, field, enable, endpoint) {
  try {
    const data = await requestJson(`${COMMUNITY_API_ROOT}/posts/${encodeURIComponent(postId)}/${endpoint}`, { method: enable ? "POST" : "DELETE" });
    return { source: "api", ...data, post: normalizePost(data.post ?? data) };
  } catch {
    return fallback((state) => {
      const user = ensureCurrentUser();
      const post = state.posts.find((item) => item.id === postId);
      if (!post) throw new Error("帖子不存在");
      const listKey = field === "like" ? "likedBy" : "bookmarkedBy";
      const countKey = field === "like" ? "likeCount" : "bookmarkCount";
      const values = new Set(post[listKey] ?? []);
      if (enable) values.add(user.id);
      else values.delete(user.id);
      post[listKey] = [...values];
      post[countKey] = post[listKey].length;
      post.updatedAt = new Date().toISOString();
      return { post: normalizePost(post) };
    });
  }
}

export function toggleCommunityPostLike(postId, like) {
  return updatePostSet(postId, "like", like, "like");
}

export function toggleCommunityBookmark(postId, bookmark) {
  return updatePostSet(postId, "bookmark", bookmark, "bookmark");
}

export async function getCommunityComments(postId, options = {}) {
  try {
    const data = await requestJson(`${COMMUNITY_API_ROOT}/posts/${encodeURIComponent(postId)}/comments`, options);
    return { source: "api", ...data, comments: (data.comments ?? data.content ?? []).map(normalizeComment) };
  } catch {
    return fallback((state) => ({ comments: state.comments.filter((item) => item.postId === postId).map(normalizeComment) }));
  }
}

export async function createCommunityComment(postId, payload) {
  try {
    const data = await requestJson(`${COMMUNITY_API_ROOT}/posts/${encodeURIComponent(postId)}/comments`, { method: "POST", body: JSON.stringify(payload) });
    return { source: "api", ...data, comment: normalizeComment(data.comment ?? data) };
  } catch {
    return fallback((state) => {
      const currentUser = ensureCurrentUser();
      const post = state.posts.find((item) => item.id === postId);
      if (!post) throw new Error("帖子不存在");
      const comment = normalizeComment({
        id: `c_${Date.now()}`,
        postId,
        userId: currentUser.id,
        parentId: payload.parentId ?? null,
        content: payload.content,
        authorName: payload.anonymous ? "匿名用户" : currentUser.name,
        authorRole: currentUser.role,
        avatarText: currentUser.avatarText,
        likeCount: 0,
        likedBy: [],
        createdAt: new Date().toISOString(),
      });
      state.comments.unshift(comment);
      post.commentCount = Number(post.commentCount ?? 0) + 1;
      return { comment };
    });
  }
}

export async function toggleCommunityCommentLike(commentId, like) {
  try {
    const data = await requestJson(`${COMMUNITY_API_ROOT}/comments/${encodeURIComponent(commentId)}/like`, { method: like ? "POST" : "DELETE" });
    return { source: "api", ...data, comment: normalizeComment(data.comment ?? data) };
  } catch {
    return fallback((state) => {
      const user = ensureCurrentUser();
      const comment = state.comments.find((item) => item.id === commentId);
      if (!comment) throw new Error("评论不存在");
      const liked = new Set(comment.likedBy ?? []);
      if (like) liked.add(user.id);
      else liked.delete(user.id);
      comment.likedBy = [...liked];
      comment.likeCount = comment.likedBy.length;
      return { comment: normalizeComment(comment) };
    });
  }
}

export async function deleteCommunityComment(commentId) {
  try {
    return { source: "api", ...(await requestJson(`${COMMUNITY_API_ROOT}/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" })) };
  } catch {
    return fallback((state) => {
      const user = ensureCurrentUser();
      const index = state.comments.findIndex((item) => item.id === commentId);
      if (index < 0) throw new Error("评论不存在");
      const comment = state.comments[index];
      if (comment.userId !== user.id) throw new Error("无权删除该评论");
      state.comments.splice(index, 1);
      const post = state.posts.find((item) => item.id === comment.postId);
      if (post) post.commentCount = Math.max(0, Number(post.commentCount ?? 0) - 1);
      return { ok: true };
    });
  }
}

export async function getCommunityHotTopics() {
  try {
    return { source: "api", ...(await requestJson(`${COMMUNITY_API_ROOT}/topics/hot`)) };
  } catch {
    return { source: "mock", topics: communityHotTopics };
  }
}

export async function getCommunityActiveUsers() {
  try {
    return { source: "api", ...(await requestJson(`${COMMUNITY_API_ROOT}/users/active`)) };
  } catch {
    return { source: "mock", users: communityActiveUsers };
  }
}

export async function reportCommunityTarget(payload) {
  try {
    return { source: "api", ...(await requestJson(`${COMMUNITY_API_ROOT}/reports`, { method: "POST", body: JSON.stringify(payload) })) };
  } catch {
    return fallback((state) => {
      state.reports = state.reports ?? [];
      state.reports.unshift({ ...payload, id: `r_${Date.now()}`, status: "pending", createdAt: new Date().toISOString() });
      return { ok: true };
    });
  }
}

export function saveCommunityDraft(draft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("gqld-community-post-draft", JSON.stringify(draft));
}

export function loadCommunityDraft() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem("gqld-community-post-draft") || "null");
  } catch {
    return null;
  }
}
