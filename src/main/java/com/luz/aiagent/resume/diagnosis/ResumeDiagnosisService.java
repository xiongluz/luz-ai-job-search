package com.luz.aiagent.resume.diagnosis;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.luz.aiagent.ai.OpenAiCompatibleChatClient;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.CoreMetrics;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.Detail;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.DiagnoseRequest;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.DiagnosisChatRequest;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.DiagnosisChatResponse;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.DiagnosisReport;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.Dimensions;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.Issue;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.Recommendation;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.Statistics;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.StoredResume;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.UploadResumeResponse;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.hwpf.extractor.WordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class ResumeDiagnosisService {
    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024;
    private static final String DISCLAIMER = "AI辅助评估，并非录用概率。";
    private static final String SYSTEM_PROMPT = "你是严谨的中文简历诊断助手。只输出严格 JSON，不输出 Markdown。不得虚构学校、公司、学历、项目、获奖、技能、数字或百分比。没有目标岗位时，岗位匹配度和关键词覆盖率必须为 null。信息不足时 informationSufficient=false，overallScore=null，level=信息不足。诊断结论只用于发现简历问题，不代表录用概率。";

    private final OpenAiCompatibleChatClient aiClient;
    private final ObjectMapper objectMapper;
    private final Map<String, StoredResume> resumes = new ConcurrentHashMap<>();
    private final Map<String, DiagnosisReport> reports = new ConcurrentHashMap<>();

    public ResumeDiagnosisService(OpenAiCompatibleChatClient aiClient) {
        this.aiClient = aiClient;
        this.objectMapper = new ObjectMapper()
                .findAndRegisterModules()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    public UploadResumeResponse upload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择需要上传的简历文件。");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "简历文件不能超过 10MB。");
        }

        String fileName = Objects.requireNonNullElse(file.getOriginalFilename(), "resume");
        String extension = extensionOf(fileName);
        if (!List.of("pdf", "doc", "docx").contains(extension)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "仅支持 PDF、DOC、DOCX 简历文件。");
        }

        try {
            byte[] bytes = file.getBytes();
            String text = normalizeText(parseText(bytes, extension));
            String resumeId = "resume_" + UUID.randomUUID().toString().replace("-", "");
            Instant uploadedAt = Instant.now();
            StoredResume stored = new StoredResume(resumeId, fileName, extension.toUpperCase(Locale.ROOT), file.getSize(), text, uploadedAt);
            resumes.put(resumeId, stored);
            log.info("resume uploaded: id={}, fileType={}, textLength={}", resumeId, stored.fileType(), text.length());
            return new UploadResumeResponse(resumeId, fileName, stored.fileType(), file.getSize(), "uploaded", uploadedAt, text.length(), "backend-parsed");
        } catch (ResponseStatusException error) {
            throw error;
        } catch (Exception error) {
            log.warn("resume parse failed: fileName={}, reason={}", fileName, error.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "简历解析失败，请确认文件不是扫描件或加密文件。", error);
        }
    }

    public DiagnosisReport diagnose(DiagnoseRequest request) {
        String resumeText = resolveResumeText(request);
        StoredResume storedResume = resolveStoredResume(request.resumeId());
        String resumeId = StringUtils.hasText(request.resumeId()) ? request.resumeId() : "inline_" + UUID.randomUUID().toString().replace("-", "");
        String resumeName = firstText(request.resumeName(), storedResume == null ? null : storedResume.fileName(), "当前简历");
        String diagnosisType = isTargeted(request) ? "TARGETED" : "GENERAL";
        String jobType = isTargeted(request) ? emptyToNull(request.jobType()) : null;
        String jobId = isTargeted(request) ? emptyToNull(request.jobId()) : null;
        String targetJobName = isTargeted(request) ? firstText(request.jobId(), "手动粘贴JD") : "通用诊断";

        if (!StringUtils.hasText(resumeText) || resumeText.length() < 80) {
            DiagnosisReport report = insufficientReport(resumeId, resumeName, diagnosisType, jobType, jobId, targetJobName, resumeText.length());
            reports.put(report.diagnosisId(), report);
            return report;
        }

        String diagnosisId = "diagnosis_" + UUID.randomUUID().toString().replace("-", "");
        String prompt = buildDiagnosisPrompt(diagnosisId, resumeId, resumeName, diagnosisType, jobType, jobId, targetJobName, resumeText, request.jobDescription());
        try {
            DiagnosisReport aiReport = requestDiagnosisReport(prompt, resumeText, request.jobDescription());
            DiagnosisReport normalized = normalizeReport(aiReport, diagnosisId, resumeId, resumeName, diagnosisType, jobType, jobId, targetJobName, resumeText.length());
            reports.put(normalized.diagnosisId(), normalized);
            return normalized;
        } catch (Exception error) {
            log.warn("AI diagnosis failed: resumeId={}, reason={}", resumeId, safeError(error));
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, diagnosisFailureMessage(error), error);
        }
    }

    public DiagnosisReport getReport(String diagnosisId) {
        DiagnosisReport report = reports.get(diagnosisId);
        if (report == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "诊断报告不存在或已过期。");
        }
        return report;
    }

    public StoredResume getStoredResume(String resumeId) {
        StoredResume storedResume = resolveStoredResume(resumeId);
        if (storedResume == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "简历不存在或已过期。");
        }
        return storedResume;
    }

    public String buildResumeChatContext(Collection<String> resumeIds) {
        if (resumeIds == null || resumeIds.isEmpty()) {
            return "";
        }

        StringBuilder builder = new StringBuilder();
        for (String resumeId : resumeIds) {
            StoredResume resume = resolveStoredResume(resumeId);
            if (resume == null) {
                continue;
            }
            if (builder.isEmpty()) {
                builder.append("\n\n后端已解析的简历正文（仅供本次AI回答使用，不要泄露完整联系方式）：");
            }
            builder.append("\n\n简历文件：")
                    .append(resume.fileName())
                    .append("（")
                    .append(resume.fileType())
                    .append("，解析字符数 ")
                    .append(resume.text() == null ? 0 : resume.text().length())
                    .append("）\n")
                    .append(truncate(resume.text(), 7000));
        }
        return builder.toString();
    }

    public DiagnosisReport findReport(String diagnosisId) {
        return StringUtils.hasText(diagnosisId) ? reports.get(diagnosisId) : null;
    }

    public DiagnosisChatResponse chat(String diagnosisId, DiagnosisChatRequest request) {
        DiagnosisReport report = getReport(diagnosisId);
        String message = request == null ? "" : request.message();
        if (!StringUtils.hasText(message)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请输入追问内容。");
        }
        try {
            String reportJson = objectMapper.writeValueAsString(toSafeChatContext(report));
            String prompt = "请基于下面的简历诊断报告回答用户追问。不要编造简历中不存在的信息；如果需要更多信息，请明确向用户提问。\n"
                    + "诊断报告JSON：\n" + reportJson + "\n"
                    + "用户追问：" + message;
            String answer = aiClient.completeOnce(SYSTEM_PROMPT, prompt);
            return new DiagnosisChatResponse(diagnosisId, answer, Instant.now());
        } catch (Exception error) {
            log.warn("diagnosis chat failed: diagnosisId={}, reason={}", diagnosisId, error.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "诊断追问接口调用失败，请稍后重试。", error);
        }
    }

    private String parseText(byte[] bytes, String extension) throws IOException {
        return switch (extension) {
            case "pdf" -> parsePdf(bytes);
            case "docx" -> parseDocx(bytes);
            case "doc" -> parseDoc(bytes);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不支持的简历格式。");
        };
    }

    private String parsePdf(byte[] bytes) throws IOException {
        try (PDDocument document = PDDocument.load(new ByteArrayInputStream(bytes))) {
            return new PDFTextStripper().getText(document);
        }
    }

    private String parseDocx(byte[] bytes) throws IOException {
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            StringBuilder builder = new StringBuilder();
            for (XWPFParagraph paragraph : document.getParagraphs()) {
                builder.append(paragraph.getText()).append('\n');
            }
            document.getTables().forEach(table -> table.getRows().forEach(row -> row.getTableCells().forEach(cell -> builder.append(cell.getText()).append('\n'))));
            return builder.toString();
        }
    }

    private String parseDoc(byte[] bytes) throws IOException {
        try (HWPFDocument document = new HWPFDocument(new ByteArrayInputStream(bytes));
             WordExtractor extractor = new WordExtractor(document)) {
            return extractor.getText();
        }
    }

    private String buildDiagnosisPrompt(String diagnosisId, String resumeId, String resumeName, String diagnosisType,
                                        String jobType, String jobId, String targetJobName, String resumeText, String jobDescription) {
        boolean targeted = "TARGETED".equals(diagnosisType) && (StringUtils.hasText(jobDescription) || StringUtils.hasText(jobId));
        if (System.nanoTime() >= 0) {
            String jobValue = jobType == null ? "null" : quote(jobType);
            String jobIdValue = jobId == null ? "null" : quote(jobId);
            String nullableScore = targeted ? "70" : "null";
            String schema = """
                    {
                      "diagnosisId":"%s",
                      "resumeId":"%s",
                      "resumeName":"%s",
                      "resumeVersion":"当前上传版本",
                      "diagnosisType":"%s",
                      "jobType":%s,
                      "jobId":%s,
                      "targetJobName":"%s",
                      "persisted":false,
                      "informationSufficient":true,
                      "overallScore":76,
                      "level":"基础良好",
                      "summary":"1-3句中文摘要",
                      "statistics":{"textLength":%d,"educationCount":1,"experienceCount":1,"projectCount":1,"quantifiedAchievementCount":0},
                      "coreMetrics":{"readability":70,"evidenceDensity":70,"applicationReadiness":70,"jobMatch":%s},
                      "dimensions":{"completeness":70,"jobMatch":%s,"clarity":70,"achievementImpact":70,"structure":70,"keywordCoverage":%s,"relevance":70},
                      "tags":["来自真实诊断的问题标签"],
                      "strengths":["真实优势"],
                      "issues":[{"id":"issue_1","title":"问题标题","tag":"问题标签","whyImportant":"为什么重要","impact":"影响","suggestion":"修改方向","evidenceSnippet":"必要短原文"}],
                      "priorityIssue":{"id":"issue_1","title":"最高优先级问题","tag":"问题标签","whyImportant":"为什么重要","impact":"影响","suggestion":"修改方向","evidenceSnippet":"必要短原文"},
                      "recommendations":[{"id":"rec_1","level":"立即修改","priority":"HIGH","title":"建议标题","reason":"建议理由"}],
                      "details":[{"key":"completeness","name":"内容完整度","score":70,"currentPerformance":"当前表现","issues":["问题"],"evidence":["证据短片段"],"suggestions":["建议"]}],
                      "disclaimer":"AI辅助评估，并非录用概率。"
                    }
                    """.formatted(diagnosisId, escapeJson(resumeId), escapeJson(resumeName), diagnosisType,
                    jobValue, jobIdValue, escapeJson(targetJobName), resumeText.length(), nullableScore, nullableScore, nullableScore);

            return """
                    请扮演严谨的中文简历诊断助手。你和普通聊天助手使用同一个大模型，但本次必须输出结构化诊断报告。
                    只输出一个 JSON 对象，不要 Markdown，不要代码块，不要额外解释。
                    规则：
                    1. 只根据简历真实内容诊断，不要编造学校、公司、项目、奖项、技能、数字或成果。
                    2. 评分范围 0-100；信息不足时 informationSufficient=false，overallScore=null，level=信息不足。
                    3. 没有目标岗位时，jobMatch 和 keywordCoverage 必须为 null。
                    4. issues 3-6 条，recommendations 至少 3 条，details 至少 4 条。
                    5. evidenceSnippet 只能给必要短片段，不能输出完整简历。
                    6. summary 用 1-3 句中文，说明最需要先改什么。

                    JSON结构参考：
                    %s

                    诊断上下文：
                    diagnosisId=%s
                    resumeId=%s
                    resumeName=%s
                    diagnosisType=%s
                    jobType=%s
                    jobId=%s
                    targetJobName=%s
                    textLength=%d

                    目标岗位JD（没有则通用诊断）：
                    %s

                    简历正文：
                    %s
                    """.formatted(
                    schema,
                    diagnosisId,
                    escapeJson(resumeId),
                    escapeJson(resumeName),
                    diagnosisType,
                    jobValue,
                    jobIdValue,
                    escapeJson(targetJobName),
                    resumeText.length(),
                    StringUtils.hasText(jobDescription) ? truncate(jobDescription, 2600) : "未提供，按通用诊断处理",
                    truncate(resumeText, 5200)
            );
        }
        String schema = """
                {
                  "diagnosisId":"%s",
                  "resumeId":"%s",
                  "resumeName":"%s",
                  "resumeVersion":"当前上传版本",
                  "diagnosisType":"%s",
                  "jobType":%s,
                  "jobId":%s,
                  "targetJobName":"%s",
                  "persisted":false,
                  "informationSufficient":true,
                  "overallScore":76,
                  "level":"基础良好",
                  "summary":"一到三句话摘要",
                  "statistics":{"textLength":%d,"educationCount":1,"experienceCount":1,"projectCount":1,"quantifiedAchievementCount":0},
                  "coreMetrics":{"readability":70,"evidenceDensity":70,"applicationReadiness":70,"jobMatch":%s},
                  "dimensions":{"completeness":70,"jobMatch":%s,"clarity":70,"achievementImpact":70,"structure":70,"keywordCoverage":%s,"relevance":70},
                  "tags":["来自真实诊断的问题标签"],
                  "strengths":["真实优势"],
                  "issues":[{"id":"issue_1","title":"问题标题","tag":"问题标签","whyImportant":"为什么重要","impact":"影响","suggestion":"建议方向","evidenceSnippet":"必要的原文短片段"}],
                  "priorityIssue":{"id":"issue_1","title":"最高优先级问题","tag":"问题标签","whyImportant":"为什么重要","impact":"影响","suggestion":"建议方向","evidenceSnippet":"必要的原文短片段"},
                  "recommendations":[{"id":"rec_1","level":"立即修改","priority":"HIGH","title":"建议标题","reason":"建议理由"}],
                  "details":[{"key":"completeness","name":"内容完整度","score":70,"currentPerformance":"当前表现","issues":["问题"],"evidence":["证据短片段"],"suggestions":["建议"]}],
                  "disclaimer":"AI辅助评估，并非录用概率。"
                }
                """;
        String jobValue = jobType == null ? "null" : quote(jobType);
        String jobIdValue = jobId == null ? "null" : quote(jobId);
        String nullableScore = targeted ? "70" : "null";
        return "请诊断下面的中文简历，必须只返回一个 JSON 对象，字段和类型参考此 Schema。"
                + "评分范围 0-100；没有目标岗位时 jobMatch 和 keywordCoverage 必须为 null；不要输出录用概率。\n"
                + "Schema 示例：\n" + schema.formatted(diagnosisId, escapeJson(resumeId), escapeJson(resumeName), diagnosisType,
                jobValue, jobIdValue, escapeJson(targetJobName), resumeText.length(), nullableScore, nullableScore, nullableScore)
                + "\n目标岗位JD：\n" + (StringUtils.hasText(jobDescription) ? truncate(jobDescription, 2600) : "未提供，执行通用诊断")
                + "\n简历正文：\n" + truncate(resumeText, 5200);
    }

    private DiagnosisReport requestDiagnosisReport(String prompt, String resumeText, String jobDescription) throws Exception {
        Exception firstError = null;
        try {
            String content = aiClient.completeJsonOnce(SYSTEM_PROMPT, prompt);
            return parseDiagnosisContent(content);
        } catch (Exception error) {
            firstError = error;
            if (isUpstreamUnavailable(error)) {
                throw error;
            }
            log.warn("diagnosis JSON mode failed, retrying with normal chat completion: {}", safeError(error));
        }

        try {
            String compactPrompt = buildCompactDiagnosisPrompt(resumeText, jobDescription);
            String content = aiClient.completeOnce(SYSTEM_PROMPT, compactPrompt);
            return parseDiagnosisContent(content);
        } catch (Exception secondError) {
            secondError.addSuppressed(firstError);
            throw secondError;
        }
    }

    private DiagnosisReport parseDiagnosisContent(String content) throws Exception {
        try {
            JsonNode root = objectMapper.readTree(extractJson(content));
            return diagnosisFromJson(root);
        } catch (Exception jsonError) {
            log.warn("AI diagnosis returned non-standard JSON, using textual report fallback: {}", safeError(jsonError));
            return diagnosisFromText(content);
        }
    }

    private DiagnosisReport diagnosisFromJson(JsonNode root) {
        Statistics statistics = new Statistics(
                intValue(root.path("statistics").path("textLength"), null),
                intValue(root.path("statistics").path("educationCount"), null),
                intValue(root.path("statistics").path("experienceCount"), null),
                intValue(root.path("statistics").path("projectCount"), null),
                intValue(root.path("statistics").path("quantifiedAchievementCount"), null)
        );
        CoreMetrics coreMetrics = new CoreMetrics(
                intValue(root.path("coreMetrics").path("readability"), null),
                intValue(root.path("coreMetrics").path("evidenceDensity"), null),
                intValue(root.path("coreMetrics").path("applicationReadiness"), null),
                intValue(root.path("coreMetrics").path("jobMatch"), null)
        );
        Dimensions dimensions = new Dimensions(
                intValue(root.path("dimensions").path("completeness"), null),
                intValue(root.path("dimensions").path("jobMatch"), null),
                intValue(root.path("dimensions").path("clarity"), null),
                intValue(root.path("dimensions").path("achievementImpact"), null),
                intValue(root.path("dimensions").path("structure"), null),
                intValue(root.path("dimensions").path("keywordCoverage"), null),
                intValue(root.path("dimensions").path("relevance"), null)
        );
        List<Issue> issues = issuesFromJson(root.path("issues"));
        Issue priorityIssue = issueFromJson(root.path("priorityIssue"), issues.isEmpty() ? 1 : 0);
        if (!hasIssueText(priorityIssue) && !issues.isEmpty()) {
            priorityIssue = issues.get(0);
        }
        List<Recommendation> recommendations = recommendationsFromJson(root.path("recommendations"));
        List<Detail> details = detailsFromJson(root.path("details"));
        Integer score = intValue(firstNode(root, "overallScore", "score"), null);
        boolean sufficient = booleanValue(root.path("informationSufficient"), score != null || StringUtils.hasText(textValue(root.path("summary"), "")));

        return new DiagnosisReport(
                textValue(root.path("diagnosisId"), null),
                textValue(root.path("resumeId"), null),
                textValue(root.path("resumeName"), null),
                textValue(root.path("resumeVersion"), null),
                textValue(root.path("diagnosisType"), null),
                textValue(root.path("jobType"), null),
                textValue(root.path("jobId"), null),
                textValue(root.path("targetJobName"), null),
                Instant.now(),
                booleanValue(root.path("persisted"), false),
                sufficient,
                score,
                textValue(root.path("level"), score == null ? "信息不足" : levelOf(score)),
                textValue(root.path("summary"), ""),
                statistics,
                coreMetrics,
                dimensions,
                stringList(root.path("tags")),
                stringList(root.path("strengths")),
                issues,
                priorityIssue,
                recommendations,
                details,
                textValue(root.path("disclaimer"), DISCLAIMER)
        );
    }

    private DiagnosisReport diagnosisFromText(String content) {
        String text = normalizeText(content);
        Integer score = extractScore(text);
        List<String> lines = splitUsefulLines(text);
        List<Issue> issues = new ArrayList<>();
        for (String line : lines) {
            if (issues.size() >= 4) break;
            if (line.contains("问题") || line.contains("不足") || line.contains("缺少") || line.contains("建议") || line.contains("优化")) {
                issues.add(new Issue("issue_" + (issues.size() + 1), lineTitle(line, "诊断问题"), "AI诊断",
                        "这是模型基于简历正文识别出的改进点。", "会影响简历信息呈现和岗位匹配判断。", line, null));
            }
        }
        if (issues.isEmpty()) {
            issues.add(new Issue("issue_1", "简历表达需要进一步结构化", "表达优化",
                    "模型返回了诊断内容，但不是标准JSON。", "结构化不足会影响页面展示和后续优化动作。", firstText(lines.stream().findFirst().orElse(null), "请补充更完整的经历、成果和岗位信息。"), null));
        }
        List<Recommendation> recommendations = new ArrayList<>();
        for (int index = 0; index < Math.min(issues.size(), 4); index++) {
            Issue issue = issues.get(index);
            recommendations.add(new Recommendation("rec_" + (index + 1), index == 0 ? "立即修改" : "建议优化",
                    index == 0 ? "HIGH" : "MEDIUM", issue.title(), issue.suggestion()));
        }
        return new DiagnosisReport(
                null, null, null, null, null, null, null, null, Instant.now(), false,
                score != null, score, score == null ? "信息不足" : levelOf(score),
                truncate(text, 420),
                new Statistics(text.length(), null, null, null, null),
                new CoreMetrics(null, null, null, null),
                new Dimensions(null, null, null, null, null, null, null),
                List.of("AI文本诊断", "结构化兜底"),
                List.of(),
                issues,
                issues.get(0),
                recommendations,
                List.of(new Detail("ai_text_report", "AI诊断文本", score, truncate(text, 520), List.of(), List.of(), recommendations.stream().map(Recommendation::reason).toList())),
                DISCLAIMER
        );
    }

    private String buildCompactDiagnosisPrompt(String resumeText, String jobDescription) {
        return """
                请基于简历正文生成一份真实中文简历诊断报告。只输出 JSON 对象，不要 Markdown。
                JSON 必须包含字段：
                informationSufficient, overallScore, level, summary,
                statistics{textLength,educationCount,experienceCount,projectCount,quantifiedAchievementCount},
                coreMetrics{readability,evidenceDensity,applicationReadiness,jobMatch},
                dimensions{completeness,jobMatch,clarity,achievementImpact,structure,keywordCoverage,relevance},
                tags, strengths, issues, priorityIssue, recommendations, details, disclaimer。

                规则：
                - 评分 0-100；信息不足时 overallScore=null，level="信息不足"。
                - 没有目标岗位时 jobMatch 和 keywordCoverage 必须为 null。
                - 不能编造学校、公司、经历、成果、数字、证书或录用概率。
                - issues 至少 3 条，recommendations 至少 3 条，details 至少 4 条。
                - disclaimer 固定为：AI辅助评估，并非录用概率。

                目标岗位JD：
                %s

                简历正文：
                %s
                """.formatted(
                StringUtils.hasText(jobDescription) ? truncate(jobDescription, 1800) : "未提供，执行通用诊断",
                truncate(resumeText, 4200)
        );
    }

    private String diagnosisFailureMessage(Throwable error) {
        String message = Objects.toString(error.getMessage(), "");
        String lower = message.toLowerCase(Locale.ROOT);
        if (lower.contains("http 429") || lower.contains("rate_limit") || lower.contains("rate limit")) {
            return "简历诊断模型被上游限流了：聊天和诊断共用同一个模型，但诊断需要生成完整结构化报告，更容易触发频率限制。请稍等 1-2 分钟后重试，或更换额度充足的 API Key。";
        }
        if (lower.contains("upstream access forbidden") || lower.contains("access forbidden")) {
            return "简历诊断模型被上游拒绝访问：请检查 API Key、Base URL 和模型名是否属于同一家服务商，并确认当前 Key 有权限调用该模型。";
        }
        if (lower.contains("http 401") || lower.contains("unauthorized")) {
            return "简历诊断模型鉴权失败：API Key 无效、已过期或没有正确传入后端环境变量。";
        }
        if (lower.contains("http 403") || lower.contains("forbidden")) {
            return "简历诊断模型权限不足：当前 API Key 没有访问该模型或该接口的权限。";
        }
        if (lower.contains("http 503") || lower.contains("temporarily unavailable") || lower.contains("service unavailable")) {
            return "简历诊断模型上游服务暂时不可用，请稍后重试。聊天模型配置本身已连通，但当前模型服务返回了 503。";
        }
        if (lower.contains("timeout") || lower.contains("timed out") || lower.contains("request timed out")) {
            return "简历诊断模型请求超时：聊天能用，但诊断需要生成严格JSON报告，耗时更长。请稍后重试，或缩短/重新上传可解析简历。";
        }
        if (lower.contains("json") || lower.contains("deserialize") || lower.contains("parse")) {
            return "简历诊断模型返回格式不符合严格JSON结构，请重新诊断或切换更稳定的模型。";
        }
        return "简历诊断模型调用失败，请稍后重试。";
    }

    private boolean isUpstreamUnavailable(Throwable error) {
        String lower = Objects.toString(error.getMessage(), "").toLowerCase(Locale.ROOT);
        return lower.contains("http 429")
                || lower.contains("rate_limit")
                || lower.contains("rate limit")
                || lower.contains("http 503")
                || lower.contains("temporarily unavailable")
                || lower.contains("service unavailable");
    }

    private DiagnosisReport normalizeReport(DiagnosisReport raw, String diagnosisId, String resumeId, String resumeName,
                                             String diagnosisType, String jobType, String jobId, String targetJobName, int textLength) {
        boolean sufficient = raw.informationSufficient();
        Integer score = sufficient ? clampScore(raw.overallScore()) : null;
        boolean targeted = "TARGETED".equals(diagnosisType) && (StringUtils.hasText(jobId) || StringUtils.hasText(jobType));
        CoreMetrics coreMetrics = raw.coreMetrics() == null
                ? new CoreMetrics(null, null, null, null)
                : new CoreMetrics(clampScore(raw.coreMetrics().readability()), clampScore(raw.coreMetrics().evidenceDensity()),
                clampScore(raw.coreMetrics().applicationReadiness()), targeted ? clampScore(raw.coreMetrics().jobMatch()) : null);
        Dimensions dimensions = raw.dimensions() == null
                ? new Dimensions(null, null, null, null, null, null, null)
                : new Dimensions(clampScore(raw.dimensions().completeness()), targeted ? clampScore(raw.dimensions().jobMatch()) : null,
                clampScore(raw.dimensions().clarity()), clampScore(raw.dimensions().achievementImpact()), clampScore(raw.dimensions().structure()),
                targeted ? clampScore(raw.dimensions().keywordCoverage()) : null, clampScore(raw.dimensions().relevance()));
        Statistics statistics = raw.statistics() == null
                ? new Statistics(textLength, null, null, null, null)
                : new Statistics(firstInt(raw.statistics().textLength(), textLength), raw.statistics().educationCount(), raw.statistics().experienceCount(),
                raw.statistics().projectCount(), raw.statistics().quantifiedAchievementCount());
        return new DiagnosisReport(
                firstText(raw.diagnosisId(), diagnosisId), resumeId, resumeName,
                firstText(raw.resumeVersion(), "当前上传版本"), diagnosisType, targeted ? jobType : null, targeted ? jobId : null,
                targeted ? firstText(raw.targetJobName(), targetJobName) : "通用诊断", Instant.now(), false, sufficient,
                score, sufficient ? firstText(raw.level(), levelOf(score)) : "信息不足", firstText(raw.summary(), "已完成简历诊断。"),
                statistics, coreMetrics, dimensions, safeList(raw.tags()), safeList(raw.strengths()), safeList(raw.issues()), raw.priorityIssue(),
                safeList(raw.recommendations()), ensureDetails(raw.details()), DISCLAIMER);
    }

    private DiagnosisReport insufficientReport(String resumeId, String resumeName, String diagnosisType, String jobType, String jobId, String targetJobName, int textLength) {
        String diagnosisId = "diagnosis_" + UUID.randomUUID().toString().replace("-", "");
        Issue issue = new Issue("insufficient_text", "简历文本不足，无法进行真实评分", "信息不足",
                "真实诊断需要可解析的简历正文。", "如果强行评分会产生不可靠结论。", "请上传可复制文本的 PDF、DOC 或 DOCX 简历。", null);
        return new DiagnosisReport(diagnosisId, resumeId, resumeName, "当前上传版本", diagnosisType,
                "TARGETED".equals(diagnosisType) ? jobType : null, "TARGETED".equals(diagnosisType) ? jobId : null,
                "TARGETED".equals(diagnosisType) ? targetJobName : "通用诊断", Instant.now(), false, false, null, "信息不足",
                "当前简历未解析到足够文本，暂不生成分数。请上传可解析的 PDF、DOC 或 DOCX 文件后重新诊断。",
                new Statistics(textLength, null, null, null, null), new CoreMetrics(null, null, null, null),
                new Dimensions(null, null, null, null, null, null, null), List.of("信息不足"), List.of(), List.of(issue), issue,
                List.of(new Recommendation("upload_text_resume", "立即修改", "HIGH", "上传可解析的简历文件", "当前文件文本不足，无法进行真实 AI 诊断。")),
                List.of(new Detail("completeness", "内容完整度", null, "未识别到足够简历正文。", List.of("文本不足"), List.of(), List.of("上传非扫描版简历或 DOCX 文件。"))), DISCLAIMER);
    }

    private Map<String, Object> toSafeChatContext(DiagnosisReport report) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("diagnosisId", report.diagnosisId());
        context.put("resumeName", report.resumeName());
        context.put("overallScore", report.overallScore());
        context.put("level", report.level());
        context.put("summary", report.summary());
        context.put("coreMetrics", report.coreMetrics());
        context.put("dimensions", report.dimensions());
        context.put("tags", report.tags());
        context.put("issues", report.issues());
        context.put("recommendations", report.recommendations());
        context.put("disclaimer", report.disclaimer());
        return context;
    }

    private StoredResume resolveStoredResume(String resumeId) {
        return StringUtils.hasText(resumeId) ? resumes.get(resumeId) : null;
    }

    private String resolveResumeText(DiagnoseRequest request) {
        if (request != null && StringUtils.hasText(request.resumeText())) {
            return normalizeText(request.resumeText());
        }
        StoredResume stored = request == null ? null : resolveStoredResume(request.resumeId());
        return stored == null ? "" : stored.text();
    }

    private boolean isTargeted(DiagnoseRequest request) {
        return request != null && "TARGETED".equalsIgnoreCase(request.diagnosisType())
                && (StringUtils.hasText(request.jobId()) || StringUtils.hasText(request.jobDescription()));
    }

    private String extractJson(String content) {
        if (!StringUtils.hasText(content)) {
            throw new IllegalArgumentException("AI杩斿洖涓虹┖");
        }
        String text = content.trim();
        if (text.startsWith("```")) {
            text = text.replaceFirst("^```[a-zA-Z]*", "").replaceFirst("```$", "").trim();
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new IllegalArgumentException("AI杩斿洖涓嶆槸JSON瀵硅薄");
        }
        return text.substring(start, end + 1);
    }

    private JsonNode firstNode(JsonNode root, String... keys) {
        for (String key : keys) {
            JsonNode node = root.path(key);
            if (!node.isMissingNode() && !node.isNull()) {
                return node;
            }
        }
        return objectMapper.nullNode();
    }

    private Integer intValue(JsonNode node, Integer fallback) {
        if (node == null || node.isMissingNode() || node.isNull()) return fallback;
        if (node.isInt() || node.isLong()) return node.asInt();
        if (node.isNumber()) return (int) Math.round(node.asDouble());
        String text = node.asText("");
        if (!StringUtils.hasText(text) || "null".equalsIgnoreCase(text.trim()) || "未评估".equals(text.trim())) return fallback;
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("-?\\d+(?:\\.\\d+)?").matcher(text);
        if (!matcher.find()) return fallback;
        try {
            return (int) Math.round(Double.parseDouble(matcher.group()));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private boolean booleanValue(JsonNode node, boolean fallback) {
        if (node == null || node.isMissingNode() || node.isNull()) return fallback;
        if (node.isBoolean()) return node.asBoolean();
        String text = node.asText("").trim().toLowerCase(Locale.ROOT);
        if (List.of("true", "yes", "1", "是", "足够").contains(text)) return true;
        if (List.of("false", "no", "0", "否", "不足").contains(text)) return false;
        return fallback;
    }

    private String textValue(JsonNode node, String fallback) {
        if (node == null || node.isMissingNode() || node.isNull()) return fallback;
        if (node.isTextual() || node.isNumber() || node.isBoolean()) {
            String text = node.asText("").trim();
            return StringUtils.hasText(text) ? text : fallback;
        }
        if (node.isArray()) {
            List<String> values = stringList(node);
            return values.isEmpty() ? fallback : String.join("；", values);
        }
        return node.toString();
    }

    private List<String> stringList(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return List.of();
        List<String> values = new ArrayList<>();
        if (node.isArray()) {
            node.forEach(item -> {
                String value = textValue(item, "");
                if (StringUtils.hasText(value)) values.add(value);
            });
        } else {
            String value = textValue(node, "");
            if (StringUtils.hasText(value)) {
                for (String item : value.split("[\\n；;、,，]")) {
                    String cleaned = item.replaceFirst("^\\s*(?:[-*•]|\\d+[.、）)]?)\\s*", "").trim();
                    if (StringUtils.hasText(cleaned)) values.add(cleaned);
                }
            }
        }
        return values.stream().distinct().limit(10).toList();
    }

    private List<Issue> issuesFromJson(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return List.of();
        List<Issue> issues = new ArrayList<>();
        if (node.isArray()) {
            int index = 0;
            for (JsonNode item : node) {
                Issue issue = issueFromJson(item, ++index);
                if (hasIssueText(issue)) issues.add(issue);
            }
        } else if (node.isTextual()) {
            int index = 0;
            for (String value : stringList(node)) {
                issues.add(new Issue("issue_" + (++index), lineTitle(value, "诊断问题"), "AI诊断", "模型识别出的简历问题。", "可能影响筛选阅读和岗位匹配。", value, null));
            }
        }
        return issues;
    }

    private Issue issueFromJson(JsonNode node, int index) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        if (!node.isObject()) {
            String value = textValue(node, "");
            return StringUtils.hasText(value)
                    ? new Issue("issue_" + Math.max(1, index), lineTitle(value, "诊断问题"), "AI诊断", "模型识别出的简历问题。", "可能影响筛选阅读和岗位匹配。", value, null)
                    : null;
        }
        String suggestion = firstText(textValue(node.path("suggestion"), null), textValue(node.path("advice"), null), textValue(node.path("recommendation"), null));
        return new Issue(
                firstText(textValue(node.path("id"), null), "issue_" + Math.max(1, index)),
                firstText(textValue(node.path("title"), null), textValue(node.path("name"), null), "诊断问题"),
                firstText(textValue(node.path("tag"), null), textValue(node.path("category"), null), "AI诊断"),
                firstText(textValue(node.path("whyImportant"), null), textValue(node.path("reason"), null), "这是模型基于简历正文识别出的改进点。"),
                firstText(textValue(node.path("impact"), null), "可能影响简历阅读效率和岗位匹配判断。"),
                firstText(suggestion, "建议补充更具体的职责、动作、证据和成果。"),
                textValue(node.path("evidenceSnippet"), null)
        );
    }

    private boolean hasIssueText(Issue issue) {
        return issue != null && (StringUtils.hasText(issue.title()) || StringUtils.hasText(issue.suggestion()));
    }

    private List<Recommendation> recommendationsFromJson(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return List.of();
        List<Recommendation> recommendations = new ArrayList<>();
        if (node.isArray()) {
            int index = 0;
            for (JsonNode item : node) {
                index += 1;
                if (item.isObject()) {
                    recommendations.add(new Recommendation(
                            firstText(textValue(item.path("id"), null), "rec_" + index),
                            firstText(textValue(item.path("level"), null), index == 1 ? "立即修改" : "建议优化"),
                            firstText(textValue(item.path("priority"), null), index == 1 ? "HIGH" : "MEDIUM"),
                            firstText(textValue(item.path("title"), null), "优化建议"),
                            firstText(textValue(item.path("reason"), null), textValue(item.path("suggestion"), null), textValue(item.path("content"), null), "请根据诊断结果补充真实信息。")
                    ));
                } else {
                    String value = textValue(item, "");
                    if (StringUtils.hasText(value)) {
                        recommendations.add(new Recommendation("rec_" + index, index == 1 ? "立即修改" : "建议优化", index == 1 ? "HIGH" : "MEDIUM", lineTitle(value, "优化建议"), value));
                    }
                }
            }
        } else {
            int index = 0;
            for (String value : stringList(node)) {
                recommendations.add(new Recommendation("rec_" + (++index), index == 1 ? "立即修改" : "建议优化", index == 1 ? "HIGH" : "MEDIUM", lineTitle(value, "优化建议"), value));
            }
        }
        return recommendations;
    }

    private List<Detail> detailsFromJson(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull() || !node.isArray()) return List.of();
        List<Detail> details = new ArrayList<>();
        int index = 0;
        for (JsonNode item : node) {
            index += 1;
            if (!item.isObject()) continue;
            details.add(new Detail(
                    firstText(textValue(item.path("key"), null), "detail_" + index),
                    firstText(textValue(item.path("name"), null), "诊断维度"),
                    intValue(item.path("score"), null),
                    firstText(textValue(item.path("currentPerformance"), null), textValue(item.path("summary"), null), "模型未返回该维度当前表现。"),
                    stringList(item.path("issues")),
                    stringList(item.path("evidence")),
                    stringList(item.path("suggestions"))
            ));
        }
        return details;
    }

    private Integer extractScore(String text) {
        if (!StringUtils.hasText(text)) return null;
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("(?:综合评分|总分|overallScore|score)\\D{0,12}(\\d{1,3})(?:\\.\\d+)?").matcher(text);
        if (matcher.find()) return clampScore(Integer.parseInt(matcher.group(1)));
        return null;
    }

    private List<String> splitUsefulLines(String text) {
        if (!StringUtils.hasText(text)) return List.of();
        return java.util.Arrays.stream(text.split("\\n+"))
                .map(line -> line.replaceFirst("^\\s*(?:[-*•]|\\d+[.、）)]?)\\s*", "").trim())
                .filter(line -> line.length() >= 6)
                .limit(12)
                .toList();
    }

    private String lineTitle(String value, String fallback) {
        if (!StringUtils.hasText(value)) return fallback;
        String cleaned = value.replaceAll("[。；;，,].*$", "").trim();
        if (!StringUtils.hasText(cleaned)) return fallback;
        return cleaned.length() > 28 ? cleaned.substring(0, 28) : cleaned;
    }

    private String normalizeText(String text) {
        if (text == null) return "";
        return text.replace('\u0000', ' ')
                .replaceAll("[\\t\\x0B\\f\\r]+", " ")
                .replaceAll(" *\\n *", "\n")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }

    private String extensionOf(String fileName) {
        int index = fileName.lastIndexOf('.');
        return index < 0 ? "" : fileName.substring(index + 1).toLowerCase(Locale.ROOT);
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) return Objects.toString(value, "");
        return value.substring(0, maxLength) + "\n[内容过长，已截断]";
    }

    private String safeError(Throwable error) {
        String message = Objects.toString(error.getMessage(), error.getClass().getSimpleName());
        return message.replaceAll("(?i)(api[-_ ]?key|token|secret|password)\\s*[:=]\\s*\\S+", "$1=***");
    }

    private String quote(String value) {
        return "\"" + escapeJson(value) + "\"";
    }

    private String escapeJson(String value) {
        return Objects.toString(value, "").replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private Integer clampScore(Integer score) {
        if (score == null) return null;
        return Math.max(0, Math.min(100, score));
    }

    private Integer firstInt(Integer value, int fallback) {
        return value == null ? fallback : value;
    }

    private String levelOf(Integer score) {
        if (score == null) return "信息不足";
        if (score >= 85) return "表现较好";
        if (score >= 70) return "基础良好";
        if (score >= 50) return "建议优化";
        return "需要重点修改";
    }

    private String firstText(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) return value;
        }
        return "";
    }

    private String emptyToNull(String value) {
        return StringUtils.hasText(value) ? value : null;
    }

    private <T> List<T> safeList(List<T> values) {
        return values == null ? List.of() : values;
    }

    private List<Detail> ensureDetails(List<Detail> details) {
        if (details == null || details.isEmpty()) {
            List<Detail> fallback = new ArrayList<>();
            fallback.add(new Detail("completeness", "内容完整度", null, "AI未返回该维度详情。", List.of(), List.of(), List.of("请重新诊断或补充简历文本。")));
            return fallback;
        }
        return details;
    }
}




