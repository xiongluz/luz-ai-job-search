package com.luz.aiagent.resume.jobai;

import java.time.Instant;
import java.util.List;

public final class JobMatchDtos {
    private JobMatchDtos() {
    }

    public record BatchMatchRequest(
            String resumeId,
            String resumeText,
            List<JobInfo> jobs
    ) {
    }

    public record JobInfo(
            Object jobId,
            String companyName,
            String positionName,
            String industry,
            String location,
            String education,
            String major,
            String description,
            String requirements
    ) {
    }

    public record MatchDimensions(
            int skills,
            int experience,
            int education,
            int keywords,
            int direction
    ) {
    }

    public record MatchResult(
            Object jobId,
            String status,
            Integer score,
            String level,
            MatchDimensions dimensions,
            List<String> strengths,
            List<String> gaps,
            List<String> missingKeywords,
            List<String> optimizationAdvice,
            Boolean demo,
            Boolean cached,
            String errorCode,
            String errorMessage,
            Instant createdAt
    ) {
    }

    public record BatchMatchResponse(
            int successCount,
            int failedCount,
            int total,
            int aiCallCount,
            int cacheHitCount,
            String model,
            List<MatchResult> results,
            Instant createdAt
    ) {
    }
}
