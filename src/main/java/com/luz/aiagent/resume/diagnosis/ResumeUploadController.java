package com.luz.aiagent.resume.diagnosis;

import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.UploadResumeResponse;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/resumes")
public class ResumeUploadController {
    @Resource
    private ResumeDiagnosisService resumeDiagnosisService;

    @PostMapping("/upload")
    public UploadResumeResponse upload(@RequestParam("file") MultipartFile file) {
        return resumeDiagnosisService.upload(file);
    }
}
