package com.luz.aiagent.resume.jobai;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/ai/jobs")
public class JobAiController {

    private final JobAiService jobAiService;
    private final JobMatchService jobMatchService;

    public JobAiController(JobAiService jobAiService, JobMatchService jobMatchService) {
        this.jobAiService = jobAiService;
        this.jobMatchService = jobMatchService;
    }

    @PostMapping(value = "/parse", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> parse(@RequestBody Map<String, Object> request) {
        return jobAiService.parseJobDescription(request);
    }

    @PostMapping(value = "/match", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> match(@RequestBody Map<String, Object> request) {
        return jobMatchService.matchSingle(request);
    }

    @PostMapping(value = "/batch-match", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public JobMatchDtos.BatchMatchResponse batchMatch(@RequestBody JobMatchDtos.BatchMatchRequest request) {
        return jobMatchService.batchMatch(request);
    }

    @PostMapping(value = "/field-suggestions", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> fieldSuggestions(@RequestBody Map<String, Object> request) {
        return jobAiService.fieldSuggestions(request);
    }

    @PostMapping(value = "/jd-image/parse", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> parseJdImage(@RequestParam("file") MultipartFile file) {
        return jobAiService.parseJdImage(file);
    }

    @PostMapping(value = "/social-recommend", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> socialRecommend(@RequestBody Map<String, Object> request) {
        return jobAiService.recommendSocialJobs(request);
    }
}
