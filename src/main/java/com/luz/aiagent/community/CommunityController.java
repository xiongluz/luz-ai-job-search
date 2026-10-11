package com.luz.aiagent.community;

import com.luz.aiagent.community.CommunityDtos.CommunityComment;
import com.luz.aiagent.community.CommunityDtos.CommunityPost;
import com.luz.aiagent.community.CommunityDtos.CreateCommentRequest;
import com.luz.aiagent.community.CommunityDtos.CreatePostRequest;
import com.luz.aiagent.community.CommunityDtos.PageResponse;
import com.luz.aiagent.community.CommunityDtos.ReportRequest;
import com.luz.aiagent.community.CommunityDtos.UpdatePostRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/community")
public class CommunityController {
    private final CommunityService communityService;

    public CommunityController(CommunityService communityService) {
        this.communityService = communityService;
    }

    @GetMapping("/posts")
    public PageResponse<CommunityPost> listPosts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "recommended") String sort,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String tag
    ) {
        return communityService.listPosts(page, pageSize, category, sort, keyword, tag);
    }

    @GetMapping("/posts/{id}")
    public Map<String, CommunityPost> getPost(@PathVariable String id) {
        return Map.of("post", communityService.getPost(id));
    }

    @PostMapping("/posts")
    public Map<String, CommunityPost> createPost(
            @RequestBody CreatePostRequest request,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return Map.of("post", communityService.createPost(request, userId));
    }

    @PutMapping("/posts/{id}")
    public Map<String, CommunityPost> updatePost(@PathVariable String id, @RequestBody UpdatePostRequest request) {
        return Map.of("post", communityService.updatePost(id, request));
    }

    @DeleteMapping("/posts/{id}")
    public Map<String, Boolean> deletePost(@PathVariable String id) {
        communityService.deletePost(id);
        return Map.of("ok", true);
    }

    @PostMapping("/posts/{id}/like")
    public Map<String, CommunityPost> likePost(
            @PathVariable String id,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return Map.of("post", communityService.togglePostLike(id, userId, true));
    }

    @DeleteMapping("/posts/{id}/like")
    public Map<String, CommunityPost> unlikePost(
            @PathVariable String id,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return Map.of("post", communityService.togglePostLike(id, userId, false));
    }

    @PostMapping("/posts/{id}/bookmark")
    public Map<String, CommunityPost> bookmarkPost(
            @PathVariable String id,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return Map.of("post", communityService.toggleBookmark(id, userId, true));
    }

    @DeleteMapping("/posts/{id}/bookmark")
    public Map<String, CommunityPost> unbookmarkPost(
            @PathVariable String id,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return Map.of("post", communityService.toggleBookmark(id, userId, false));
    }

    @GetMapping("/posts/{id}/comments")
    public Map<String, List<CommunityComment>> listComments(@PathVariable String id) {
        return Map.of("comments", communityService.listComments(id));
    }

    @PostMapping("/posts/{id}/comments")
    public Map<String, CommunityComment> createComment(
            @PathVariable String id,
            @RequestBody CreateCommentRequest request,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return Map.of("comment", communityService.createComment(id, request, userId));
    }

    @DeleteMapping("/comments/{id}")
    public Map<String, Boolean> deleteComment(@PathVariable String id) {
        communityService.deleteComment(id);
        return Map.of("ok", true);
    }

    @PostMapping("/comments/{id}/like")
    public Map<String, CommunityComment> likeComment(
            @PathVariable String id,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return Map.of("comment", communityService.toggleCommentLike(id, userId, true));
    }

    @DeleteMapping("/comments/{id}/like")
    public Map<String, CommunityComment> unlikeComment(
            @PathVariable String id,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return Map.of("comment", communityService.toggleCommentLike(id, userId, false));
    }

    @GetMapping("/topics/hot")
    public Map<String, List<Map<String, Object>>> hotTopics() {
        return Map.of("topics", communityService.hotTopics());
    }

    @GetMapping("/users/active")
    public Map<String, List<Map<String, Object>>> activeUsers() {
        return Map.of("users", communityService.activeUsers());
    }

    @PostMapping("/reports")
    public Map<String, Boolean> report(
            @RequestBody ReportRequest request,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        communityService.report(request, userId);
        return Map.of("ok", true);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(Map.of("message", exception.getMessage()));
    }
}
