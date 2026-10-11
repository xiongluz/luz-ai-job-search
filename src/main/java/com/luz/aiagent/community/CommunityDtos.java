package com.luz.aiagent.community;

import java.time.Instant;
import java.util.List;

public final class CommunityDtos {
    private CommunityDtos() {
    }

    public record CommunityPost(
            String id,
            String userId,
            String authorName,
            String authorRole,
            String avatarText,
            String category,
            String postType,
            String title,
            String summary,
            String content,
            List<String> tags,
            List<String> imageUrls,
            long viewCount,
            long likeCount,
            long commentCount,
            long bookmarkCount,
            boolean featured,
            boolean anonymous,
            String status,
            Instant createdAt,
            Instant updatedAt,
            List<String> likedBy,
            List<String> bookmarkedBy
    ) {
    }

    public record CommunityComment(
            String id,
            String postId,
            String userId,
            String parentId,
            String authorName,
            String authorRole,
            String avatarText,
            String content,
            String status,
            long likeCount,
            Instant createdAt,
            Instant updatedAt,
            List<String> likedBy
    ) {
    }

    public record CreatePostRequest(
            String userId,
            String postType,
            String category,
            String title,
            String content,
            List<String> tags,
            List<String> imageUrls,
            Boolean anonymous
    ) {
    }

    public record UpdatePostRequest(
            String postType,
            String category,
            String title,
            String content,
            List<String> tags,
            List<String> imageUrls,
            Boolean anonymous
    ) {
    }

    public record CreateCommentRequest(String content, String parentId) {
    }

    public record ReportRequest(String targetType, String targetId, String reason, String description) {
    }

    public record PageResponse<T>(
            List<T> content,
            int page,
            int pageSize,
            int size,
            long totalElements,
            int totalPages,
            boolean first,
            boolean last
    ) {
    }
}
