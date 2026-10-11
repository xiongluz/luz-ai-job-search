package com.luz.aiagent.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.ObjectUtil;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.luz.aiagent.Mapper.CampusRecruitmentMapper;
import com.luz.aiagent.Mapper.UserMapper;
import com.luz.aiagent.controller.EsController;
import com.luz.aiagent.entity.CampusRecruitment;
import com.luz.aiagent.es.CampusRecruitmentDoc;
import com.luz.aiagent.service.CampusRecruitmentService;
import com.luz.aiagent.utils.*;
import com.luz.aiagent.vo.CampusRecruitmentVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;


import java.util.List;

@Slf4j
@Service
public class CampusRecruitmentServiceImpl extends ServiceImpl<CampusRecruitmentMapper, CampusRecruitment> implements CampusRecruitmentService {

    @Autowired
    private CampusRecruitmentMapper campusRecruitmentMapper;

    @Autowired
    private EsController esController;

    @Autowired
    private ChatClient deepseekChatClient;

    @Autowired
    private UserMapper userMapper;

    /**
     * 查询校招数据
     */
    @Override
    public PageResult<CampusRecruitmentVO> findCampusRecruitment(String recruitmentTargetFarewell, String position, String city, String recruitmentTargetEducationBackground, String businessType, int page, int pageSize) {
        Long userId = AuthContextHolder.getUserId();
        if (ObjectUtil.isNull(userId)) {
            throw new GQLDException(ResultCodeEnum.NO_INFO_FOR_THIS_USER);
        }
        int offset = (page - 1) * pageSize;
        List<CampusRecruitment> campusRecruitmentList = campusRecruitmentMapper.findCampusRecruitment(recruitmentTargetFarewell, position, city, recruitmentTargetEducationBackground, businessType, offset, pageSize);
        if (campusRecruitmentList.isEmpty()) {
            log.info("暂无校招数据");
        }
        //根据条件，获取所有条数
        int count = campusRecruitmentMapper.getCount(recruitmentTargetFarewell, position, city, recruitmentTargetEducationBackground, businessType);

        List<CampusRecruitmentVO> campusRecruitmentVOList = campusRecruitmentList.stream().map(campusRecruitment -> {
            CampusRecruitmentVO campusRecruitmentVO = BeanUtil.copyProperties(campusRecruitment,
                    CampusRecruitmentVO.class);
            Long favoriteStatus = userMapper.getFavoriteStatus(campusRecruitment.getId(), userId);
            if (ObjectUtil.isNull(favoriteStatus)) {
                campusRecruitmentVO.setFavoriteStatus(Constant.UN_POSITION_FAVORITE);
            } else {
                campusRecruitmentVO.setFavoriteStatus(userMapper.getFavoriteStatus(campusRecruitment.getId(), userId));
            }

            return campusRecruitmentVO;
        }).toList();
        return PageResult.build(campusRecruitmentVOList, count, page, pageSize);

    }

    /**
     * 上传 PDF/DOC/DOCX，解析文本后在 ES 里全文匹配岗位
     */
    @Override
    public PageResult<CampusRecruitmentVO> searchByDocument(MultipartFile file, int page, int pageSize) {
        String queryText = PdfToStringUtil.pdfToString(file);
        return esController.searchCampusRecruitment(queryText, page, pageSize);
    }

    /**
     * 岗位匹配，AI打分
     */
    @Override
    public String aiJobMatch(MultipartFile file, String requirement) {
        String msg = PdfToStringUtil.pdfToString(file);
        return deepseekChatClient.prompt()
                .user("我的简历是，" + msg + "我的求职公司岗位是，" + requirement)
                .system("注意，只输出公司匹配分数，只输出公司匹配分数，你是一位专业的简历分析和岗位匹配专家，请分析简历内容并给出匹配度评估和改进建议。")
                .call()
                .content();
    }

}
