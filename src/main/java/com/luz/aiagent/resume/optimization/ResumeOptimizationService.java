package com.luz.aiagent.resume.optimization;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.luz.aiagent.ai.OpenAiCompatibleChatClient;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.DiagnosisReport;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.StoredResume;
import com.luz.aiagent.resume.diagnosis.ResumeDiagnosisService;
import com.luz.aiagent.resume.optimization.ResumeOptimizationDtos.OptimizationReport;
import com.luz.aiagent.resume.optimization.ResumeOptimizationDtos.OptimizationTask;
import com.luz.aiagent.resume.optimization.ResumeOptimizationDtos.OptimizeResumeRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@Slf4j
public class ResumeOptimizationService {
    private static final String DISCLAIMER = "AI辅助优化建议需要用户确认，不会自动覆盖原简历，不应虚构经历、成果或数字。";
    private static final String SYSTEM_PROMPT = "你是严谨的中文简历优化专家。你和聊天、简历诊断使用同一个大模型。只输出严格 JSON，不输出 Markdown。不得虚构经历、公司、学校、项目、技能、证书、数字或成果。涉及原简历内容时只引用必要短片段。优化建议必须可执行，并明确不会自动覆盖原简历。";

    private final OpenAiCompatibleChatClient aiClient;
    private final ResumeDiagnosisService diagnosisService;
    private final ObjectMapper objectMapper;

    public ResumeOptimizationService(OpenAiCompatibleChatClient aiClient, ResumeDiagnosisService diagnosisService) {
        this.aiClient = aiClient;
        this.diagnosisService = diagnosisService;
        this.objectMapper = new ObjectMapper()
                .findAndRegisterModules()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    public OptimizationReport optimize(OptimizeResumeRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请求体不能为空。");
        }

        StoredResume resume = null;
        if (StringUtils.hasText(request.resumeId())) {
            try {
                resume = diagnosisService.getStoredResume(request.resumeId());
            } catch (ResponseStatusException ignored) {
                // A diagnosis report can still drive optimization when the raw resume text has expired.
            }
        }

        DiagnosisReport diagnosis = diagnosisService.findReport(request.diagnosisId());
        String resumeText = resume == null ? "" : resume.text();
        if (!StringUtils.hasText(resumeText) && diagnosis == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "缺少可优化的简历正文或诊断报告上下文。");
        }

        String optimizationId = "optimization_" + UUID.randomUUID().toString().replace("-", "");
        String resumeId = firstText(request.resumeId(), diagnosis == null ? null : diagnosis.resumeId(), "unknown_resume");
        String resumeName = firstText(request.resumeName(), resume == null ? null : resume.fileName(), diagnosis == null ? null : diagnosis.resumeName(), "当前简历");
        String targetRole = firstText(request.targetRole(), diagnosis == null ? null : diagnosis.targetJobName(), "按诊断问题优化");

