package com.luz.aiagent.community;

import com.luz.aiagent.community.CommunityDtos.CommunityComment;
import com.luz.aiagent.community.CommunityDtos.CommunityPost;
import com.luz.aiagent.community.CommunityDtos.CreateCommentRequest;
import com.luz.aiagent.community.CommunityDtos.CreatePostRequest;
import com.luz.aiagent.community.CommunityDtos.PageResponse;
import com.luz.aiagent.community.CommunityDtos.ReportRequest;
import com.luz.aiagent.community.CommunityDtos.UpdatePostRequest;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class CommunityService {
    private static final int MAX_PAGE_SIZE = 50;
    private final Map<String, CommunityPost> posts = new ConcurrentHashMap<>();
    private final Map<String, CommunityComment> comments = new ConcurrentHashMap<>();
    private final List<Map<String, Object>> reports = new ArrayList<>();

    public CommunityService() {
        seed();
    }

    public PageResponse<CommunityPost> listPosts(int page, int pageSize, String category, String sort, String keyword, String tag) {
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(MAX_PAGE_SIZE, pageSize <= 0 ? 10 : pageSize));
        String normalizedKeyword = safe(keyword).toLowerCase(Locale.ROOT);
        String normalizedCategory = safe(category);
        String normalizedSort = StringUtils.hasText(sort) ? sort : "recommended";
        String normalizedTag = safe(tag);

        List<CommunityPost> filtered = posts.values().stream()
                .filter(post -> !"DELETED".equals(post.status()))
                .filter(post -> {
                    if (!StringUtils.hasText(normalizedCategory)
                            || Set.of("recommended", "latest").contains(normalizedCategory)) {
                        return true;
                    }
                    if ("featured".equals(normalizedCategory)) {
                        return post.featured();
                    }
                    return normalizedCategory.equals(post.category());
                })
                .filter(post -> {
                    if (!StringUtils.hasText(normalizedKeyword)) {
                        return true;
                    }
                    String source = String.join(" ", post.title(), post.summary(), post.content(), String.join(" ", post.tags()))
                            .toLowerCase(Locale.ROOT);
                    return source.contains(normalizedKeyword);
                })
                .filter(post -> !StringUtils.hasText(normalizedTag) || post.tags().contains(normalizedTag))
                .sorted(postComparator(normalizedSort, normalizedCategory))
                .toList();

        int from = Math.min(filtered.size(), safePage * safeSize);
        int to = Math.min(filtered.size(), from + safeSize);
        int totalPages = Math.max(1, (int) Math.ceil(filtered.size() / (double) safeSize));
        return new PageResponse<>(
                filtered.subList(from, to),
                safePage,
                safeSize,
                safeSize,
                filtered.size(),
                totalPages,
                safePage == 0,
                safePage >= totalPages - 1
        );
    }

    public CommunityPost getPost(String id) {
        CommunityPost post = requirePost(id);
        CommunityPost updated = new CommunityPost(
                post.id(), post.userId(), post.authorName(), post.authorRole(), post.avatarText(),
                post.category(), post.postType(), post.title(), post.summary(), post.content(), post.tags(),
                post.imageUrls(), post.viewCount() + 1, post.likeCount(), post.commentCount(),
                post.bookmarkCount(), post.featured(), post.anonymous(), post.status(),
                post.createdAt(), Instant.now(), post.likedBy(), post.bookmarkedBy()
        );
        posts.put(id, updated);
        return updated;
    }

    public CommunityPost createPost(CreatePostRequest request, String userId) {
        validatePost(request.title(), request.content(), request.category());
        Instant now = Instant.now();
        String actualUserId = StringUtils.hasText(userId) ? userId : firstText(request.userId(), "u_dev_guest");
        boolean anonymous = Boolean.TRUE.equals(request.anonymous());
        CommunityPost post = new CommunityPost(
                "post_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12),
                actualUserId,
                anonymous ? "匿名用户" : "律动访客",
                anonymous ? "社区成员" : "开发访客",
                anonymous ? "匿" : "律",
                safeOrDefault(request.category(), "interview"),
                safeOrDefault(request.postType(), "experience"),
                clean(request.title()),
                summarize(request.content()),
                clean(request.content()),
                cleanList(request.tags(), 5),
                cleanList(request.imageUrls(), 9),
                0,
                0,
                0,
                0,
                false,
                anonymous,
                "PUBLISHED",
                now,
                now,
                List.of(),
                List.of()
        );
        posts.put(post.id(), post);
        return post;
    }

    public CommunityPost updatePost(String id, UpdatePostRequest request) {
        CommunityPost post = requirePost(id);
        validatePost(request.title(), request.content(), request.category());
        CommunityPost updated = new CommunityPost(
                post.id(), post.userId(), post.authorName(), post.authorRole(), post.avatarText(),
                safeOrDefault(request.category(), post.category()),
                safeOrDefault(request.postType(), post.postType()),
                clean(request.title()),
                summarize(request.content()),
                clean(request.content()),
                cleanList(request.tags(), 5),
                cleanList(request.imageUrls(), 9),
                post.viewCount(),
                post.likeCount(),
                post.commentCount(),
                post.bookmarkCount(),
                post.featured(),
                Boolean.TRUE.equals(request.anonymous()),
                post.status(),
                post.createdAt(),
                Instant.now(),
                post.likedBy(),
                post.bookmarkedBy()
        );
        posts.put(id, updated);
        return updated;
    }

    public void deletePost(String id) {
        CommunityPost post = requirePost(id);
        CommunityPost deleted = new CommunityPost(
                post.id(), post.userId(), post.authorName(), post.authorRole(), post.avatarText(),
                post.category(), post.postType(), post.title(), post.summary(), post.content(), post.tags(),
                post.imageUrls(), post.viewCount(), post.likeCount(), post.commentCount(), post.bookmarkCount(),
                post.featured(), post.anonymous(), "DELETED", post.createdAt(), Instant.now(),
                post.likedBy(), post.bookmarkedBy()
        );
        posts.put(id, deleted);
    }

    public CommunityPost togglePostLike(String id, String userId, boolean like) {
        CommunityPost post = requirePost(id);
        List<String> likedBy = toggle(post.likedBy(), userId, like);
        CommunityPost updated = new CommunityPost(
                post.id(), post.userId(), post.authorName(), post.authorRole(), post.avatarText(),
                post.category(), post.postType(), post.title(), post.summary(), post.content(), post.tags(),
                post.imageUrls(), post.viewCount(), likedBy.size(), post.commentCount(), post.bookmarkCount(),
                post.featured(), post.anonymous(), post.status(), post.createdAt(), Instant.now(),
                likedBy, post.bookmarkedBy()
        );
        posts.put(id, updated);
        return updated;
    }

    public CommunityPost toggleBookmark(String id, String userId, boolean bookmark) {
        CommunityPost post = requirePost(id);
        List<String> bookmarkedBy = toggle(post.bookmarkedBy(), userId, bookmark);
        CommunityPost updated = new CommunityPost(
                post.id(), post.userId(), post.authorName(), post.authorRole(), post.avatarText(),
                post.category(), post.postType(), post.title(), post.summary(), post.content(), post.tags(),
                post.imageUrls(), post.viewCount(), post.likeCount(), post.commentCount(), bookmarkedBy.size(),
                post.featured(), post.anonymous(), post.status(), post.createdAt(), Instant.now(),
                post.likedBy(), bookmarkedBy
        );
        posts.put(id, updated);
        return updated;
    }

    public List<CommunityComment> listComments(String postId) {
        requirePost(postId);
        return comments.values().stream()
                .filter(comment -> postId.equals(comment.postId()))
                .filter(comment -> !"DELETED".equals(comment.status()))
                .sorted(Comparator.comparing(CommunityComment::createdAt).reversed())
                .toList();
    }

    public CommunityComment createComment(String postId, CreateCommentRequest request, String userId) {
        requirePost(postId);
        String content = clean(request.content());
        if (content.length() < 2 || content.length() > 500) {
            throw new IllegalArgumentException("评论需要 2-500 个字符");
        }
        Instant now = Instant.now();
        String actualUserId = StringUtils.hasText(userId) ? userId : "u_dev_guest";
        CommunityComment comment = new CommunityComment(
                "c_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12),
                postId,
                actualUserId,
                safe(request.parentId()),
                "律动访客",
                "开发访客",
                "律",
                content,
                "PUBLISHED",
                0,
                now,
                now,
                List.of()
        );
        comments.put(comment.id(), comment);
        changeCommentCount(postId, 1);
        return comment;
    }

    public void deleteComment(String id) {
        CommunityComment comment = requireComment(id);
        CommunityComment deleted = new CommunityComment(
                comment.id(), comment.postId(), comment.userId(), comment.parentId(), comment.authorName(),
                comment.authorRole(), comment.avatarText(), comment.content(), "DELETED",
                comment.likeCount(), comment.createdAt(), Instant.now(), comment.likedBy()
        );
        comments.put(id, deleted);
        changeCommentCount(comment.postId(), -1);
    }

    public CommunityComment toggleCommentLike(String id, String userId, boolean like) {
        CommunityComment comment = requireComment(id);
        List<String> likedBy = toggle(comment.likedBy(), userId, like);
        CommunityComment updated = new CommunityComment(
                comment.id(), comment.postId(), comment.userId(), comment.parentId(), comment.authorName(),
                comment.authorRole(), comment.avatarText(), comment.content(), comment.status(),
                likedBy.size(), comment.createdAt(), Instant.now(), likedBy
        );
        comments.put(id, updated);
        return updated;
    }

    public List<Map<String, Object>> hotTopics() {
        Map<String, Long> counts = posts.values().stream()
                .filter(post -> !"DELETED".equals(post.status()))
                .flatMap(post -> post.tags().stream())
                .collect(Collectors.groupingBy(tag -> tag, LinkedHashMap::new, Collectors.counting()));
        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(5)
                .map(entry -> Map.<String, Object>of("tag", entry.getKey(), "count", entry.getValue()))
                .toList();
    }

    public List<Map<String, Object>> activeUsers() {
        return List.of(
                Map.of("id", "u_dev_guest", "name", "律动访客", "role", "开发访客", "avatarText", "律", "contribution", posts.size() + comments.size()),
                Map.of("id", "u_alumni_1", "name", "南栀学长", "role", "在职学长", "avatarText", "南", "contribution", 42),
                Map.of("id", "u_hr_1", "name", "叶青", "role", "企业 HR", "avatarText", "叶", "contribution", 36)
        );
    }

    public void report(ReportRequest request, String userId) {
        reports.add(Map.of(
                "id", "r_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10),
                "reporterUserId", StringUtils.hasText(userId) ? userId : "u_dev_guest",
                "targetType", safeOrDefault(request.targetType(), "POST"),
                "targetId", safe(request.targetId()),
                "reason", safeOrDefault(request.reason(), "用户举报"),
                "description", safe(request.description()),
                "status", "PENDING",
                "createdAt", Instant.now()
        ));
    }

    private void seed() {
        Instant now = Instant.now();
        CommunityPost post = new CommunityPost(
                "post-bytedance-fe",
                "u_alumni_1",
                "南栀学长",
                "在职学长",
                "南",
                "interview",
                "experience",
                "字节跳动前端一面真实面经分享",
                "面试持续了大约50分钟，主要问了项目经历、浏览器缓存、Vue响应式原理、工程化和一道数组去重的手写题。",
                "一面整体节奏比较快，但面试官会顺着项目追问。\n\n准备建议：项目经历要能讲清背景、职责、技术选型和结果；浏览器缓存、事件循环、响应式原理需要能画出流程。",
                List.of("前端开发", "字节跳动", "校招"),
                List.of(),
                1380,
                126,
                1,
                42,
                true,
                false,
                "PUBLISHED",
                now.minusSeconds(3600 * 24),
                now.minusSeconds(3600 * 24),
                List.of(),
                List.of()
        );
        posts.put(post.id(), post);
        comments.put("c_seed_1", new CommunityComment(
                "c_seed_1",
                post.id(),
                "u_student_4",
                null,
                "青竹",
                "应届生",
                "青",
                "请问项目性能优化被问到具体指标了吗？如果没有线上数据该怎么讲？",
                "PUBLISHED",
                8,
                now.minusSeconds(3200),
                now.minusSeconds(3200),
                List.of()
        ));
    }

    private Comparator<CommunityPost> postComparator(String sort, String category) {
        if ("latest".equals(sort) || "latest".equals(category)) {
            return Comparator.comparing(CommunityPost::createdAt).reversed();
        }
        if ("hot".equals(sort)) {
            return Comparator.<CommunityPost>comparingLong(post -> post.likeCount() + post.commentCount() * 2 + post.viewCount() / 10).reversed();
        }
        if ("featured".equals(sort) || "featured".equals(category)) {
            return Comparator.<CommunityPost>comparingInt(post -> post.featured() ? 1 : 0).reversed()
                    .thenComparing(CommunityPost::createdAt, Comparator.reverseOrder());
        }
        return Comparator.<CommunityPost>comparingInt(post -> post.featured() ? 1 : 0).reversed()
                .thenComparingLong(post -> post.likeCount() + post.commentCount()).reversed();
    }

    private void validatePost(String title, String content, String category) {
        String cleanTitle = safe(title);
        if (cleanTitle.length() < 5 || cleanTitle.length() > 80) {
            throw new IllegalArgumentException("标题需要 5-80 个字符");
        }
        if (!StringUtils.hasText(category)) {
            throw new IllegalArgumentException("所属分类不能为空");
        }
        if (safe(content).length() < 10) {
            throw new IllegalArgumentException("正文至少需要 10 个字符");
        }
    }

    private CommunityPost requirePost(String id) {
        CommunityPost post = posts.get(id);
        if (post == null || "DELETED".equals(post.status())) {
            throw new IllegalArgumentException("帖子不存在");
        }
        return post;
    }

    private CommunityComment requireComment(String id) {
        CommunityComment comment = comments.get(id);
        if (comment == null || "DELETED".equals(comment.status())) {
            throw new IllegalArgumentException("评论不存在");
        }
        return comment;
    }

    private void changeCommentCount(String postId, long delta) {
        CommunityPost post = requirePost(postId);
        CommunityPost updated = new CommunityPost(
                post.id(), post.userId(), post.authorName(), post.authorRole(), post.avatarText(),
                post.category(), post.postType(), post.title(), post.summary(), post.content(), post.tags(),
                post.imageUrls(), post.viewCount(), post.likeCount(), Math.max(0, post.commentCount() + delta),
                post.bookmarkCount(), post.featured(), post.anonymous(), post.status(), post.createdAt(),
                Instant.now(), post.likedBy(), post.bookmarkedBy()
        );
        posts.put(postId, updated);
    }

    private List<String> toggle(List<String> values, String userId, boolean add) {
        String actualUserId = StringUtils.hasText(userId) ? userId : "u_dev_guest";
        List<String> next = new ArrayList<>(values == null ? List.of() : values);
        if (add && !next.contains(actualUserId)) {
            next.add(actualUserId);
        }
        if (!add) {
            next.removeIf(actualUserId::equals);
        }
        return List.copyOf(next);
    }

    private String summarize(String value) {
        String text = clean(value).replaceAll("\\s+", " ");
        return text.length() > 140 ? text.substring(0, 140) : text;
    }

    private List<String> cleanList(List<String> values, int limit) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
                .filter(Objects::nonNull)
                .map(this::clean)
                .filter(StringUtils::hasText)
                .distinct()
                .limit(limit)
                .toList();
    }

    private String firstText(String value, String fallback) {
        return StringUtils.hasText(value) ? value : fallback;
    }

    private String safeOrDefault(String value, String fallback) {
        String text = safe(value);
        return StringUtils.hasText(text) ? text : fallback;
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private String clean(String value) {
        return safe(value)
                .replaceAll("(?is)<script.*?>.*?</script>", "")
                .replace("<", "＜")
                .replace(">", "＞");
    }
}
