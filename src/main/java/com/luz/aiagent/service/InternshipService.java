package com.luz.aiagent.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.luz.aiagent.entity.Internship;
import com.luz.aiagent.utils.PageResult;
import com.luz.aiagent.vo.InternshipVO;
import org.springframework.web.multipart.MultipartFile;

public interface InternshipService extends IService<Internship> {

    /**
     * 查询实习相关数据
     */
    PageResult<InternshipVO> findInternship(String recruitmentTargetFarewell, String position, String city, String recruitmentTargetEducationBackground, String businessType, int page, int pageSize);

    /**
     * 上传 PDF/DOC/DOCX，解析文本后在 ES 里全文匹配岗位
     */
    PageResult<InternshipVO> searchByDocument(MultipartFile file, int page, int pageSize);

    /**
     * 岗位匹配，AI打分
     */
    String aiJobMatch(MultipartFile file, String requirement);

}
