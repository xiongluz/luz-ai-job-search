package com.luz.aiagent.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.luz.aiagent.entity.CampusRecruitment;
import com.luz.aiagent.utils.PageResult;
import com.luz.aiagent.vo.CampusRecruitmentVO;
import org.springframework.web.multipart.MultipartFile;


public interface CampusRecruitmentService extends IService<CampusRecruitment> {
    /**
     * 查询校招数据
     */
    PageResult<CampusRecruitmentVO> findCampusRecruitment(String recruitmentTargetFarewell, String position, String city, String recruitmentTargetEducationBackground, String businessType, int page, int pageSize);

    /**
     * 上传 PDF/DOC/DOCX，解析文本后在 ES 里全文匹配岗位
     */
    PageResult<CampusRecruitmentVO> searchByDocument(MultipartFile file, int page, int pageSize);

    /**
     * 岗位匹配，AI打分
     */
    String aiJobMatch(MultipartFile file, String requirement);

}
