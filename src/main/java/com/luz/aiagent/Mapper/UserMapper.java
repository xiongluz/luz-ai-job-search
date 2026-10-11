package com.luz.aiagent.Mapper;

import com.luz.aiagent.entity.PositionUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;


@Mapper
public interface UserMapper {

    /**
     * 岗位收藏
     */
    void favorite(@Param("positionUser") PositionUser positionUser);

    /**
     * 岗位ID查状态
     */
    Long getFavoriteStatus(@Param("positionId") Long positionId, @Param("userId") Long userId);

    /**
     * 查询岗位用户关联表数据
     */
    PositionUser findByUserPosition(@Param("positionId") Long positionId, @Param("userId") Long userId);

}
