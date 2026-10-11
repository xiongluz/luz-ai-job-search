import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_DRAFT_KEY,
  COMMUNITY_POST_TYPES,
  COMMUNITY_SORTS,
  COMMUNITY_TOPIC_GROUPS,
} from "../communityMockData.js";
import {
  createCommunityPost,
  getCommunityHotPosts,
  getCommunityPosts,
  getCommunityStats,
  loadCommunityDraft,
  saveCommunityDraft,
  toggleCommunityBookmark,
  toggleCommunityPostLike,
} from "../communityApi.js";
import {
  PAGE_SIZE,
  categoryLabel,
  currentUserBookmarked,
  currentUserLiked,
  readSearchParams,
  splitTags,
  stripUnsafeText,
  updateCommunityQuery,
} from "./communityUtils.js";
import CommunityPostCard from "./CommunityPostCard.jsx";
import CreateCommunityPostDialog from "./CreateCommunityPostDialog.jsx";

const quickEntries = ["热门面经", "我的收藏", "技术岗", "产品岗", "运营岗", "国企求职"];

function getQueryState() {
  const params = readSearchParams();
  return {
    category: params.get("category") || "recommend",
    topic: params.get("topic") || "",
    keyword: params.get("keyword") || "",
    company: params.get("company") || "",
    position: params.get("position") || "",
    year: params.get("year") || "",
    sort: params.get("sort") || "latest",
    postType: params.get("postType") || "",
    page: Math.max(1, Number(params.get("page") || 1)),
  };
}

