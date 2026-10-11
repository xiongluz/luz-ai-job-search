package com.luz.aiagent.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.luz.aiagent.entity.CampusRecruitment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CampusRecruitmentMapper extends BaseMapper<CampusRecruitment> {

    List<CampusRecruitment> findCampusRecruitment(@Param("recruitmentTargetFarewell") String recruitmentTargetFarewell, @Param("position") String position, @Param("city") String city, @Param("recruitmentTargetEducationBackground") String recruitmentTargetEducationBackground, @Param("businessType") String businessType,@Param("offset") int offset,@Param("pageSize") int pageSize);

    int getCount(@Param("recruitmentTargetFarewell") String recruitmentTargetFarewell, @Param("position") String position, @Param("city") String city, @Param("recruitmentTargetEducationBackground") String recruitmentTargetEducationBackground, @Param("businessType") String businessType);

}
