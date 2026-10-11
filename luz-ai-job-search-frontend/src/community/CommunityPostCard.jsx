import React from "react";
import { COMMUNITY_CATEGORIES } from "../communityMockData.js";
import { SHARE_ORIGIN, categoryLabel, currentUserBookmarked, currentUserLiked, formatTime } from "./communityUtils.js";

export default function CommunityPostCard({ post, user, navigate, onLike, onBookmark }) {
  const visibleTags = (post.tags ?? []).slice(0, 3);
  const extra = Math.max(0, (post.tags ?? []).length - visibleTags.length);

  function share(event) {
    event.stopPropagation();
    const url = `${SHARE_ORIGIN}/community/post/${post.id}`;
    navigator.clipboard?.writeText(url);
  }

  return (
    <article className="community-post-card glass-panel" onClick={() => navigate(`/community/post/${encodeURIComponent(post.id)}`)}>
      <div className="community-card-topline">
        <time>{formatTime(post.createdAt)}</time>
        <span>{categoryLabel(COMMUNITY_CATEGORIES, post.category)}</span>
      </div>
      <h3>{post.title}</h3>
      <p className="community-card-summary">{post.summary}</p>
      <div className="community-card-tags">
        {visibleTags.map((tag) => <span key={tag}>#{tag}</span>)}
        {extra > 0 && <span>+{extra}</span>}
      </div>
      <div className="community-card-footer">
        <div className="community-author">
          <span className="community-avatar">{post.avatarText || post.authorName?.slice(0, 1) || "律"}</span>
          <div><strong>{post.authorName}</strong><small>{post.authorRole}</small></div>
        </div>
        <div className="community-card-metrics" onClick={(event) => event.stopPropagation()}>
          <span>{post.viewCount.toLocaleString("zh-CN")} 浏览</span>
          <button type="button" className={currentUserLiked(post, user) ? "active" : ""} onClick={() => onLike(post)}>赞 {post.likeCount}</button>
          <span>评 {post.commentCount}</span>
          <button type="button" className={currentUserBookmarked(post, user) ? "active" : ""} onClick={() => onBookmark(post)}>收藏</button>
          <button type="button" onClick={share}>分享</button>
        </div>
      </div>
      <button type="button" className="community-read-more" onClick={(event) => { event.stopPropagation(); navigate(`/community/post/${encodeURIComponent(post.id)}`); }}>阅读全文 <span>→</span></button>
    </article>
  );
}
