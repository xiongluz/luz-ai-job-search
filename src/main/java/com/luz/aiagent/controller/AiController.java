package com.luz.aiagent.controller;

import com.luz.aiagent.app.ResumeApp;
import com.luz.aiagent.resume.diagnosis.ResumeDiagnosisService;
import jakarta.annotation.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/ai")
public class AiController {

    @Resource
    private ResumeApp resumeApp;

    @Resource
    private ResumeDiagnosisService resumeDiagnosisService;

    @GetMapping("/resume_app/chat/sync")
    public String doChatWithResumeAppSync(
            @RequestParam String message,
            @RequestParam(required = false) String chatId,
            @RequestParam(required = false) String resumeIds) {
        return doChat(appendResumeContext(requireMessage(message), parseResumeIds(resumeIds)), chatId);
    }

    @GetMapping(value = "/resume_app/chat/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> doChatWithResumeAppSSE(
            @RequestParam String message,
            @RequestParam(required = false) String chatId,
            @RequestParam(required = false) String resumeIds) {
        String normalizedMessage = appendResumeContext(requireMessage(message), parseResumeIds(resumeIds));
        String normalizedChatId = normalizeChatId(chatId);
        return resumeApp.doChatByStream(normalizedMessage, normalizedChatId)
                .onErrorResume(error -> Flux.just("AI服务暂时不可用：" + safeError(error)));
    }

    @PostMapping(value = "/resume_app/chat", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResumeChatResponse doChatWithResumeAppPost(@RequestBody ResumeChatRequest request) {
        String message = appendResumeContext(buildMessage(request), request == null ? List.of() : request.resumeIds());
        String chatId = normalizeChatId(request == null ? null : request.chatId());
        return new ResumeChatResponse(doChat(message, chatId), chatId, OffsetDateTime.now().toString());
    }

    private String doChat(String message, String chatId) {
        try {
            return resumeApp.doChat(requireMessage(message), normalizeChatId(chatId));
        } catch (ResponseStatusException error) {
            throw error;
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AI服务暂时不可用：" + safeError(error), error);
        }
    }

    private String buildMessage(ResumeChatRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请求体不能为空。");
        }
        StringBuilder builder = new StringBuilder();
        if (hasText(request.mode())) {
            builder.append("当前模式：").append(request.mode()).append("\n\n");
        }
        builder.append(requireMessage(request.message()));
        if (hasText(request.jd())) {
            builder.append("\n\n目标岗位JD：\n").append(request.jd().trim());
        }
        return builder.toString();
    }

    private String appendResumeContext(String message, List<String> resumeIds) {
        String context = resumeDiagnosisService.buildResumeChatContext(resumeIds);
        if (hasText(context)) {
            return message + context;
        }
        if (resumeIds != null && !resumeIds.isEmpty()) {
            return message + "\n\n用户已选择上传简历，但后端解析记录不存在或已过期。请提示用户重新上传简历文件。";
        }
        return message;
    }

    private List<String> parseResumeIds(String resumeIds) {
        if (!hasText(resumeIds)) {
            return List.of();
        }
        return Arrays.stream(resumeIds.split(","))
                .map(String::trim)
                .filter(this::hasText)
                .distinct()
                .limit(3)
                .toList();
    }

    private String requireMessage(String message) {
        if (!hasText(message)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "消息内容不能为空。");
        }
        return message.trim();
    }

    private String normalizeChatId(String chatId) {
        return hasText(chatId) ? chatId.trim() : "resume-" + UUID.randomUUID();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String safeError(Throwable error) {
        String message = error.getMessage();
        if (!hasText(message)) {
            return "请稍后重试。";
        }
        String lower = message.toLowerCase();
        if (lower.contains("upstream access forbidden") || lower.contains("access forbidden")) {
            return "上游模型拒绝访问：请检查 API Key、Base URL 和模型名是否属于同一家服务商，并确认当前 Key 有权限调用该模型。";
        }
        if (lower.contains("http 401") || lower.contains("unauthorized")) {
            return "模型鉴权失败：API Key 无效、已过期或没有正确传入后端环境变量。";
        }
        if (lower.contains("http 403") || lower.contains("forbidden")) {
            return "模型权限不足：当前 API Key 没有访问该模型或该接口的权限。";
        }
        if (lower.contains("http 429") || lower.contains("rate_limit") || lower.contains("rate limit")) {
            return "模型调用被限流：请求过快、额度不足或当前 Key 达到频率限制，请稍后重试或更换额度充足的 Key。";
        }
        if (lower.contains("http 502") || lower.contains("http 503") || lower.contains("temporarily unavailable")) {
            return "上游模型服务暂时不可用，或当前模型网关配置不正确。请确认 Base URL 和模型名后重启后端。";
        }
        return message.replaceAll("(?i)(api[-_ ]?key|token|secret|password)\\s*[:=]\\s*\\S+", "$1=***");
    }

    public record ResumeChatRequest(String mode, String message, String jd, String chatId, List<String> resumeIds) {
    }

    public record ResumeChatResponse(String reply, String chatId, String time) {
    }
}
