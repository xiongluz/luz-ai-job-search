package com.luz.aiagent.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;


@Data
@Schema(description = "CampusRecruitment")
@TableName("campus_recruitment")
public class CampusRecruitment {

    @TableId(type = IdType.AUTO)
    private Long id;

    @Schema(description = "公司名称")
    @TableField("company")
    private String company;

    @Schema(description = "行业大类")
    @TableField("ndustry_category")
    private String ndustryCategory;

    @Schema(description = "企业性质")
    @TableField("business_type")
    private String businessType;

    @Schema(description = "批次")
    @TableField("recruitment_batch")
    private String recruitmentBatch;

    @Schema(description = "招聘岗位")
    @TableField("position")
    private String position;

    @Schema(description = "工作地点")
    @TableField("city")
    private String city;

    @Schema(description = "招聘对象")
    @TableField("recruitment_target")
    private String recruitmentTarget;

    @Schema(description = "更新时间")
    @TableField("update_time")
    private String updateTime;

    @Schema(description = "截止时间")
    @TableField("deadline")
    private String deadline;

    @Schema(description = "网申状态")
    @TableField("status")
    private String status;

    @Schema(description = "官方公告")
    @TableField("official_announcement")
    private String officialAnnouncement;

    @Schema(description = "投递方式")
    @TableField("delivery_method")
    private String deliveryMethod;

    @Schema(description = "内推码")
    @TableField("referral_code")
    private String referralCode;

    @Schema(description = "备注")
    @TableField("note")
    private String note;
}
