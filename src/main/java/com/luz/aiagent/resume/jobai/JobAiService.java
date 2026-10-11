package com.luz.aiagent.resume.jobai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.luz.aiagent.ai.OpenAiCompatibleChatClient;
import com.luz.aiagent.resume.diagnosis.ResumeDiagnosisService;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.StoredResume;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class JobAiService {

    private static final long MAX_JD_IMAGE_BYTES = 8 * 1024 * 1024L;

    private final OpenAiCompatibleChatClient aiClient;
    private final ObjectMapper objectMapper;
    private final ResumeDiagnosisService resumeDiagnosisService;

    public JobAiService(OpenAiCompatibleChatClient aiClient, ResumeDiagnosisService resumeDiagnosisService) {
        this.aiClient = aiClient;
        this.objectMapper = new ObjectMapper();
        this.resumeDiagnosisService = resumeDiagnosisService;
    }

    public Map<String, Object> recommendSocialJobs(Map<String, Object> request) {
//        if (!Boolean.parseBoolean(System.getenv().getOrDefault("JOB_SEARCH_ENABLED", "false"))) {
//            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "SEARCH_PROVIDER_NOT_CONFIGURED");
//        }
        String resumeId = text(request, "resumeId");
        String idealRole = text(request, "idealRole");
        StoredResume resume = resumeDiagnosisService.getStoredResume(resumeId);
        String prompt = """
                你是社招岗位推荐助手。仅输出严格 JSON，不输出 Markdown、解释或 AI 字样。
                请根据简历内容和用户理想岗位描述推荐 6-10 个社招岗位方向参考，不要引用数据库岗位，不要声称是现实招聘职位。
                这是岗位方向参考，不要编造真实公司名称或网址；公司名称可填写“适合的互联网企业”等公司类型，岗位来源和投递官网必须为空。
                每个岗位包含：岗位名称、公司名称、工作地点、薪资范围、经验要求、匹配原因、岗位描述、岗位来源、投递官网。
                返回格式：{"岗位列表":[{"岗位名称":"","公司名称":"适合的企业类型","工作地点":"","薪资范围":"","经验要求":"","匹配原因":"","岗位描述":"","岗位来源":"","投递官网":""}]}
                简历名称：%s
                理想岗位：%s
                简历内容：%s
                """.formatted(safe(resume.fileName()), safe(idealRole), safe(resume.text()));
        Map<String, Object> result = normalizeAiObject(aiClient.completeJsonOnce(prompt, prompt));
        Object jobs = result.get("岗位列表");
        if (!(jobs instanceof List<?>)) jobs = result.get("jobs");
        result.put("jobs", jobs instanceof List<?> list ? list : List.of());
        result.remove("岗位列表");
        return result;
    }


    public Map<String, Object> parseJobDescription(Map<String, Object> request) {
        String jobDescription = text(request, "jobDescription");
        String jobType = text(request, "jobType");
        String currentFields = asJsonString(request == null ? null : request.get("currentFields"));
        String prompt = """
                You are an AI recruiting assistant.
                Return ONLY one JSON object.
                Parse the job description and suggest editable fields for the frontend.
                Required keys:
                {
                  "suggestions": {
                    "role": {"value": "...", "confidence": "high", "source": "ai"},
                    "company": {"value": "...", "confidence": "high", "source": "ai"}
                  },
                  "summaryPoints": ["..."],
                  "keywords": ["..."],
                  "jobType": "...",
                  "jobDescriptionLength": 0
                }
                Keep unknown fields as empty suggestions.
                Frontend currentFields JSON: %s
                jobType: %s
                jobDescription: %s
                """.formatted(currentFields, safe(jobType), safe(jobDescription));
        return normalizeAiObject(aiClient.completeJsonOnce(prompt, prompt));
    }

    public Map<String, Object> matchResumeToJob(Map<String, Object> request) {
        String jobDescription = text(request, "jobDescription");
        String resumeText = text(request, "resumeText");
        String resumeName = text(request, "resumeName");
        String jobType = text(request, "jobType");
        String prompt = """
                You are an AI resume-job matching engine.
                Return ONLY one JSON object.
                Required keys:
                {
                  "overallScore": 0,
                  "keywordScore": 0,
                  "educationScore": 0,
                  "skillScore": 0,
                  "experienceScore": 0,
                  "recommendation": "...",
                  "shouldApply": "...",
                  "strengths": ["..."],
                  "gaps": ["..."],
                  "missingKeywords": ["..."],
                  "optimizationAdvice": ["..."],
                  "matchedKeywords": ["..."]
                }
                jobType: %s
                resumeName: %s
                resumeText: %s
                jobDescription: %s
                """.formatted(safe(jobType), safe(resumeName), safe(resumeText), safe(jobDescription));
        return normalizeAiObject(aiClient.completeJsonOnce(prompt, prompt));
    }

    public Map<String, Object> fieldSuggestions(Map<String, Object> request) {
        String jobDescription = text(request, "jobDescription");
        String currentFields = asJsonString(request == null ? null : request.get("currentFields"));
        String prompt = """
                You are an AI job form assistant.
                Return ONLY one JSON object.
                Required keys:
                {
                  "suggestions": {
                    "role": {"value": "...", "confidence": "high", "source": "ai"},
                    "city": {"value": "...", "confidence": "high", "source": "ai"}
                  },
                  "summaryPoints": ["..."],
                  "warnings": ["..."]
                }
                Frontend currentFields JSON: %s
                jobDescription: %s
                """.formatted(currentFields, safe(jobDescription));
        return normalizeAiObject(aiClient.completeJsonOnce(prompt, prompt));
    }

    public Map<String, Object> parseJdImage(MultipartFile file) {
        validateJdImage(file);
        String systemPrompt = "你是严谨的招聘 JD 图片识别助手。只输出严格 JSON，不输出 Markdown。不要编造图片中不存在的信息。";
        String userPrompt = """
                请识别图片中的招聘 JD 内容，并提取为可用于简历优化的结构化结果。
                如果图片里有多段文字，请优先保留岗位职责、任职要求、公司/岗位名称、技能关键词。
                输出 JSON：
                {
                  "jobDescription": "整理后的完整JD文本，适合直接放入前端文本框",
                  "role": "岗位名称，未识别则为空",
                  "company": "公司名称，未识别则为空",
                  "keywords": ["关键词"],
                  "summaryPoints": ["职责或要求摘要"],
                  "confidence": "high/medium/low",
                  "source": "openai-compatible-vision"
                }
                """;
        try {
            String content = aiClient.completeJsonOnce(systemPrompt, userPrompt, file.getContentType(), file.getBytes());
            Map<String, Object> result = normalizeAiObject(content);
            result.putIfAbsent("fileName", file.getOriginalFilename());
            result.putIfAbsent("fileSize", file.getSize());
            result.put("source", "openai-compatible-vision");
            result.put("modelShared", true);
            if (!StringUtils.hasText(Objects.toString(result.get("jobDescription"), ""))) {
                throw new IllegalStateException("模型未识别到有效JD文本");
            }
            return result;
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "JD图片识别失败，请确认当前模型支持图片理解，或手动粘贴JD文本。", error);
        }
    }

    private Map<String, Object> normalizeAiObject(String response) {
        Map<String, Object> result = parseJsonObject(response);
        result.putIfAbsent("createdAt", Instant.now().toString());
        result.putIfAbsent("source", "openai-compatible");
        result.putIfAbsent("modelShared", false);
        return result;
    }

    private void validateJdImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择需要识别的JD图片。");
        }
        if (file.getSize() > MAX_JD_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "JD图片不能超过8MB。");
        }
        String contentType = file.getContentType();
        if (!StringUtils.hasText(contentType) || !contentType.toLowerCase().startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "仅支持上传图片格式的JD截图。");
        }
    }

    private Map<String, Object> parseJsonObject(String response) {
        if (!StringUtils.hasText(response)) {
            throw new IllegalStateException("AI service returned empty response");
        }
        try {
            JsonNode node = objectMapper.readTree(extractJson(response));
            if (!node.isObject()) {
                throw new IllegalStateException("AI response is not a JSON object");
            }
            return objectMapper.convertValue(node, Map.class);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("AI response is not valid JSON: " + error.getOriginalMessage(), error);
        }
    }

    private String extractJson(String response) {
        String trimmed = response.trim();
        if (trimmed.startsWith("```")) {
            trimmed = trimmed.replaceFirst("^```[a-zA-Z]*\\s*", "");
            if (trimmed.endsWith("```")) {
                trimmed = trimmed.substring(0, trimmed.length() - 3);
            }
        }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }
        return trimmed;
    }

    private String asJsonString(Object value) {
        try {
            return value == null ? "null" : objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            return String.valueOf(value);
        }
    }

    private String text(Map<String, Object> request, String key) {
        if (request == null) {
            return "";
        }
        Object value = request.get(key);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String safe(String value) {
        return StringUtils.hasText(value) ? value : "";
    }
}
