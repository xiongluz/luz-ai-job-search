package com.luz.aiagent.resume.jobai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.luz.aiagent.ai.OpenAiCompatibleChatClient;
import com.luz.aiagent.ai.OpenAiProperties;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.StoredResume;
import com.luz.aiagent.resume.diagnosis.ResumeDiagnosisService;
import com.luz.aiagent.resume.jobai.JobMatchDtos.BatchMatchRequest;
import com.luz.aiagent.resume.jobai.JobMatchDtos.BatchMatchResponse;
import com.luz.aiagent.resume.jobai.JobMatchDtos.JobInfo;
import com.luz.aiagent.resume.jobai.JobMatchDtos.MatchDimensions;
import com.luz.aiagent.resume.jobai.JobMatchDtos.MatchResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

@Service
@Slf4j
public class JobMatchService {
    private static final int MAX_BATCH_JOBS = 20;
    private static final int CHUNK_SIZE = 5;
    private static final int MAX_CACHE_SIZE = 2000;
    private static final Duration CACHE_TTL = Duration.ofHours(24);
    private static final int MAX_RESUME_CHARS = 7000;
    private static final int MAX_JOB_TEXT_CHARS = 1400;
    private static final int MAX_LIST_ITEMS = 6;
    private static final int MATCH_AI_ATTEMPTS = 2;
    private static final String SYSTEM_PROMPT = """
            You are a rigorous Chinese job-resume matching assistant.
            Only judge from the provided resume and job requirements.
            Do not invent education, company, project, internship, award, skill, metric, or experience.
            Do not raise the score because of company reputation.
            Return one strict JSON object only. No Markdown. No code fence.
            Score each dimension from 0 to 100 using evidence in the resume and job.
            """;

    private final OpenAiCompatibleChatClient aiClient;
    private final OpenAiProperties properties;
    private final ResumeDiagnosisService resumeDiagnosisService;
    private final ObjectMapper objectMapper;
    private final ConcurrentMap<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public JobMatchService(OpenAiCompatibleChatClient aiClient,
                           OpenAiProperties properties,
                           ResumeDiagnosisService resumeDiagnosisService) {
        this.aiClient = aiClient;
        this.properties = properties;
        this.resumeDiagnosisService = resumeDiagnosisService;
        this.objectMapper = new ObjectMapper();
    }

