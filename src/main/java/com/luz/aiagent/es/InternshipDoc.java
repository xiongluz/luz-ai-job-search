package com.luz.aiagent.es;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

/**
 * 实习数据的 ES 文档映射。
 */
@Data
@Document(indexName = "internship")
public class InternshipDoc {

    @Id
    private Long id;

    @Field(type = FieldType.Text)
    private String company;

    @Field(type = FieldType.Text)
    private String ndustryCategory;

    @Field(type = FieldType.Keyword)
    private String businessType;

    @Field(type = FieldType.Keyword)
    private String recruitmentBatch;

    @Field(type = FieldType.Text)
    private String position;

    @Field(type = FieldType.Keyword)
    private String city;

    @Field(type = FieldType.Text)
    private String recruitmentTarget;

    @Field(type = FieldType.Keyword)
    private String updateTime;

    @Field(type = FieldType.Keyword)
    private String deadline;

    @Field(type = FieldType.Keyword)
    private String status;

    @Field(type = FieldType.Text)
    private String officialAnnouncement;

    @Field(type = FieldType.Text)
    private String deliveryMethod;

    @Field(type = FieldType.Keyword)
    private String referralCode;

    @Field(type = FieldType.Text)
    private String note;
}
