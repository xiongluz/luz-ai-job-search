package com.luz.aiagent.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/ai-resume")
public class LegacyAiResumeController {

    private final AiController aiController;
    private final com.luz.aiagent.resume.diagnosis.ResumeDiagnosisService resumeDiagnosisService;

    public LegacyAiResumeController(AiController aiController,
                                    com.luz.aiagent.resume.diagnosis.ResumeDiagnosisService resumeDiagnosisService) {
        this.aiController = aiController;
        this.resumeDiagnosisService = resumeDiagnosisService;
    }

    @PostMapping(value = "/chat", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public LegacyResumeChatResponse chatJson(@RequestBody AiController.ResumeChatRequest request) {
        AiController.ResumeChatResponse response = aiController.doChatWithResumeAppPost(request);
        return new LegacyResumeChatResponse(response.reply(), response.chatId(), response.time());
    }

    @PostMapping(value = "/chat", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public LegacyResumeChatResponse chatMultipart(
            @RequestParam(required = false) String mode,
            @RequestParam(required = false) String message,
            @RequestParam(required = false) String jd,
            @RequestParam(required = false) String chatId,
            @RequestParam(required = false) List<MultipartFile> files) {
        List<String> resumeIds = new ArrayList<>();
        if (files != null) {
            for (MultipartFile file : files) {
                if (file != null && !file.isEmpty()) {
                    resumeIds.add(resumeDiagnosisService.upload(file).resumeId());
                }
            }
        }
        String fileNote = resumeIds.isEmpty() ? "" : "\n\n用户已上传并解析简历文件。";
        AiController.ResumeChatResponse response = aiController.doChatWithResumeAppPost(
                new AiController.ResumeChatRequest(mode, (message == null ? "" : message) + fileNote, jd, chatId, resumeIds));
        return new LegacyResumeChatResponse(response.reply(), response.chatId(), response.time());
    }

    public record LegacyResumeChatResponse(String reply, String chatId, String time) {
        public LegacyResumeChatResponse {
            if (time == null) {
                time = OffsetDateTime.now().toString();
            }
        }
    }
}
