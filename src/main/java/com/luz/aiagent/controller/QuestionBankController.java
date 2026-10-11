package com.luz.aiagent.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.luz.aiagent.ai.OpenAiCompatibleChatClient;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/ai/question-bank")
public class QuestionBankController {
    private static final String SYSTEM_PROMPT = """
            你是求职面试题库生成助手。根据用户需求生成结构化题库，只返回有效 JSON，不要 Markdown 代码块。
            JSON 格式必须为：
            {
              "title": "题库标题",
              "summary": "题库说明",
              "categories": [
                {
                  "name": "分类名称",
                  "questions": [
                    {
                      "question": "题目",
                      "difficulty": "初级/中级/高级",
                      "focus": "考察点：用简短短句列出2-3个核心考察维度，如：自我认知是否清晰，优势是否匹配岗位，短板是否致命",
                      "answer": "参考回答（求职者视角，第一人称对面试官作答）：\\n\\n正文内容，在关键能力词、专业术语、核心结论处用 **词语** 加粗标注，形成视觉重点。答案结构清晰，分2-4个逻辑层次展开，每层之间换行，字数不少于200字，语气自然真诚，贴近真实面试场景。不得编造用户未提供的个人经历。",
                      "analysis": "解析：说明该题的评分逻辑、面试官视角下的加分项与减分项，以及此答案为何有效。"
                    }
                  ]
                }
              ]
            }
            生成规则：
            1. 如用户未指定数量，默认生成 6 道题（质量优先，宁少勿滥）；
            2. 参考回答必须以求职者身份、第一人称回答面试官，口吻自然、有条理；
            3. 关键能力词、专业术语、结论性短语须用 **加粗** 标注，每道题不少于4处加粗；
            4. focus 字段格式固定为：「考察点：XXX，XXX，XXX」；
            5. answer 与 analysis 内容充实，禁止空洞套话；
            6. 不得编造用户未提供的个人经历或背景信息。
            """;

    private final OpenAiCompatibleChatClient client;
    private final ObjectMapper mapper;

    public QuestionBankController(OpenAiCompatibleChatClient client) {
        this.client = client;
        this.mapper = new ObjectMapper();
    }

    @PostMapping
    public JsonNode generate(@RequestBody QuestionBankRequest request) {
        if (request == null || request.message() == null || request.message().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "题库需求不能为空。");
        }
        try {
            String raw = client.completeJsonOnce(SYSTEM_PROMPT, request.message().trim());
            String normalized = raw.trim().replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
            return mapper.readTree(normalized);
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "题库生成失败，请稍后重试。", error);
        }
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> stream(@RequestBody QuestionBankRequest request) {
        if (request == null || request.message() == null || request.message().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "题库需求不能为空。");
        }
        String prompt = request.message().trim() + (request.resumeName() == null || request.resumeName().isBlank() ? "" : "\n\n用户上传简历文件：" + request.resumeName());
        return client.streamWithMemory(SYSTEM_PROMPT, prompt, "question-bank-" + (request.chatId() == null ? "default" : request.chatId()))
                .map(chunk -> ServerSentEvent.builder(normalizeChunk(chunk)).build())
                .filter(event -> event.data() != null && !event.data().isEmpty())
                .concatWithValues(ServerSentEvent.builder("[DONE]").event("done").build())
                .onErrorResume(error -> Flux.just(ServerSentEvent.builder("AI面试生成失败，请稍后重试。")
                        .event("error").build()));
    }

    private String normalizeChunk(String chunk) {
        if (chunk == null || chunk.isBlank()) return "";
        // The shared client may already return an SSE data line; normalize it before wrapping once.
        String normalized = java.util.Arrays.stream(chunk.split("\\r?\\n"))
                .map(String::trim)
                .filter(line -> !line.isEmpty())
                .map(line -> line.replaceFirst("^data:\\s?", ""))
                .filter(line -> !"[DONE]".equals(line))
                .collect(java.util.stream.Collectors.joining(""));
        if (normalized.isEmpty()) return "";
        return normalized;
    }

    public record QuestionBankRequest(String message, String resumeName, String chatId) {
    }
}
