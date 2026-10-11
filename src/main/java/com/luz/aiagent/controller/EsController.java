package com.luz.aiagent.controller;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.ObjectUtil;
import com.luz.aiagent.Mapper.CampusRecruitmentMapper;
import com.luz.aiagent.Mapper.InternshipMapper;
import com.luz.aiagent.Mapper.UserMapper;
import com.luz.aiagent.entity.CampusRecruitment;
import com.luz.aiagent.entity.Internship;
import com.luz.aiagent.es.CampusRecruitmentDoc;
import com.luz.aiagent.es.CampusRecruitmentDocRepository;
import com.luz.aiagent.es.InternshipDoc;
import com.luz.aiagent.es.InternshipDocRepository;
import com.luz.aiagent.utils.AuthContextHolder;
import com.luz.aiagent.utils.Constant;
import com.luz.aiagent.utils.PageResult;
import com.luz.aiagent.vo.CampusRecruitmentVO;
import com.luz.aiagent.vo.InternshipVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.elasticsearch.client.elc.NativeQuery;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.SearchHit;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 把校招数据写入 / 查询 Elasticsearch。
 */
@Slf4j
@Tag(name = "ES 相关接口")
@RestController
@RequestMapping("/es")
public class EsController {

    @Autowired
    private UserMapper userMapper;

    private final CampusRecruitmentDocRepository campusRecruitmentDocRepository;
    private final CampusRecruitmentMapper campusRecruitmentMapper;
    private final ElasticsearchOperations operations;
    private final InternshipMapper internshipMapper;
    private final InternshipDocRepository internshipDocRepository;


    public EsController(CampusRecruitmentDocRepository campusRecruitmentDocRepository,
                        CampusRecruitmentMapper campusRecruitmentMapper,
                        ElasticsearchOperations operations,
                        InternshipMapper internshipMapper,
                        InternshipDocRepository internshipDocRepository) {
        this.campusRecruitmentDocRepository = campusRecruitmentDocRepository;
        this.campusRecruitmentMapper = campusRecruitmentMapper;
        this.operations = operations;
        this.internshipMapper = internshipMapper;
        this.internshipDocRepository = internshipDocRepository;
    }

    @Operation(summary = "把 MySQL 里的校招数据全量同步到 ES")
    @PostMapping("/syncCampusRecruitment")
    public String syncCampusRecruitment() {
        List<CampusRecruitment> list = campusRecruitmentMapper.selectList(null);
        List<CampusRecruitmentDoc> docs = list.stream().map(e -> {
            CampusRecruitmentDoc d = new CampusRecruitmentDoc();
            BeanUtils.copyProperties(e, d);
            return d;
        }).toList();
        campusRecruitmentDocRepository.saveAll(docs);
        log.info("校招数据同步到 ES 完成，共 {} 条", docs.size());
        return "同步 " + docs.size() + " 条";
    }

    @Operation(summary = "校招数据-关键词全文搜索（招聘对象/招聘岗位/工作地点/批次/企业性质）")
    @GetMapping("/searchCampusRecruitment")
    public PageResult<CampusRecruitmentVO> searchCampusRecruitment(@RequestParam String keyword,
                                                                   @RequestParam int page,
                                                                   @RequestParam int pageSize) {
        Pageable pageable = PageRequest.of(page - 1, pageSize);
        NativeQuery query = NativeQuery.builder()
                .withQuery(q -> q.multiMatch(mm -> mm
                        .fields("ndustryCategory", "recruitmentTarget", "position", "city")
                        .query(keyword)))
                .withPageable(pageable)
                .build();

        SearchHits<CampusRecruitmentDoc> search = operations.search(query, CampusRecruitmentDoc.class);
        List<CampusRecruitmentDoc> list = search.stream()
                .map(SearchHit::getContent)
                .toList();

        long totalHits = search.getTotalHits();

        Long userId = AuthContextHolder.getUserId();
        List<CampusRecruitmentVO> campusRecruitmentVOList = list.stream().map(campusRecruitment -> {
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

        return PageResult.build(campusRecruitmentVOList, totalHits, page, pageSize);
    }

    @Operation(summary = "统计校招总数量")
    @GetMapping("/countCampusRecruitmentALL")
    public long countCampusRecruitmentALL() {
        return campusRecruitmentDocRepository.count();
    }

    @Operation(summary = "更新需要-删除ES存量校招数据")
    @DeleteMapping("/deleteCampusRecruitment")
    public void deleteCampusRecruitment() {
        campusRecruitmentDocRepository.deleteAll();
    }

    @Operation(summary = "把 MySQL 里的实习数据全量同步到 ES")
    @PostMapping("/syncInternship")
    public String syncInternship() {
        List<Internship> list = internshipMapper.selectList(null);
        List<InternshipDoc> docs = list.stream().map(e -> {
            InternshipDoc d = new InternshipDoc();
            BeanUtils.copyProperties(e, d);
            return d;
        }).toList();
        internshipDocRepository.saveAll(docs);
        log.info("实习数据同步到 ES 完成，共 {} 条", docs.size());
        return "同步 " + docs.size() + " 条";
    }

    @Operation(summary = "更新需要-删除ES存量实习数据")
    @DeleteMapping("/deleteInternship")
    public void deleteInternship() {
        internshipDocRepository.deleteAll();
    }

    @Operation(summary = "实习数据-关键词全文搜索（招聘对象/招聘岗位/工作地点/批次/企业性质）")
    @GetMapping("/searchInternship")
    public PageResult<InternshipVO> searchInternship(@RequestParam String keyword,
                                                     @RequestParam int page,      // 页码，从 0 开始，前端是从1开始，减一
                                                     @RequestParam int pageSize) {

        Pageable pageable = PageRequest.of(page - 1, pageSize);
        NativeQuery query = NativeQuery.builder()
                .withQuery(q -> q.multiMatch(mm -> mm
                        .fields("ndustryCategory", "recruitmentTarget", "position", "city")
                        .query(keyword)))
                .withPageable(pageable)
                .build();

        SearchHits<InternshipDoc> search = operations.search(query, InternshipDoc.class);
        List<InternshipDoc> list = search.stream()
                .map(SearchHit::getContent)
                .toList();

        long totalHits = search.getTotalHits();

        Long userId = AuthContextHolder.getUserId();
        List<InternshipVO> internshipVOList = list.stream().map(internship -> {
            InternshipVO internshipVO = BeanUtil.copyProperties(internship, InternshipVO.class);
            Long favoriteStatus = userMapper.getFavoriteStatus(internship.getId(), userId);
            if (ObjectUtil.isNull(favoriteStatus)) {
                internshipVO.setFavoriteStatus(Constant.UN_POSITION_FAVORITE);
            } else {
                internshipVO.setFavoriteStatus(userMapper.getFavoriteStatus(internship.getId(), userId));
            }

            return internshipVO;
        }).toList();

        return PageResult.build(internshipVOList, totalHits, page, pageSize);
    }

    @Operation(summary = "统计校招总数量")
    @GetMapping("/countInternshipALL")
    public long countInternshipALL() {
        return internshipDocRepository.count();
    }


}
