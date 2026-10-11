package com.luz.aiagent.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.ObjectUtil;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.luz.aiagent.Mapper.InternshipMapper;
import com.luz.aiagent.Mapper.UserMapper;
import com.luz.aiagent.controller.EsController;
import com.luz.aiagent.entity.Internship;
import com.luz.aiagent.service.InternshipService;
import com.luz.aiagent.utils.AuthContextHolder;
import com.luz.aiagent.utils.Constant;
import com.luz.aiagent.utils.PageResult;
import com.luz.aiagent.utils.PdfToStringUtil;
import com.luz.aiagent.vo.InternshipVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Slf4j
@Service
public class InternshipServiceImpl extends ServiceImpl<InternshipMapper, Internship> implements InternshipService {

    @Autowired
    private InternshipMapper internshipMapper;

    @Autowired
    private EsController esController;

    @Autowired
    private ChatClient deepseekChatClient;

    @Autowired
    private UserMapper userMapper;

    /**
     * 查询实习相关数据
     */
    @Override
    public PageResult<InternshipVO> findInternship(String recruitmentTargetFarewell, String position, String city, String recruitmentTargetEducationBackground, String businessType, int page, int pageSize) {
        int offset = (page - 1) * pageSize;
        List<Internship> internshipList = internshipMapper.findInternship(recruitmentTargetFarewell, position, city, recruitmentTargetEducationBackground, businessType, offset, pageSize);
        if (internshipList.isEmpty()) {
            log.info("暂无实习数据");
        }
        //根据条件，获取所有条数
        int count = internshipMapper.getCount(recruitmentTargetFarewell, position, city, recruitmentTargetEducationBackground, businessType);

        Long userId = AuthContextHolder.getUserId();
        List<InternshipVO> internshipVOList = internshipList.stream().map(internship -> {
            InternshipVO internshipVO = BeanUtil.copyProperties(internship, InternshipVO.class);
            Long favoriteStatus = userMapper.getFavoriteStatus(internship.getId(), userId);
            if (ObjectUtil.isNull(favoriteStatus)) {
                internshipVO.setFavoriteStatus(Constant.UN_POSITION_FAVORITE);
            } else {
                internshipVO.setFavoriteStatus(userMapper.getFavoriteStatus(internship.getId(), userId));
            }

            return internshipVO;
        }).toList();

        return PageResult.build(internshipVOList, count, page, pageSize);
    }

    /**
     * 上传 PDF/DOC/DOCX，解析文本后在 ES 里全文匹配岗位
     */
    @Override
    public PageResult<InternshipVO> searchByDocument(MultipartFile file, int page, int pageSize) {
        String queryText = PdfToStringUtil.pdfToString(file);
        return esController.searchInternship(queryText, page, pageSize);
    }

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
