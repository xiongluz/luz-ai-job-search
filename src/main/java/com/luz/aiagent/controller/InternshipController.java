package com.luz.aiagent.controller;

import com.alibaba.excel.EasyExcel;
import com.luz.aiagent.LoginUtil.GQLDLogin;
import com.luz.aiagent.excel.InternshipExcel;
import com.luz.aiagent.listener.InternshipListener;
import com.luz.aiagent.service.InternshipService;
import com.luz.aiagent.utils.HyperlinkScanner;
import com.luz.aiagent.utils.PageResult;
import com.luz.aiagent.vo.InternshipVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Map;

@Slf4j
@Tag(name = "实习相关接口")
@RestController
@RequestMapping("/internship")
public class InternshipController {

    @Autowired
    private InternshipService internshipService;

    @Autowired
    private EsController esController;

    @GQLDLogin
    @Operation(summary = "查询实习相关数据")
    @GetMapping("/findInternship")
    public PageResult<InternshipVO> findInternship(
            @RequestParam(required = false) String recruitmentTargetFarewell,
            @RequestParam(required = false) String position,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String recruitmentTargetEducationBackground,
            @RequestParam(required = false) String businessType,
            @RequestParam int page,
            @RequestParam int pageSize) {
        return internshipService.findInternship(recruitmentTargetFarewell, position, city, recruitmentTargetEducationBackground, businessType, page, pageSize);
    }

    @Operation(summary = "数据批量导入")
    @PostMapping("/import")
    public String importExcel(@RequestParam("file") MultipartFile file) throws IOException {
        byte[] raw = file.getBytes();

        // 用 ZIP 直接解析原始文件拿超链接（原始 URL，不受 POI URI 校验影响）
        Map<String, Map<Integer, String>> hyperlinks = HyperlinkScanner.scanByHeader(raw, 0);

        // 修复 .rels 里的非法 URI 字符，让 EasyExcel 能打开文件读普通字段
        byte[] sanitized = HyperlinkScanner.sanitizeForPoi(raw);

        EasyExcel.read(new ByteArrayInputStream(sanitized), InternshipExcel.class,
                        new InternshipListener(internshipService, hyperlinks))
                .sheet(0)
                .doRead();
        esController.syncInternship();
        return "导入成功";
    }

    @Operation(summary = "数据批量删除")
    @DeleteMapping("/delete")
    public String deleteExcel() {
        boolean remove = internshipService.remove(null);
        if (!remove) {
            log.info("Mysql数据批量删除失败");
        }
        esController.deleteInternship();
        return "删除成功";
    }

    @GQLDLogin
    @Operation(summary = "上传 PDF/DOC/DOCX，解析文本后在 ES 里全文匹配岗位")
    @PostMapping("/searchByDocument")
    public PageResult<InternshipVO> searchByDocument(@RequestParam("file") MultipartFile file,
                                                      @RequestParam int page,
                                                      @RequestParam int pageSize) {
        return internshipService.searchByDocument(file, page, pageSize);
    }

    @Operation(summary = "岗位匹配，AI打分")
    @PostMapping("/aiJobMatch")
    public String aiJobMatch(@RequestParam("file") MultipartFile file,
                             @RequestParam String requirement) {
        return internshipService.aiJobMatch(file, requirement);
    }

}