        try {
            String prompt = buildPrompt(optimizationId, resumeId, resumeName, targetRole, request, diagnosis, resumeText);
            String content = aiClient.completeJsonOnce(SYSTEM_PROMPT, prompt);
            OptimizationReport raw = objectMapper.readValue(extractJson(content), OptimizationReport.class);
            return normalize(raw, optimizationId, resumeId, resumeName, targetRole, request);
        } catch (Exception error) {
            log.warn("resume optimization failed: resumeId={}, diagnosisId={}, reason={}", resumeId, request.diagnosisId(), safeError(error));
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "简历优化模型调用失败，请稍后重试。", error);
        }
    }

    private String buildPrompt(String optimizationId, String resumeId, String resumeName, String targetRole,
                               OptimizeResumeRequest request, DiagnosisReport diagnosis, String resumeText) throws Exception {
        String diagnosisJson = diagnosis == null ? "未提供" : objectMapper.writeValueAsString(diagnosis);
        String schema = """
                {
                  "optimizationId":"%s",
                  "resumeId":"%s",
                  "resumeName":"%s",
                  "diagnosisId":%s,
                  "issueId":%s,
                  "jobId":%s,
                  "jobType":%s,
                  "targetRole":"%s",
                  "company":%s,
                  "title":"真实AI简历优化方案",
                  "summary":"一句话说明本次优化重点",
                  "summaryPoints":["优先修改什么","为什么这样改","修改时不能虚构什么"],
                  "keywords":["从JD或诊断报告中提取的关键词"],
                  "tasks":[
                    {
                      "id":"task_1",
                      "section":"求职目标/项目经历/成果表达/技能关键词等",
                      "priority":"立即修改/建议优化/可选提升",
                      "before":"当前问题或必要原文短片段",
                      "after":"建议改写方向或建议文本，必须基于已有事实",
                      "reason":"为什么这样改",
                      "evidence":"引用必要短证据，没有则写未识别",
                      "actionType":"rewrite/add/reorder/remove/clarify",
                      "acceptanceCriteria":"用户确认这一项完成的标准"
                    }
                  ],
                  "warnings":["不能自动覆盖原简历","数字和成果需要用户确认"],
                  "persisted":false,
                  "modelShared":true,
                  "source":"openai-compatible-shared-model",
                  "createdAt":"ISO时间由后端覆盖",
                  "disclaimer":"%s"
                }
                """.formatted(
                optimizationId,
                escapeJson(resumeId),
                escapeJson(resumeName),
                nullableQuote(request.diagnosisId()),
                nullableQuote(request.issueId()),
                nullableQuote(request.jobId()),
                nullableQuote(request.jobType()),
                escapeJson(targetRole),
                nullableQuote(request.targetCompany()),
                escapeJson(DISCLAIMER)
        );

        return """
                请基于诊断报告、目标岗位和简历正文生成真实简历优化报告。
                只输出一个 JSON 对象，不要 Markdown，不要代码块，不要额外解释。

                规则：
                1. 聊天、诊断、优化必须理解为同一个大模型能力链路；本次只输出优化报告。
                2. 不得虚构简历中没有的经历、学历、成果、项目、数字或技能。
                3. 如果建议补数字，必须写“需要用户确认”，不能替用户编造。
                4. tasks 生成 4-8 项，按优先级排序。
                5. before/evidence 只放必要短片段，不输出完整简历。
                6. after 给可执行改写方向，能直接指导用户手动修改。
                7. 如果没有目标岗位，不要虚构岗位匹配结论，只按诊断问题和通用投递质量优化。

                JSON结构参考：
                %s

                请求上下文：
                optimizationId=%s
                resumeId=%s
                resumeName=%s
                diagnosisId=%s
                issueId=%s
                jobType=%s
                jobId=%s
                targetRole=%s
                targetCompany=%s

                目标岗位/JD：
                %s

                诊断报告JSON：
                %s

                简历正文：
                %s
                """.formatted(
                schema,
                optimizationId,
                escapeJson(resumeId),
                escapeJson(resumeName),
                Objects.toString(request.diagnosisId(), ""),
                Objects.toString(request.issueId(), ""),
                Objects.toString(request.jobType(), ""),
                Objects.toString(request.jobId(), ""),
                escapeJson(targetRole),
                Objects.toString(request.targetCompany(), ""),
                StringUtils.hasText(request.jobDescription()) ? truncate(request.jobDescription(), 4000) : "未提供",
                diagnosisJson,
                StringUtils.hasText(resumeText) ? truncate(resumeText, 12000) : "简历正文未提供，仅基于诊断报告生成优化任务"
        );
    }

    private OptimizationReport normalize(OptimizationReport raw, String optimizationId, String resumeId, String resumeName,
                                        String targetRole, OptimizeResumeRequest request) {
        List<OptimizationTask> tasks = raw.tasks() == null ? List.of() : raw.tasks().stream()
                .filter(task -> task != null && StringUtils.hasText(task.section()))
                .map(task -> new OptimizationTask(
                        firstText(task.id(), "task_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8)),
                        task.section(),
                        firstText(task.priority(), "建议优化"),
                        firstText(task.before(), "当前问题未识别。"),
                        firstText(task.after(), "请结合诊断报告手动补充修改。"),
                        firstText(task.reason(), "建议确认后再采纳。"),
                        firstText(task.evidence(), "未识别"),
                        firstText(task.actionType(), "clarify"),
                        firstText(task.acceptanceCriteria(), "用户确认内容真实且与岗位相关")
                ))
                .toList();

        return new OptimizationReport(
                firstText(raw.optimizationId(), optimizationId),
                resumeId,
                resumeName,
                emptyToNull(request.diagnosisId()),
                emptyToNull(request.issueId()),
                emptyToNull(request.jobId()),
                emptyToNull(request.jobType()),
                firstText(raw.targetRole(), targetRole),
                firstText(raw.company(), request.targetCompany(), ""),
                firstText(raw.title(), "真实AI简历优化方案"),
                firstText(raw.summary(), "已生成真实AI优化建议，请逐项确认后手动修改。"),
                raw.summaryPoints() == null ? List.of("优先处理诊断报告中的高优先级问题", "补强项目和成果证据", "所有数字和经历需要用户确认") : raw.summaryPoints(),
                raw.keywords() == null ? List.of() : raw.keywords(),
                tasks.isEmpty() ? fallbackTasks() : tasks,
                raw.warnings() == null ? List.of("不会自动覆盖原简历", "数字和成果需要用户确认") : raw.warnings(),
                false,
                true,
                "openai-compatible-shared-model",
                Instant.now(),
                DISCLAIMER
        );
    }

    private List<OptimizationTask> fallbackTasks() {
        return List.of(new OptimizationTask("task_fallback", "优化任务", "建议优化",
                "模型未返回有效任务明细。", "请重新生成，或先补充目标岗位/JD后再试。",
                "缺少结构化任务会影响逐项修改。", "未识别", "clarify", "返回可执行的优化任务"));
    }

    private String extractJson(String content) {
        if (!StringUtils.hasText(content)) {
            throw new IllegalArgumentException("AI返回为空");
        }
        String text = content.trim();
        if (text.startsWith("```")) {
            text = text.replaceFirst("^```[a-zA-Z]*", "").replaceFirst("```$", "").trim();
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new IllegalArgumentException("AI未返回JSON对象");
        }
        return text.substring(start, end + 1);
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) return Objects.toString(value, "");
        return value.substring(0, maxLength) + "\n[内容已截断]";
    }

    private String nullableQuote(String value) {
        return StringUtils.hasText(value) ? "\"" + escapeJson(value) + "\"" : "null";
    }

    private String escapeJson(String value) {
        return Objects.toString(value, "").replace("\\", "\\\\").replace("\"", "\\\"");
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

    private String safeError(Throwable error) {
        String message = error.getMessage();
        if (!StringUtils.hasText(message)) {
            return error.getClass().getSimpleName();
        }
        return message.replaceAll("(?i)(api[-_ ]?key|token|secret|password)\\s*[:=]\\s*\\S+", "$1=***");
    }
}
