package com.luz.aiagent.controller;

import com.luz.aiagent.service.OpenRecruitmentService;
import com.luz.aiagent.utils.Result;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Tag(name = "社招相关接口")
@RestController
@RequestMapping("/openRecruitment")
public class OpenRecruitmentController {

    @Autowired
    private OpenRecruitmentService openRecruitmentService;

    @Operation(summary = "社招岗位智能匹配")
    @PostMapping("/jobSmartMatching")
    public Result<String> jobSmartMatching(@RequestParam("file") MultipartFile file) {
        return Result.ok(openRecruitmentService.jobSmartMatching(file));
    }


}
