package com.luz.aiagent.service.impl;

import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.ObjectUtil;
import com.luz.aiagent.Mapper.PositionUserMapper;
import com.luz.aiagent.Mapper.UserMapper;
import com.luz.aiagent.entity.PositionUser;
import com.luz.aiagent.service.UserService;
import com.luz.aiagent.utils.AuthContextHolder;
import com.luz.aiagent.utils.GQLDException;
import com.luz.aiagent.utils.ResultCodeEnum;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Date;

@Service
public class UserServiceImpl implements UserService {

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private PositionUserMapper positionUserMapper;

    /**
     * 岗位收藏
     */
    @Override
    public void favorite(Long positionId, Long status) {
        Long userId = AuthContextHolder.getUserId();
        if (ObjectUtil.isNull(userId)) {
            throw new GQLDException(ResultCodeEnum.NO_INFO_FOR_THIS_USER);
        }
        PositionUser positionUser = userMapper.findByUserPosition(positionId, userId);
        Date date = new Date();
        //查询岗位用户关联表数据
        if (ObjectUtil.isNull(positionUser)) {
            positionUser = new PositionUser();
            positionUser.setId(IdUtil.getSnowflakeNextId())
                    .setUserId(userId)
                    .setPositionId(positionId)
                    .setStatus(status)
                    .setFavoriteTime(date);
            userMapper.favorite(positionUser);
        } else {
            positionUser.setStatus(status)
                    .setUpdateTime(date);
            positionUserMapper.updateById(positionUser);
        }


    }
}
