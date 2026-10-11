import React, { useEffect, useMemo, useState } from "react";
import { COMMUNITY_CATEGORIES, COMMUNITY_POST_TYPES } from "../communityMockData.js";
import {
  createCommunityComment,
  deleteCommunityComment,
  getCommunityComments,
  getCommunityHotPosts,
  getCommunityPostDetail,
  reportCommunityTarget,
  toggleCommunityBookmark,
  toggleCommunityCommentLike,
  toggleCommunityPostLike,
} from "../communityApi.js";
import { SHARE_ORIGIN, categoryLabel, currentUserBookmarked, currentUserLiked, formatTime, getPostIdFromPath, postTypeLabel, stripUnsafeText } from "./communityUtils.js";

const MAX_COMMENT_LENGTH = 500;

export default function CommunityPostDetailPage({ navigate, user, showToast }) {
  const postId = getPostIdFromPath();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [sort, setSort] = useState("hot");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      getCommunityPostDetail(postId, { signal: controller.signal }),
      getCommunityComments(postId, { signal: controller.signal }),
      getCommunityHotPosts({ signal: controller.signal }),
    ])
      .then(([detail, commentResult, hotResult]) => {
        setPost(detail.post);
        setComments(commentResult.comments ?? []);
        setRelated((hotResult.posts ?? []).filter((item) => item.id !== postId).slice(0, 4));
      })
      .catch((err) => setError(err.message || "帖子详情加载失败"))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [postId]);

  const sortedComments = useMemo(() => {
    const items = [...comments];
    if (sort === "latest") return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return items.sort((a, b) => b.likeCount - a.likeCount || new Date(b.createdAt) - new Date(a.createdAt));
  }, [comments, sort]);

  if (loading) return <div className="community-detail-skeleton glass-panel" />;
  if (error || !post) return <div className="community-empty glass-panel"><h3>帖子加载失败</h3><p>{error || "帖子不存在"}</p><button type="button" className="community-primary-button" onClick={() => navigate("/community")}>返回社区</button></div>;

  async function toggleLike() {
    const original = post;
    const like = !currentUserLiked(post, user);
    setPost({ ...post, likedBy: like ? [...(post.likedBy ?? []), user.id] : (post.likedBy ?? []).filter((id) => id !== user.id), likeCount: Math.max(0, post.likeCount + (like ? 1 : -1)) });
    try {
      const result = await toggleCommunityPostLike(post.id, like);
      if (result.post) setPost(result.post);
    } catch (err) {
      setPost(original);
      showToast(err.message || "点赞失败");
    }
  }

  async function toggleBookmark() {
    const original = post;
    const bookmark = !currentUserBookmarked(post, user);
    setPost({ ...post, bookmarkedBy: bookmark ? [...(post.bookmarkedBy ?? []), user.id] : (post.bookmarkedBy ?? []).filter((id) => id !== user.id), bookmarkCount: Math.max(0, post.bookmarkCount + (bookmark ? 1 : -1)) });
    try {
      const result = await toggleCommunityBookmark(post.id, bookmark);
      if (result.post) setPost(result.post);
    } catch (err) {
      setPost(original);
      showToast(err.message || "收藏失败");
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    const content = stripUnsafeText(commentText);
    if (!content) {
      showToast("评论不能为空");
      return;
    }
    try {
      const result = await createCommunityComment(post.id, { content, parentId: replyTo?.id ?? null });
      setComments((items) => [result.comment, ...items]);
      setCommentText("");
      setReplyTo(null);
      showToast("评论已发布");
    } catch (err) {
      showToast(err.message || "评论发布失败");
    }
  }

  async function likeComment(comment) {
    const like = !comment.likedBy?.includes(user.id);
    setComments((items) => items.map((item) => item.id === comment.id ? { ...item, likedBy: like ? [...(item.likedBy ?? []), user.id] : (item.likedBy ?? []).filter((id) => id !== user.id), likeCount: Math.max(0, item.likeCount + (like ? 1 : -1)) } : item));
    try {
      const result = await toggleCommunityCommentLike(comment.id, like);
      if (result.comment) setComments((items) => items.map((item) => item.id === comment.id ? result.comment : item));
    } catch (err) {
      showToast(err.message || "评论点赞失败");
    }
  }

  async function removeComment(comment) {
    if (!window.confirm("确认删除这条评论吗？")) return;
    try {
      await deleteCommunityComment(comment.id);
      setComments((items) => items.filter((item) => item.id !== comment.id));
      showToast("评论已删除");
    } catch (err) {
      showToast(err.message || "删除失败");
    }
  }

  async function reportPost() {
    try {
      await reportCommunityTarget({ targetType: "post", targetId: post.id, reason: "用户举报", description: "社区详情页举报" });
      showToast("举报已提交");
    } catch (err) {
      showToast(err.message || "举报失败");
    }
  }

  function sharePost() {
    navigator.clipboard?.writeText(`${SHARE_ORIGIN}/community/post/${post.id}`);
    showToast("分享链接已复制");
  }

  function goJobs() {
    const path = post.category === "internship" || post.topic?.includes("实习") ? "/internship" : "/campus";
    const query = new URLSearchParams();
    if (post.position) query.set("keyword", post.position);
    if (post.company) query.set("company", post.company);
    navigate(`${path}${query.toString() ? `?${query}` : ""}`);
  }

  return (
    <>
      <div className="community-breadcrumb"><button type="button" onClick={() => navigate("/")}>首页</button><span>&gt;</span><button type="button" onClick={() => navigate("/community")}>求职社区</button><span>&gt;</span><strong>帖子详情</strong></div>
      <article className="community-detail glass-panel">
        <div className="community-detail-kicker"><span>{categoryLabel(COMMUNITY_CATEGORIES, post.category)}</span><span>{postTypeLabel(COMMUNITY_POST_TYPES, post.postType)}</span></div>
        <h1>{post.title}</h1>
        <div className="community-detail-meta"><span className="community-avatar">{post.avatarText}</span><div><strong>{post.authorName}</strong><small>{post.authorRole} · {formatTime(post.createdAt)} · {post.viewCount.toLocaleString("zh-CN")} 浏览</small></div></div>
        <div className="community-detail-body">{post.content.split(/\n+/).map((line, index) => <p key={index}>{line}</p>)}</div>
        <div className="community-card-tags">{(post.tags ?? []).map((tag) => <span key={tag}>#{tag}</span>)}</div>
        <div className="community-detail-actions"><button type="button" className={currentUserLiked(post, user) ? "active" : ""} onClick={toggleLike}>点赞 {post.likeCount}</button><button type="button" className={currentUserBookmarked(post, user) ? "active" : ""} onClick={toggleBookmark}>收藏</button><button type="button" onClick={sharePost}>分享</button><button type="button" onClick={reportPost}>举报</button></div>
      </article>

      <section className="community-detail-cta glass-panel"><div><h2>把经验转成行动</h2><p>结合这篇内容，继续优化简历或查看相关校招、实习岗位。</p></div><div><button type="button" className="community-primary-button" onClick={() => navigate("/dashboard?mode=optimize")}>优化我的简历</button><button type="button" onClick={goJobs}>查看相关岗位</button></div></section>

      <section className="community-comments glass-panel">
        <div className="community-comments-head"><h2>评论区</h2><div><button type="button" className={sort === "hot" ? "active" : ""} onClick={() => setSort("hot")}>最热</button><button type="button" className={sort === "latest" ? "active" : ""} onClick={() => setSort("latest")}>最新</button></div></div>
        <form className="community-comment-editor" onSubmit={submitComment}>{replyTo && <p>回复 {replyTo.authorName} <button type="button" onClick={() => setReplyTo(null)}>取消</button></p>}<textarea value={commentText} maxLength={MAX_COMMENT_LENGTH} onChange={(e) => setCommentText(e.target.value)} placeholder="写下你的补充、疑问或建议" /><div><span>剩余 {MAX_COMMENT_LENGTH - commentText.length} 字</span><button type="submit" className="community-primary-button">发表评论</button></div></form>
        {sortedComments.length === 0 ? <p className="community-comment-empty">还没有评论，来提出第一个问题。</p> : sortedComments.map((comment) => <CommentItem key={comment.id} comment={comment} user={user} onReply={setReplyTo} onLike={likeComment} onDelete={removeComment} />)}
      </section>

      <section className="community-related"><div className="community-section-title"><h2>相关推荐</h2><p>继续看看相关讨论</p></div><div className="community-hot-grid">{related.map((item, index) => <button key={item.id} type="button" className="community-hot-card glass-panel" onClick={() => navigate(`/community/post/${encodeURIComponent(item.id)}`)}><span>No.{index + 1}</span><strong>{item.title}</strong><small>{categoryLabel(COMMUNITY_CATEGORIES, item.category)} · {item.viewCount.toLocaleString("zh-CN")} 浏览</small></button>)}</div></section>
    </>
  );
}

function CommentItem({ comment, user, onReply, onLike, onDelete }) {
  const canDelete = comment.userId === user?.id;
  return <div className="community-comment-item"><span className="community-avatar">{comment.avatarText}</span><div><div className="community-comment-title"><strong>{comment.authorName}</strong><small>{comment.authorRole} · {formatTime(comment.createdAt)}</small></div><p>{comment.content}</p><div className="community-comment-actions"><button type="button" className={comment.likedBy?.includes(user?.id) ? "active" : ""} onClick={() => onLike(comment)}>赞 {comment.likeCount}</button><button type="button" onClick={() => onReply(comment)}>回复</button>{canDelete && <button type="button" onClick={() => onDelete(comment)}>删除</button>}</div></div></div>;
}
