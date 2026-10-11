package com.luz.aiagent.excel;

import com.alibaba.excel.annotation.ExcelProperty;
import lombok.Data;

@Data
public class InternshipExcel {

    @ExcelProperty("公司名称")
    private String company;

    @ExcelProperty("行业大类")
    private String ndustryCategory;

    @ExcelProperty("企业性质")
    private String businessType;

    @ExcelProperty("批次")
    private String recruitmentBatch;

    @ExcelProperty("招聘岗位")
    private String position;

    @ExcelProperty("工作地点")
    private String city;

    @ExcelProperty("招聘对象")
    private String recruitmentTarget;

    @ExcelProperty("更新时间")
    private String updateTime;

    @ExcelProperty("截止时间")
    private String deadline;

    @ExcelProperty("网申状态")
    private String status;

    @ExcelProperty("官方公告")
    private String officialAnnouncement;

    @ExcelProperty("投递方式")
    private String deliveryMethod;

    @ExcelProperty("内推码")
    private String referralCode;

    @ExcelProperty("备注")
    private String note;

}
