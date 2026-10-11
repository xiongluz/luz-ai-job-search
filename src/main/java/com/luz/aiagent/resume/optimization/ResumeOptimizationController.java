package com.luz.aiagent.resume.optimization;

import com.luz.aiagent.resume.optimization.ResumeOptimizationDtos.OptimizationReport;
import com.luz.aiagent.resume.optimization.ResumeOptimizationDtos.OptimizeResumeRequest;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/ai/jobs")
public class ResumeOptimizationController {
    @Resource
    private ResumeOptimizationService resumeOptimizationService;

    @PostMapping("/resume-advice")
    public OptimizationReport optimizeResume(@RequestBody OptimizeResumeRequest request) {
        return resumeOptimizationService.optimize(request);
    }
}