export default function CommunityHome({ navigate, user, setUser, showToast }) {
  const [queryState, setQueryState] = useState(getQueryState);
  const [filterDraft, setFilterDraft] = useState(queryState);
  const [posts, setPosts] = useState([]);
  const [hotPosts, setHotPosts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [source, setSource] = useState("api");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const gridTopRef = useRef(null);

  useEffect(() => {
    const refresh = () => {
      const next = getQueryState();
      setQueryState(next);
      setFilterDraft(next);
    };
    refresh();
    window.addEventListener("popstate", refresh);
    return () => window.removeEventListener("popstate", refresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getCommunityPosts({ ...queryState, page: queryState.page - 1, pageSize: PAGE_SIZE }, { signal: controller.signal })
      .then((result) => {
        setSource(result.source);
        setPosts(result.content ?? []);
        setTotal(result.totalElements ?? result.total ?? 0);
        setTotalPages(result.totalPages ?? 1);
      })
      .catch((err) => setError(err.message || "社区内容加载失败"))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [queryState]);

  useEffect(() => {
    getCommunityStats().then((result) => setStats(result.stats ?? result));
    getCommunityHotPosts().then((result) => setHotPosts(result.posts ?? []));
  }, []);

  function patchQuery(patch, scrollToGrid = false) {
    const next = { ...queryState, ...patch };
    if (!Object.prototype.hasOwnProperty.call(patch, "page")) next.page = 1;
    setQueryState(next);
    setFilterDraft(next);
    updateCommunityQuery(navigate, next);
    if (scrollToGrid) window.setTimeout(() => gridTopRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  }

  function handleFilterSubmit(event) {
    event.preventDefault();
    patchQuery({
      keyword: stripUnsafeText(filterDraft.keyword),
      company: stripUnsafeText(filterDraft.company),
      position: stripUnsafeText(filterDraft.position),
      year: filterDraft.year,
      sort: filterDraft.sort,
      postType: filterDraft.postType,
      page: 1,
    }, true);
    setMobileFilterOpen(false);
  }

  function openCreateDialog() {
    if (!user?.isAuthenticated) showToast("当前还未接入真实登录，先以开发访客身份发布。");
    setDialogOpen(true);
  }

  function replacePost(nextPost) {
    setPosts((items) => items.map((item) => (item.id === nextPost.id ? nextPost : item)));
    setHotPosts((items) => items.map((item) => (item.id === nextPost.id ? nextPost : item)));
  }

  async function handleToggleLike(post) {
    const like = !currentUserLiked(post, user);
    replacePost({ ...post, likedBy: like ? [...(post.likedBy ?? []), user.id] : (post.likedBy ?? []).filter((id) => id !== user.id), likeCount: Math.max(0, post.likeCount + (like ? 1 : -1)) });
    try {
      const result = await toggleCommunityPostLike(post.id, like);
      if (result.post) replacePost(result.post);
    } catch (err) {
      replacePost(post);
      showToast(err.message || "点赞失败，已恢复原状态");
    }
  }

  async function handleToggleBookmark(post) {
    const bookmark = !currentUserBookmarked(post, user);
    replacePost({ ...post, bookmarkedBy: bookmark ? [...(post.bookmarkedBy ?? []), user.id] : (post.bookmarkedBy ?? []).filter((id) => id !== user.id), bookmarkCount: Math.max(0, post.bookmarkCount + (bookmark ? 1 : -1)) });
    try {
      const result = await toggleCommunityBookmark(post.id, bookmark);
      if (result.post) replacePost(result.post);
    } catch (err) {
      replacePost(post);
      showToast(err.message || "收藏失败，已恢复原状态");
    }
  }

  async function handleCreatePost(payload) {
    const result = await createCommunityPost(payload);
    setPosts((items) => [result.post, ...items].slice(0, PAGE_SIZE));
    setDialogOpen(false);
    showToast("发布成功");
    window.localStorage.removeItem(COMMUNITY_DRAFT_KEY);
  }

  const topics = useMemo(() => COMMUNITY_TOPIC_GROUPS[queryState.category] ?? COMMUNITY_TOPIC_GROUPS.recommend, [queryState.category]);
  const selectedCategoryLabel = categoryLabel(COMMUNITY_CATEGORIES, queryState.category);

  return (
    <>
      <section className="community-hero glass-panel">
        <div className="community-title-block">
          <div className="community-title-icon" aria-hidden="true">社</div>
          <div>
            <h1>求职社区</h1>
            <p>汇集真实面经、求职攻略和职场经验，和同行者一起拿到理想 Offer</p>
          </div>
        </div>
        <div className="community-hero-actions">
          <div className="community-stats-card">
            <Stat value={stats?.contentCount ?? 5087} label="社区内容" />
            <Stat value={stats?.todayUpdates ?? 26} label="今日更新" />
            <Stat value={stats?.activeUsers ?? 1280} label="活跃用户" />
          </div>
        </div>
      </section>

      <section className="community-publish-reward glass-panel" aria-label="内容发布奖励">
        <button type="button" className="community-primary-button" onClick={openCreateDialog}>+ 发布内容</button>
        <div>
          <strong><span aria-hidden="true">会员奖励</span> 发布内容经过审核后可换取会员使用天数</strong>
          <p>一天内容约等于一天会员，实际计算根据具体内容审核而定</p>
        </div>
        <nav className="community-primary-tabs" aria-label="社区一级分类">
          {COMMUNITY_CATEGORIES.map((item) => (
            <button key={item.key} type="button" className={item.key === queryState.category ? "active" : ""} onClick={() => patchQuery({ category: item.key, topic: "", page: 1 })}>{item.label}</button>
          ))}
        </nav>
      </section>

      <div className="community-topic-tags" aria-label="社区话题标签">
        {topics.map((topic) => (
          <button key={topic} type="button" className={(queryState.topic || topics[0]) === topic ? "active" : ""} onClick={() => patchQuery({ topic, page: 1 })}>{topic}</button>
        ))}
      </div>

      <button type="button" className="community-mobile-filter-button" onClick={() => setMobileFilterOpen(true)}>筛选社区内容</button>
      <section className={`community-filter-panel glass-panel ${mobileFilterOpen ? "is-open" : ""}`} aria-label="筛选社区内容">
        <div className="community-filter-head">
          <h2>筛选社区内容</h2>
          <button type="button" className="community-filter-close" onClick={() => setMobileFilterOpen(false)}>关闭</button>
        </div>
        <form className="community-filter-grid" onSubmit={handleFilterSubmit}>
          <label><span>搜索关键词</span><input value={filterDraft.keyword} onChange={(e) => setFilterDraft((v) => ({ ...v, keyword: e.target.value }))} placeholder="搜索帖子、公司、岗位或话题" /></label>
          <label><span>公司</span><input value={filterDraft.company} onChange={(e) => setFilterDraft((v) => ({ ...v, company: e.target.value }))} placeholder="请输入公司" /></label>
          <label><span>岗位</span><input value={filterDraft.position} onChange={(e) => setFilterDraft((v) => ({ ...v, position: e.target.value }))} placeholder="请输入岗位" /></label>
          <label><span>年份</span><select value={filterDraft.year} onChange={(e) => setFilterDraft((v) => ({ ...v, year: e.target.value }))}><option value="">全部年份</option><option value="2026">2026</option><option value="2025">2025</option><option value="2024">2024</option><option value="2023">2023</option></select></label>
          <label><span>排序方式</span><select value={filterDraft.sort} onChange={(e) => setFilterDraft((v) => ({ ...v, sort: e.target.value }))}>{COMMUNITY_SORTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <label><span>内容类型</span><select value={filterDraft.postType} onChange={(e) => setFilterDraft((v) => ({ ...v, postType: e.target.value }))}><option value="">全部内容</option>{COMMUNITY_POST_TYPES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <div className="community-filter-actions"><button type="submit" className="community-primary-button">搜索筛选</button><button type="button" onClick={() => patchQuery({ keyword: "", company: "", position: "", year: "", sort: "latest", postType: "", page: 1 }, true)}>清空条件</button></div>
        </form>
        <div className="community-quick-links">{quickEntries.map((item) => <button key={item} type="button" onClick={() => patchQuery({ topic: item.includes("岗") ? item : "", keyword: item.includes("面经") ? "面经" : item.includes("收藏") ? "" : queryState.keyword }, true)}>{item}</button>)}</div>
      </section>

      <section className="community-resume-banner glass-panel">
        <div><span aria-hidden="true" /> <h2>查看求职经验前，先让 AI 帮你检查简历</h2><p>结合目标岗位优化简历内容，提高简历与岗位的匹配度，让求职准备更有方向。</p></div>
        <button type="button" className="community-primary-button" onClick={() => navigate("/dashboard?mode=optimize")}>优化我的简历</button>
      </section>

      <CommunityHotSection posts={hotPosts} navigate={navigate} />

      <section ref={gridTopRef} className="community-content-section">
        <div className="community-section-title"><h2>社区精选</h2><p>找到 {total || posts.length} 条内容 · 当前分类：{selectedCategoryLabel}</p></div>
        {loading ? <CommunitySkeleton /> : error ? <CommunityEmptyState title="社区内容加载失败" description={error} actionLabel="重新加载" onAction={() => setQueryState({ ...queryState })} /> : posts.length === 0 ? <CommunityEmptyState title="没有找到相关内容" description="换个关键词、公司或岗位再试试，也可以发布第一条讨论。" actionLabel="发布内容" onAction={openCreateDialog} /> : (
          <div className="community-post-grid">
            {posts.map((post) => <CommunityPostCard key={post.id} post={post} user={user} navigate={navigate} onLike={handleToggleLike} onBookmark={handleToggleBookmark} />)}
          </div>
        )}
        <CommunityPagination current={queryState.page} totalPages={totalPages} onChange={(next) => patchQuery({ page: next }, true)} />
      </section>

      <CreateCommunityPostDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSubmit={handleCreatePost} showToast={showToast} initialCategory={queryState.category} initialTopic={queryState.topic} />
    </>
  );
}

function Stat({ value, label }) {
  return <div className="community-stat"><strong>{Number(value).toLocaleString("zh-CN")}</strong><span>{label}</span></div>;
}

function CommunityBreadcrumb({ navigate }) {
  return <div className="community-breadcrumb"><button type="button" onClick={() => navigate("/")}>首页</button><span>&gt;</span><strong>求职社区</strong></div>;
}

function CommunityHotSection({ posts, navigate }) {
  return (
    <section className="community-hot-section">
      <div className="community-section-title"><h2>热门内容</h2><p>正在被集中讨论的求职经验与攻略</p></div>
      <div className="community-hot-grid">
        {posts.slice(0, 8).map((post, index) => (
          <button key={post.id} type="button" className="community-hot-card glass-panel" onClick={() => navigate(`/community/post/${encodeURIComponent(post.id)}`)}>
            <span className={index < 3 ? "top" : ""}>No.{index + 1}</span>
            <strong>{post.title}</strong>
            <small>{categoryLabel(COMMUNITY_CATEGORIES, post.category)} · {post.viewCount.toLocaleString("zh-CN")} 浏览 · {new Date(post.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function CommunitySkeleton() {
  return <div className="community-post-grid">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="community-skeleton-card glass-panel" />)}</div>;
}

function CommunityEmptyState({ title, description, actionLabel, onAction }) {
  return <div className="community-empty glass-panel"><h3>{title}</h3><p>{description}</p>{actionLabel && <button type="button" className="community-primary-button" onClick={onAction}>{actionLabel}</button>}</div>;
}

function CommunityPagination({ current, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1);
  return <nav className="community-pagination" aria-label="社区分页"><button type="button" disabled={current <= 1} onClick={() => onChange(current - 1)}>上一页</button>{pages.map((page) => <button key={page} type="button" className={page === current ? "active" : ""} onClick={() => onChange(page)}>{page}</button>)}{totalPages > 5 && <span>…</span>}<button type="button" disabled={current >= totalPages} onClick={() => onChange(current + 1)}>下一页</button></nav>;
}
