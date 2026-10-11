package com.luz.aiagent.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
@Slf4j
public class OpenAiCompatibleChatClient {

    private static final int MAX_MEMORY_MESSAGES = 12;
    private static final int MAX_ERROR_BODY_LENGTH = 600;
    private static final int MAX_NON_STREAM_ATTEMPTS = 3;

    private final OpenAiProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final ConcurrentMap<String, ArrayDeque<ChatMessage>> conversations = new ConcurrentHashMap<>();

    public OpenAiCompatibleChatClient(OpenAiProperties properties) {
        this.properties = properties;
        this.objectMapper = new ObjectMapper();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(Math.max(5, properties.getTimeoutSeconds())))
                .build();
    }

    public String completeOnce(String systemPrompt, String userMessage) {
        return completeWithRetry(buildMessages(systemPrompt, List.of(), userMessage), false, MAX_NON_STREAM_ATTEMPTS);
    }

    public String completeOnce(String systemPrompt, String userMessage, int maxAttempts) {
        return completeWithRetry(buildMessages(systemPrompt, List.of(), userMessage), false, maxAttempts);
    }

    public String completeJsonOnce(String systemPrompt, String userMessage) {
        List<ChatMessage> messages = buildMessages(systemPrompt, List.of(), userMessage);
        try {
            return completeWithRetry(messages, true, MAX_NON_STREAM_ATTEMPTS);
        } catch (IllegalStateException error) {
            if (!shouldFallbackWithoutJsonMode(error)) {
                throw error;
            }
            log.warn("JSON mode is not supported by current model endpoint, retrying without response_format: {}", safeError(error));
            return completeWithRetry(messages, false, MAX_NON_STREAM_ATTEMPTS);
        }
    }

    public String completeJsonOnce(String systemPrompt, String userMessage, int maxAttempts) {
        List<ChatMessage> messages = buildMessages(systemPrompt, List.of(), userMessage);
        try {
            return completeWithRetry(messages, true, maxAttempts);
        } catch (IllegalStateException error) {
            if (!shouldFallbackWithoutJsonMode(error)) {
                throw error;
            }
            log.warn("JSON mode is not supported by current model endpoint, retrying without response_format: {}", safeError(error));
            return completeWithRetry(messages, false, maxAttempts);
        }
    }

    public String completeJsonOnce(String systemPrompt, String userMessage, String imageMimeType, byte[] imageBytes) {
        List<Map<String, Object>> messages = buildImageMessages(systemPrompt, userMessage, imageMimeType, imageBytes);
        try {
            return completeWithRetry(messages, true, MAX_NON_STREAM_ATTEMPTS);
        } catch (IllegalStateException error) {
            if (!shouldFallbackWithoutJsonMode(error)) {
                throw error;
            }
            log.warn("JSON mode is not supported by current model endpoint, retrying without response_format: {}", safeError(error));
            return completeWithRetry(messages, false, MAX_NON_STREAM_ATTEMPTS);
        }
    }

    public String completeWithMemory(String systemPrompt, String userMessage, String chatId) {
        List<ChatMessage> history = snapshotHistory(chatId);
        String answer = completeWithRetry(buildMessages(systemPrompt, history, userMessage), false);
        remember(chatId, new ChatMessage("user", userMessage), new ChatMessage("assistant", answer));
        return answer;
    }

    public Flux<String> streamWithMemory(String systemPrompt, String userMessage, String chatId) {
        List<ChatMessage> history = snapshotHistory(chatId);
        List<ChatMessage> messages = buildMessages(systemPrompt, history, userMessage);
        return Flux.<String>create(sink -> {
            StringBuilder answer = new StringBuilder();
            try {
                HttpRequest request = buildRequest(messages, true, false);
                HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
                if (response.statusCode() >= 400) {
                    String errorBody = readBody(response.body());
                    sink.error(new IllegalStateException(formatHttpError(response.statusCode(), errorBody)));
                    return;
                }
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null && !sink.isCancelled()) {
                        String chunk = parseStreamLine(line);
                        if (chunk == null) {
                            continue;
                        }
                        if ("[DONE]".equals(chunk)) {
                            break;
                        }
                        if (!chunk.isEmpty()) {
                            answer.append(chunk);
                            sink.next(chunk);
                        }
                    }
                }
                if (answer.isEmpty() && !sink.isCancelled()) {
                    String fallbackAnswer = complete(messages, false);
                    answer.append(fallbackAnswer);
                    sink.next(fallbackAnswer);
                }
                remember(chatId, new ChatMessage("user", userMessage), new ChatMessage("assistant", answer.toString()));
                sink.complete();
            } catch (Exception error) {
                sink.error(error);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private String completeWithRetry(List<?> messages, boolean jsonMode) {
        return completeWithRetry(messages, jsonMode, MAX_NON_STREAM_ATTEMPTS);
    }

    private String completeWithRetry(List<?> messages, boolean jsonMode, int maxAttempts) {
        IllegalStateException lastError = null;
        int attempts = Math.max(1, maxAttempts);
        for (int attempt = 1; attempt <= attempts; attempt++) {
            try {
                return complete(messages, jsonMode);
            } catch (IllegalStateException error) {
                if (jsonMode && shouldFallbackWithoutJsonMode(error)) {
                    throw error;
                }
                lastError = error;
                if (attempt >= attempts || !isTransientAiError(error)) {
                    throw error;
                }
                log.warn("AI request attempt {}/{} failed, retrying: {}", attempt, attempts, safeError(error));
                sleepBeforeRetry(attempt);
            }
        }
        throw lastError == null ? new IllegalStateException("AI request failed") : lastError;
    }

    private String complete(List<?> messages, boolean jsonMode) {
        try {
            HttpRequest request = buildRequest(messages, false, jsonMode);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 400) {
                throw new IllegalStateException(formatHttpError(response.statusCode(), response.body()));
            }
            return extractMessageContent(response.body());
        } catch (Exception error) {
            throw new IllegalStateException("OpenAI-compatible AI request failed: " + safeError(error), error);
        }
    }

    private HttpRequest buildRequest(List<?> messages, boolean stream, boolean jsonMode) throws Exception {
        validateConfig();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", StringUtils.hasText(properties.getModel()) ? properties.getModel().trim() : "deepseek-v4-pro");
        payload.put("messages", messages);
        payload.put("temperature", jsonMode ? 0.1 : 0.3);
        payload.put("stream", stream);
        if (jsonMode && !stream) {
            payload.put("response_format", Map.of("type", "json_object"));
        }
        String body = objectMapper.writeValueAsString(payload);
        return HttpRequest.newBuilder(URI.create(properties.chatCompletionsUrl()))
                .timeout(Duration.ofSeconds(Math.max(10, properties.getTimeoutSeconds())))
                .header("Authorization", "Bearer " + properties.getApiKey().trim())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
    }

    private List<Map<String, Object>> buildImageMessages(String systemPrompt, String userMessage, String imageMimeType, byte[] imageBytes) {
        List<Map<String, Object>> messages = new ArrayList<>();
        if (StringUtils.hasText(systemPrompt)) {
            messages.add(Map.of("role", "system", "content", systemPrompt.trim()));
        }
        List<Object> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", userMessage == null ? "" : userMessage.trim()));
        if (imageBytes != null && imageBytes.length > 0) {
            String mimeType = StringUtils.hasText(imageMimeType) ? imageMimeType.trim() : "image/png";
            String dataUrl = "data:%s;base64,%s".formatted(mimeType, Base64.getEncoder().encodeToString(imageBytes));
            content.add(Map.of("type", "image_url", "image_url", Map.of("url", dataUrl)));
        }
        messages.add(Map.of("role", "user", "content", content));
        return messages;
    }

    private void validateConfig() {
        if (!StringUtils.hasText(properties.getApiKey())) {
            throw new IllegalStateException("OPENAI_API_KEY is not set. Set it in the backend environment before starting Spring Boot.");
        }
        if (!StringUtils.hasText(properties.getBaseUrl())) {
            throw new IllegalStateException("OPENAI_BASE_URL is empty.");
        }
    }

    private List<ChatMessage> buildMessages(String systemPrompt, List<ChatMessage> history, String userMessage) {
        List<ChatMessage> messages = new ArrayList<>();
        if (StringUtils.hasText(systemPrompt)) {
            messages.add(new ChatMessage("system", systemPrompt.trim()));
        }
        messages.addAll(history);
        messages.add(new ChatMessage("user", userMessage == null ? "" : userMessage.trim()));
        return messages;
    }

    private List<ChatMessage> snapshotHistory(String chatId) {
        if (!StringUtils.hasText(chatId)) {
            return List.of();
        }
        ArrayDeque<ChatMessage> history = conversations.get(chatId.trim());
        if (history == null) {
            return List.of();
        }
        synchronized (history) {
            return new ArrayList<>(history);
        }
    }

    private void remember(String chatId, ChatMessage user, ChatMessage assistant) {
        if (!StringUtils.hasText(chatId)) {
            return;
        }
        ArrayDeque<ChatMessage> history = conversations.computeIfAbsent(chatId.trim(), ignored -> new ArrayDeque<>());
        synchronized (history) {
            history.addLast(user);
            if (StringUtils.hasText(assistant.content())) {
                history.addLast(assistant);
            }
            while (history.size() > MAX_MEMORY_MESSAGES) {
                history.removeFirst();
            }
        }
    }

    private String extractMessageContent(String body) throws Exception {
        JsonNode root = objectMapper.readTree(body);
        JsonNode content = root.path("choices").path(0).path("message").path("content");
        if (!content.isMissingNode() && !content.isNull()) {
            return content.asText();
        }
        throw new IllegalStateException("AI response does not contain choices[0].message.content");
    }

    private String parseStreamLine(String line) throws Exception {
        if (line == null || !line.startsWith("data:")) {
            return null;
        }
        String data = line.substring(5).trim();
        if (data.isEmpty()) {
            return null;
        }
        if ("[DONE]".equals(data)) {
            return "[DONE]";
        }
        JsonNode root = objectMapper.readTree(data);
        JsonNode deltaContent = root.path("choices").path(0).path("delta").path("content");
        if (!deltaContent.isMissingNode() && !deltaContent.isNull()) {
            return deltaContent.asText();
        }
        JsonNode messageContent = root.path("choices").path(0).path("message").path("content");
        if (!messageContent.isMissingNode() && !messageContent.isNull()) {
            return messageContent.asText();
        }
        return "";
    }

    private String readBody(InputStream inputStream) throws Exception {
        try (inputStream) {
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private String formatHttpError(int statusCode, String body) {
        return "OpenAI-compatible API returned HTTP " + statusCode + ": " + sanitizeBody(body);
    }

    private boolean shouldFallbackWithoutJsonMode(Throwable error) {
        String message = Objects.toString(error.getMessage(), "").toLowerCase();
        return message.contains("response_format")
                || message.contains("json mode")
                || message.contains("json_object")
                || message.contains("unsupported")
                || message.contains("not support");
    }

    private boolean isTransientAiError(Throwable error) {
        String message = Objects.toString(error.getMessage(), "").toLowerCase();
        return message.contains("timeout")
                || message.contains("timed out")
                || message.contains("connection reset")
                || message.contains("connection closed")
                || message.contains("connection refused")
                || message.contains("http 408")
                || message.contains("http 429")
                || message.contains("http 500")
                || message.contains("http 502")
                || message.contains("http 503")
                || message.contains("http 504");
    }

    private void sleepBeforeRetry(int attempt) {
        try {
            Thread.sleep(Math.min(4200L, 1200L * attempt));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("AI retry interrupted", interrupted);
        }
    }

    private String sanitizeBody(String body) {
        if (body == null) {
            return "";
        }
        String sanitized = body.replaceAll("(?i)(api[-_ ]?key|token|secret|password)\\s*[:=]\\s*\\S+", "$1=***");
        if (sanitized.length() > MAX_ERROR_BODY_LENGTH) {
            return sanitized.substring(0, MAX_ERROR_BODY_LENGTH) + "...";
        }
        return sanitized;
    }

    private String safeError(Throwable error) {
        String message = error.getMessage();
        if (!StringUtils.hasText(message)) {
            return error.getClass().getSimpleName();
        }
        return sanitizeBody(message);
    }

    public record ChatMessage(String role, String content) {
    }
}
