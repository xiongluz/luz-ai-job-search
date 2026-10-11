package com.luz.aiagent.app;

import com.luz.aiagent.ai.OpenAiCompatibleChatClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

@Component
@Slf4j
public class ResumeApp {

    private static final String SYSTEM_PROMPT = "你是律动求职的 AI 简历助手，负责提供中文简历修改、求职准备、面试表达和岗位匹配建议。回答要具体、克制、可执行，不要虚构用户经历。";

    private final OpenAiCompatibleChatClient aiClient;

    public ResumeApp(OpenAiCompatibleChatClient aiClient) {
        this.aiClient = aiClient;
    }

    public String doChat(String message, String chatId) {
        String content = aiClient.completeWithMemory(SYSTEM_PROMPT, message, chatId);
        log.info("resume ai reply length={}", content == null ? 0 : content.length());
        return content;
    }

    public Flux<String> doChatByStream(String message, String chatId) {
        return aiClient.streamWithMemory(SYSTEM_PROMPT, message, chatId);
    }
}