    public BatchMatchResponse batchMatch(BatchMatchRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body is required.");
        }
        List<JobInfo> jobs = request.jobs() == null ? List.of() : request.jobs().stream().filter(Objects::nonNull).toList();
        if (jobs.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "jobs must contain at least 1 job.");
        }
        if (jobs.size() > MAX_BATCH_JOBS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "jobs cannot exceed 20.");
        }

        String resumeText = resolveResumeText(request.resumeId(), request.resumeText());
        if (!StringUtils.hasText(resumeText) || resumeText.length() < 30) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "resume text is empty or too short.");
        }

        String sanitizedResume = sanitizeResumeForModel(resumeText);
        String resumeFingerprint = sha256(normalizeText(resumeText));
        List<PendingJob> pending = new ArrayList<>();
        List<PendingJob> ordered = new ArrayList<>();
        AtomicInteger cacheHits = new AtomicInteger();
        AtomicInteger aiCalls = new AtomicInteger();

        for (int index = 0; index < jobs.size(); index++) {
            JobInfo job = normalizeJob(jobs.get(index), index);
            String cacheKey = cacheKey(resumeFingerprint, job);
            PendingJob pendingJob = new PendingJob(job, cacheKey);
            ordered.add(pendingJob);
            MatchResult cached = readCache(cacheKey);
            if (cached != null) {
                cacheHits.incrementAndGet();
                pendingJob.result(withCached(cached, true));
            } else {
                pending.add(pendingJob);
            }
        }

        if (!pending.isEmpty()) {
            ExecutorService executor = Executors.newFixedThreadPool(Math.min(4, pending.size()));
            try {
                List<CompletableFuture<Void>> futures = pending.stream()
                        .map(pendingJob -> CompletableFuture.runAsync(() -> matchOnePendingJob(sanitizedResume, pendingJob, aiCalls), executor))
                        .toList();
                CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
            } finally {
                executor.shutdownNow();
            }
        }

        List<MatchResult> results = ordered.stream()
                .map(pendingJob -> pendingJob.result() == null
                        ? failedResult(pendingJob.job(), "AI_INVALID_RESPONSE", "AI response did not include this job.")
                        : pendingJob.result())
                .toList();
        int successCount = (int) results.stream().filter(result -> "SUCCESS".equals(result.status())).count();
        int failedCount = results.size() - successCount;
        return new BatchMatchResponse(successCount, failedCount, results.size(), aiCalls.get(), cacheHits.get(), model(), results, Instant.now());
    }

    public Map<String, Object> matchSingle(Map<String, Object> request) {
        JobInfo job = jobFromMap(request == null ? Map.of() : request);
        String resumeId = text(request, "resumeId");
        String resumeText = text(request, "resumeText");
        String resolvedResume = resolveResumeText(resumeId, resumeText);
        String resumeFingerprint = sha256(normalizeText(resolvedResume));
        String cacheKey = cacheKey(resumeFingerprint, job);
        MatchResult cached = readCache(cacheKey);
        MatchResult result;
        if (cached != null) {
            result = withCached(cached, true);
        } else {
            result = matchJob(sanitizeResumeForModel(resolvedResume), job, new AtomicInteger());
            if ("SUCCESS".equals(result.status())) {
                putCache(cacheKey, withCached(result, false));
            }
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jobId", result.jobId());
        response.put("status", result.status());
        response.put("score", result.score());
        response.put("level", result.level());
        response.put("dimensions", result.dimensions());
        response.put("strengths", result.strengths());
        response.put("gaps", result.gaps());
        response.put("missingKeywords", result.missingKeywords());
        response.put("optimizationAdvice", result.optimizationAdvice());
        response.put("demo", false);
        response.put("cached", result.cached());
        response.put("source", "openai-compatible");
        response.put("model", model());
        response.put("createdAt", result.createdAt());
        if (!"SUCCESS".equals(result.status())) {
            response.put("errorCode", result.errorCode());
            response.put("errorMessage", result.errorMessage());
        }
        if (result.dimensions() != null) {
            response.put("overallScore", result.score());
            response.put("skillScore", result.dimensions().skills());
            response.put("experienceScore", result.dimensions().experience());
            response.put("educationScore", result.dimensions().education());
            response.put("keywordScore", result.dimensions().keywords());
        }
        response.put("recommendation", firstText(result.optimizationAdvice(), "请结合岗位JD优化简历表达。"));
        response.put("shouldApply", shouldApply(result.score()));
        return response;
    }

    private void matchOnePendingJob(String sanitizedResume, PendingJob pendingJob, AtomicInteger aiCalls) {
        long begin = System.currentTimeMillis();
        try {
            MatchResult result = matchJob(sanitizedResume, pendingJob.job(), aiCalls);
            pendingJob.result(result);
            if ("SUCCESS".equals(result.status())) {
                putCache(pendingJob.cacheKey(), withCached(result, false));
            }
            log.info("job match item finished: jobId={}, model={}, elapsedMs={}", safeJobId(pendingJob.job()), model(), System.currentTimeMillis() - begin);
        } catch (Exception error) {
            log.warn("job match item failed: jobId={}, model={}, reason={}", safeJobId(pendingJob.job()), model(), safeError(error));
            pendingJob.result(failedResult(pendingJob.job(), "AI_UPSTREAM_ERROR", safeError(error)));
        }
    }

    private MatchResult matchJob(String sanitizedResume, JobInfo job, AtomicInteger aiCalls) {
        aiCalls.incrementAndGet();
        try {
            String prompt = buildPrompt(sanitizedResume, List.of(job));
            String content = aiClient.completeJsonOnce(SYSTEM_PROMPT, prompt, MATCH_AI_ATTEMPTS);
            JsonNode root = objectMapper.readTree(extractJson(content));
            JsonNode payload = root.path("results");
            JsonNode item = root;
            if (payload.isArray()) {
                if (payload.isEmpty()) {
                    throw new IllegalStateException("AI response results is empty.");
                }
                item = payload.path(0);
            } else if (!root.isObject()) {
                throw new IllegalStateException("AI response is not a JSON object.");
            }
            Object jobId = jsonScalar(item.path("jobId"));
            MatchDimensions dimensions = normalizeDimensions(item.path("dimensions"));
            int score = weightedScore(dimensions);
            return new MatchResult(
                    jobId == null ? job.jobId() : jobId,
                    "SUCCESS",
                    score,
                    levelOf(score),
                    dimensions,
                    stringList(item.path("strengths")),
                    stringList(item.path("gaps")),
                    stringList(item.path("missingKeywords")),
                    stringList(item.path("optimizationAdvice")),
                    false,
                    false,
                    null,
                    null,
                    Instant.now()
            );
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("AI response is not valid JSON.", error);
        }
    }

    private String buildPrompt(String sanitizedResume, List<JobInfo> jobs) throws JsonProcessingException {
        List<Map<String, Object>> jobPayload = jobs.stream().map(job -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("jobId", jobKey(job));
            item.put("companyName", clean(job.companyName(), 80));
            item.put("positionName", clean(job.positionName(), 80));
            item.put("industry", clean(job.industry(), 80));
            item.put("location", clean(job.location(), 80));
            item.put("education", clean(job.education(), 120));
            item.put("major", clean(job.major(), 120));
            item.put("description", clean(job.description(), MAX_JOB_TEXT_CHARS));
            item.put("requirements", clean(job.requirements(), MAX_JOB_TEXT_CHARS));
            return item;
        }).toList();
        String jobsJson = objectMapper.writeValueAsString(jobPayload);
        return """
                Analyze the resume against each job below.
                The model must output dimensions only; backend calculates final weighted score.
                Dimensions:
                - skills: skill and technology match
                - experience: project/internship/work experience match
                - education: education and major match
                - keywords: keyword coverage
                - direction: role direction and responsibility fit

                Return ONLY this JSON shape:
                {
                  "results": [
                    {
                      "jobId": "same jobId from input",
                      "dimensions": {
                        "skills": 0,
                        "experience": 0,
                        "education": 0,
                        "keywords": 0,
                        "direction": 0
                      },
                      "strengths": ["specific evidence-based strength"],
                      "gaps": ["specific evidence-based gap"],
                      "missingKeywords": ["keyword"],
                      "optimizationAdvice": ["actionable resume advice"]
                    }
                  ]
                }

                Rules:
                1. Use only the resume and job text. Do not invent anything.
                2. If evidence is weak, give conservative dimension scores.
                3. Do not reward company fame.
                4. Lists should be concise Chinese, 1 to 4 items each.
                5. No Markdown and no code fences.

                Sanitized resume text:
                %s

                Jobs JSON:
                %s
                """.formatted(clean(sanitizedResume, MAX_RESUME_CHARS), jobsJson);
    }

    private String resolveResumeText(String resumeId, String resumeText) {
        if (StringUtils.hasText(resumeId)) {
            try {
                StoredResume storedResume = resumeDiagnosisService.getStoredResume(resumeId.trim());
                if (storedResume != null && StringUtils.hasText(storedResume.text())) {
                    return storedResume.text();
                }
            } catch (ResponseStatusException error) {
                if (!StringUtils.hasText(resumeText)) {
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "resumeId not found or expired.");
                }
            }
        }
        if (StringUtils.hasText(resumeText)) {
            return normalizeText(resumeText);
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "resumeId or resumeText is required.");
    }

    private String sanitizeResumeForModel(String resumeText) {
        return normalizeText(resumeText)
                .replaceAll("(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}", "[EMAIL_REDACTED]")
                .replaceAll("(?<!\\d)1[3-9]\\d{9}(?!\\d)", "[PHONE_REDACTED]")
                .replaceAll("(?<!\\d)(?:\\+?86[-\\s]?)?(?:0\\d{2,3}[-\\s]?)?\\d{7,8}(?!\\d)", "[PHONE_REDACTED]")
                .replaceAll("(?<![0-9Xx])\\d{6}(?:18|19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[0-9Xx](?![0-9Xx])", "[ID_CARD_REDACTED]")
                .replaceAll("(?m)^.*(?:住址|地址|家庭地址|现居地址|籍贯地址|通讯地址)[:：].*$", "[ADDRESS_REDACTED]");
    }

    private JobInfo jobFromMap(Map<String, Object> request) {
        return normalizeJob(new JobInfo(
                firstObject(request, "jobId", "id"),
                firstText(request, "companyName", "company"),
                firstText(request, "positionName", "role", "targetRole"),
                firstText(request, "industry"),
                firstText(request, "location", "city"),
                firstText(request, "education"),
                firstText(request, "major"),
                firstText(request, "description", "jobDescription", "duties"),
                firstText(request, "requirements", "skills")
        ), 0);
    }

    private JobInfo normalizeJob(JobInfo job, int index) {
        Object id = job.jobId() == null || !StringUtils.hasText(Objects.toString(job.jobId(), ""))
                ? "job_" + (index + 1)
                : job.jobId();
        return new JobInfo(id, safe(job.companyName()), safe(job.positionName()), safe(job.industry()),
                safe(job.location()), safe(job.education()), safe(job.major()), safe(job.description()), safe(job.requirements()));
    }

    private MatchDimensions normalizeDimensions(JsonNode node) {
        return new MatchDimensions(
                intValue(node.path("skills"), 0),
                intValue(node.path("experience"), 0),
                intValue(node.path("education"), 0),
                intValue(node.path("keywords"), 0),
                intValue(node.path("direction"), 0)
        );
    }

    private int weightedScore(MatchDimensions dimensions) {
        double score = dimensions.skills() * 0.25
                + dimensions.experience() * 0.25
                + dimensions.keywords() * 0.20
                + dimensions.education() * 0.15
                + dimensions.direction() * 0.15;
        return clamp((int) Math.round(score));
    }

    private String levelOf(Integer score) {
        if (score == null) return "匹配度较低";
        if (score >= 90) return "非常匹配";
        if (score >= 80) return "高度匹配";
        if (score >= 70) return "较为匹配";
        if (score >= 60) return "一般匹配";
        return "匹配度较低";
    }

    private String shouldApply(Integer score) {
        if (score == null) return "建议补充简历信息后再判断";
        if (score >= 80) return "建议优先投递";
        if (score >= 70) return "可以投递，同时优化简历关键词";
        if (score >= 60) return "谨慎投递，建议先补强匹配证据";
        return "暂不建议优先投递";
    }

    private MatchResult failedResult(JobInfo job, String errorCode, String errorMessage) {
        return new MatchResult(job.jobId(), "FAILED", null, null, null, List.of(), List.of(), List.of(), List.of(),
                false, false, errorCode, errorMessage, Instant.now());
    }

    private MatchResult withCached(MatchResult result, boolean cached) {
        return new MatchResult(result.jobId(), result.status(), result.score(), result.level(), result.dimensions(),
                result.strengths(), result.gaps(), result.missingKeywords(), result.optimizationAdvice(),
                result.demo(), cached, result.errorCode(), result.errorMessage(), result.createdAt());
    }

    private MatchResult readCache(String key) {
        CacheEntry entry = cache.get(key);
        if (entry == null) return null;
        if (entry.expiresAt().isBefore(Instant.now())) {
            cache.remove(key);
            return null;
        }
        return entry.result();
    }

    private void putCache(String key, MatchResult result) {
        cleanupCache();
        cache.put(key, new CacheEntry(withCached(result, false), Instant.now().plus(CACHE_TTL)));
    }

    private void cleanupCache() {
        Instant now = Instant.now();
        List<String> expiredKeys = new ArrayList<>();
        for (Map.Entry<String, CacheEntry> entry : cache.entrySet()) {
            if (entry.getValue().expiresAt().isBefore(now)) {
                expiredKeys.add(entry.getKey());
            }
        }
        expiredKeys.forEach(cache::remove);
        if (cache.size() <= MAX_CACHE_SIZE) return;
        int removeCount = cache.size() - MAX_CACHE_SIZE;
        List<String> keys = new ArrayList<>(cache.keySet());
        for (String key : keys) {
            if (removeCount <= 0) break;
            cache.remove(key);
            removeCount -= 1;
        }
    }

    private String cacheKey(String resumeFingerprint, JobInfo job) {
        return String.join(":", resumeFingerprint, jobKey(job),
                sha256(job.companyName() + "|" + job.positionName() + "|" + job.industry() + "|" + job.location()
                        + "|" + job.education() + "|" + job.major() + "|" + job.description() + "|" + job.requirements()),
                model());
    }

    private String jobKey(JobInfo job) {
        return jobKey(job == null ? null : job.jobId());
    }

    private String jobKey(Object jobId) {
        return Objects.toString(jobId, "").trim();
    }

    private String model() {
        return StringUtils.hasText(properties.getModel()) ? properties.getModel().trim() : "deepseek-v4-pro";
    }

    private String extractJson(String response) {
        if (!StringUtils.hasText(response)) throw new IllegalStateException("AI returned empty response.");
        String trimmed = response.trim();
        if (trimmed.startsWith("```")) {
            trimmed = trimmed.replaceFirst("^```[a-zA-Z]*\\s*", "");
            if (trimmed.endsWith("```")) trimmed = trimmed.substring(0, trimmed.length() - 3);
        }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        return start >= 0 && end > start ? trimmed.substring(start, end + 1) : trimmed;
    }

    private Object jsonScalar(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        if (node.isIntegralNumber()) return node.asLong();
        if (node.isFloatingPointNumber()) return node.asDouble();
        if (node.isBoolean()) return node.asBoolean();
        return node.asText();
    }

    private int intValue(JsonNode node, int fallback) {
        if (node == null || node.isMissingNode() || node.isNull()) return fallback;
        if (node.isNumber()) return clamp((int) Math.round(node.asDouble()));
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("-?\\d+(?:\\.\\d+)?").matcher(node.asText(""));
        if (!matcher.find()) return fallback;
        try {
            return clamp((int) Math.round(Double.parseDouble(matcher.group())));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private int clamp(int score) {
        return Math.max(0, Math.min(100, score));
    }

    private List<String> stringList(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return List.of();
        List<String> values = new ArrayList<>();
        if (node.isArray()) {
            node.forEach(item -> addClean(values, item.asText("")));
        } else {
            for (String part : node.asText("").split("[\\n;；、]+")) addClean(values, part);
        }
        return values.stream().distinct().limit(MAX_LIST_ITEMS).toList();
    }

    private void addClean(List<String> values, String value) {
        String cleaned = safe(value).replaceFirst("^\\s*(?:[-*•]|\\d+[.)、])\\s*", "").trim();
        if (StringUtils.hasText(cleaned)) values.add(clean(cleaned, 120));
    }

    private Object firstObject(Map<String, Object> request, String... keys) {
        if (request == null) return null;
        for (String key : keys) {
            Object value = request.get(key);
            if (value != null && StringUtils.hasText(Objects.toString(value, ""))) return value;
        }
        return null;
    }

    private String firstText(Map<String, Object> request, String... keys) {
        Object value = firstObject(request, keys);
        return value == null ? "" : Objects.toString(value, "").trim();
    }

    private String firstText(List<String> values, String fallback) {
        if (values == null) return fallback;
        return values.stream().filter(StringUtils::hasText).findFirst().orElse(fallback);
    }

    private List<List<PendingJob>> partitionPendingJobs(List<PendingJob> jobs, int chunkSize) {
        List<List<PendingJob>> chunks = new ArrayList<>();
        int size = Math.max(1, chunkSize);
        for (int start = 0; start < jobs.size(); start += size) {
            chunks.add(new ArrayList<>(jobs.subList(start, Math.min(start + size, jobs.size()))));
        }
        return chunks;
    }

    private String text(Map<String, Object> request, String key) {
        if (request == null) return "";
        Object value = request.get(key);
        return value == null ? "" : Objects.toString(value, "").trim();
    }

    private String clean(String value, int maxLength) {
        String normalized = normalizeText(value);
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength) + "\n[truncated]";
    }

    private String normalizeText(String value) {
        return safe(value)
                .replace('\u0000', ' ')
                .replaceAll("[\\t\\x0B\\f\\r]+", " ")
                .replaceAll(" *\\n *", "\n")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(Objects.toString(value, "").getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte b : hash) builder.append(String.format("%02x", b));
            return builder.toString();
        } catch (Exception error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    private String safeError(Throwable error) {
        String message = Objects.toString(error.getMessage(), error.getClass().getSimpleName());
        return message.replaceAll("(?i)(api[-_ ]?key|token|secret|password|bearer)\\s*[:= ]\\s*\\S+", "$1=***");
    }

    private String safeJobId(JobInfo job) {
        return Objects.toString(job == null ? null : job.jobId(), "unknown");
    }

    private static final class PendingJob {
        private final JobInfo job;
        private final String cacheKey;
        private MatchResult result;

        private PendingJob(JobInfo job, String cacheKey) {
            this.job = job;
            this.cacheKey = cacheKey;
        }

        private JobInfo job() {
            return job;
        }

        private String cacheKey() {
            return cacheKey;
        }

        private MatchResult result() {
            return result;
        }

        private void result(MatchResult result) {
            this.result = result;
        }
    }

    private record CacheEntry(MatchResult result, Instant expiresAt) {
    }
}
