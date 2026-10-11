package com.luz.aiagent.listener;

import com.alibaba.excel.context.AnalysisContext;
import com.alibaba.excel.read.listener.ReadListener;
import com.luz.aiagent.entity.Internship;
import com.luz.aiagent.excel.InternshipExcel;
import com.luz.aiagent.service.InternshipService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
public class InternshipListener implements ReadListener<InternshipExcel> {

    private static final int BATCH_SIZE = 500;
    private static final String COL_ANNOUNCEMENT = "官方公告";
    private static final String COL_DELIVERY = "投递方式";

    private final List<Internship> cache = new ArrayList<>(BATCH_SIZE);
    private final InternshipService service;
    private final Map<String, Map<Integer, String>> hyperlinks;
    private int total = 0;

    public InternshipListener(InternshipService service,
                              Map<String, Map<Integer, String>> hyperlinks) {
        this.service = service;
        this.hyperlinks = hyperlinks;
    }

    @Override
    public void invoke(InternshipExcel data, AnalysisContext context) {
        Internship entity = new Internship();
        BeanUtils.copyProperties(data, entity);

        Integer rowIndex = context.readRowHolder().getRowIndex();

        // 扫描到才覆盖，否则保留 Excel 单元格里的文本，避免把值冲成 null。
        String announcement = pick(COL_ANNOUNCEMENT, rowIndex);
        if (announcement != null) {
            entity.setOfficialAnnouncement(announcement);
        }
        String delivery = pick(COL_DELIVERY, rowIndex);
        if (delivery != null) {
            entity.setDeliveryMethod(delivery);
        }

        cache.add(entity);
        total++;
        if (cache.size() >= BATCH_SIZE) {
            saveBatch();
        }
    }

    @Override
    public void doAfterAllAnalysed(AnalysisContext context) {
        saveBatch();
        log.info("导入完成，共 {} 条", total);
    }

    private String pick(String headerName, Integer rowIndex) {
        Map<Integer, String> byRow = hyperlinks.get(headerName);
        return byRow != null ? byRow.get(rowIndex) : null;
    }

    private void saveBatch() {
        if (cache.isEmpty()) {
            return;
        }
        service.saveBatch(cache);
        cache.clear();
    }
}
