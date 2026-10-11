package com.luz.aiagent.utils;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Slf4j
public class PdfToStringUtil {

    public static String pdfToString(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择要上传的文档。");
        }
        String fileName = file.getOriginalFilename() == null ? "document" : file.getOriginalFilename();

        if (!List.of("pdf", "doc", "docx").contains(DocumentTextExtractor.extensionOf(fileName))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "仅支持 PDF、DOC、DOCX 文件。");
        }

        String text;
        try {
            text = DocumentTextExtractor.extract(file.getBytes(), fileName);
        } catch (Exception error) {
            log.warn("document parse failed: fileName={}, reason={}", fileName, error.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "文档解析失败，请确认文件不是扫描件或加密文件。", error);
        }
        String queryText = DocumentTextExtractor.normalizeText(text);
        if (!StringUtils.hasText(queryText)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "未从文档中解析到文本，请确认件不是扫描件。");
        }
        // 全文匹配字段截断到 2000 字符
        if (queryText.length() > 2000) {
            queryText = queryText.substring(0, 2000);
        }
        return queryText;
    }
}
