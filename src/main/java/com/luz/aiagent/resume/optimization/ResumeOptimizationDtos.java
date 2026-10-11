package com.luz.aiagent.resume.optimization;

import java.time.Instant;
import java.util.List;

public final class ResumeOptimizationDtos {
    private ResumeOptimizationDtos() {
    }

    public record OptimizeResumeRequest(
            String resumeId,
            String resumeName,
            String diagnosisId,
            String issueId,
            String jobId,
            String jobType,
            String targetRole,
            String targetCompany,
            String jobDescription,
            String requestId
    ) {
    }

    public record OptimizationReport(
            String optimizationId,
            String resumeId,
            String resumeName,
            String diagnosisId,
            String issueId,
            String jobId,
            String jobType,
            String targetRole,
            String company,
            String title,
            String summary,
            List<String> summaryPoints,
            List<String> keywords,
            List<OptimizationTask> tasks,
            List<String> warnings,
            boolean persisted,
            boolean modelShared,
            String source,
            Instant createdAt,
            String disclaimer
    ) {
    }

    public record OptimizationTask(
            String id,
            String section,
            String priority,
            String before,
            String after,
            String reason,
            String evidence,
            String actionType,
            String acceptanceCriteria
    ) {
    }
}
