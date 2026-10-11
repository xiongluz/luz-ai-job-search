package com.luz.aiagent.service;

import org.springframework.web.multipart.MultipartFile;

public interface OpenRecruitmentService {

    /**
     * 社招岗位智能匹配
     */
    String jobSmartMatching(MultipartFile file);

}
