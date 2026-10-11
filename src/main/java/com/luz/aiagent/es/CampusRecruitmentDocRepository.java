package com.luz.aiagent.es;

import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;

import java.util.List;

/**
 * 继承 ElasticsearchRepository 后，自动获得 save/saveAll/findById/findAll/deleteById 等 CRUD 能力。
 */
public interface CampusRecruitmentDocRepository extends ElasticsearchRepository<CampusRecruitmentDoc, Long> {

    // Spring Data 按方法名自动生成查询
    List<CampusRecruitmentDoc> findByCompanyContaining(String company);

    List<CampusRecruitmentDoc> findByCity(String city);

    List<CampusRecruitmentDoc> findByPositionContaining(String position);
}
