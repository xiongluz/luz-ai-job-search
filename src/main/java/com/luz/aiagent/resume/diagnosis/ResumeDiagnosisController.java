package com.luz.aiagent.resume.diagnosis;

import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.DiagnoseRequest;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.DiagnosisChatRequest;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.DiagnosisChatResponse;
import com.luz.aiagent.resume.diagnosis.DiagnosisDtos.DiagnosisReport;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/ai/resumes")
public class ResumeDiagnosisController {
    @Resource
    private ResumeDiagnosisService resumeDiagnosisService;

    @PostMapping("/diagnose")
    public DiagnosisReport diagnose(@RequestBody DiagnoseRequest request) {
        return resumeDiagnosisService.diagnose(request);
    }

    @PostMapping("/diagnoses")
    public DiagnosisReport diagnoseAlias(@RequestBody DiagnoseRequest request) {
        return resumeDiagnosisService.diagnose(request);
    }

    @GetMapping("/diagnoses/{diagnosisId}")
    public DiagnosisReport getReport(@PathVariable String diagnosisId) {
        return resumeDiagnosisService.getReport(diagnosisId);
    }

    @PostMapping("/diagnoses/{diagnosisId}/chat")
    public DiagnosisChatResponse chat(@PathVariable String diagnosisId, @RequestBody DiagnosisChatRequest request) {
        return resumeDiagnosisService.chat(diagnosisId, request);
    }

    @PostMapping("/diagnoses/{diagnosisId}/rescore")
    public DiagnosisReport rescore(@PathVariable String diagnosisId) {
        DiagnosisReport previous = resumeDiagnosisService.getReport(diagnosisId);
        return resumeDiagnosisService.diagnose(new DiagnoseRequest(
                previous.resumeId(),
                previous.resumeName(),
                null,
                previous.diagnosisType(),
                previous.jobType(),
                previous.jobId(),
                null,
                "rescore-" + diagnosisId
        ));
    }
}
