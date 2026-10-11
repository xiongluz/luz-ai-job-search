package com.luz.aiagent.resume.diagnosis;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class DiagnosisDtos {
    private DiagnosisDtos() {
    }

    public record UploadResumeResponse(
            String resumeId,
            String fileName,
            String fileType,
            long fileSize,
            String status,
            Instant uploadedAt,
            int textLength,
            String source
    ) {
    }

    public record DiagnoseRequest(
            String resumeId,
            String resumeName,
            String resumeText,
            String diagnosisType,
            String jobType,
            String jobId,
            String jobDescription,
            String requestId
    ) {
    }

    public record DiagnosisChatRequest(
            String message,
            String requestId
    ) {
    }

    public record DiagnosisChatResponse(
            String diagnosisId,
            String answer,
            Instant createdAt
    ) {
    }

    public record DiagnosisReport(
            String diagnosisId,
            String resumeId,
            String resumeName,
            String resumeVersion,
            String diagnosisType,
            String jobType,
            String jobId,
            String targetJobName,
            Instant createdAt,
            boolean persisted,
            boolean informationSufficient,
            Integer overallScore,
            String level,
            String summary,
            Statistics statistics,
            CoreMetrics coreMetrics,
            Dimensions dimensions,
            List<String> tags,
            List<String> strengths,
            List<Issue> issues,
            Issue priorityIssue,
            List<Recommendation> recommendations,
            List<Detail> details,
            String disclaimer
    ) {
    }

    public record Statistics(
            Integer textLength,
            Integer educationCount,
            Integer experienceCount,
            Integer projectCount,
            Integer quantifiedAchievementCount
    ) {
    }

    public record CoreMetrics(
            Integer readability,
            Integer evidenceDensity,
            Integer applicationReadiness,
            Integer jobMatch
    ) {
    }

    public record Dimensions(
            Integer completeness,
            Integer jobMatch,
            Integer clarity,
            Integer achievementImpact,
            Integer structure,
            Integer keywordCoverage,
            Integer relevance
    ) {
    }

    public record Issue(
            String id,
            String title,
            String tag,
            String whyImportant,
            String impact,
            String suggestion,
            String evidenceSnippet
    ) {
    }

    public record Recommendation(
            String id,
            String level,
            String priority,
            String title,
            String reason
    ) {
    }

    public record Detail(
            String key,
            String name,
            Integer score,
            String currentPerformance,
            List<String> issues,
            List<String> evidence,
            List<String> suggestions
    ) {
    }

    public record StoredResume(
            String resumeId,
            String fileName,
            String fileType,
            long fileSize,
            String text,
            Instant uploadedAt
    ) {
    }

    @SuppressWarnings("unchecked")
    public static <T> T value(Map<String, Object> map, String key, T fallback) {
        Object value = map.get(key);
        return value == null ? fallback : (T) value;
    }
}
