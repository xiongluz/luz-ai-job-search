package com.luz.aiagent.service.impl;

import com.luz.aiagent.service.OpenRecruitmentService;
import com.luz.aiagent.utils.PdfToStringUtil;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class OpenRecruitmentServiceImpl implements OpenRecruitmentService {

    @Autowired
    private ChatClient deepseekChatClient;

    /**
     * 社招岗位智能匹配
     */
    @Override
    public String jobSmartMatching(MultipartFile file) {
        String msg = PdfToStringUtil.pdfToString(file);
        return deepseekChatClient.prompt()
                .user("我的简历是，" + msg)
                .system("只输出【公司名称、岗位信息、投递链接】3项内容。投递链接必须是企业官方招聘渠道，禁止第三方招聘平台链接。岗位信息写核心工作职责。找不到带官方投递入口的在招岗位，就列出当地相关行业头部公司。不要任何额外文字。")
                .call()
                .content();

    }
}
