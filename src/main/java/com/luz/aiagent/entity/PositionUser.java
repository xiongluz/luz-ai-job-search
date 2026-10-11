package com.luz.aiagent.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.experimental.Accessors;

import java.util.Date;

@Data
@Accessors(chain = true)
@Schema(description = "PositionUser")
@TableName("position_user")
public class PositionUser {

    @TableId(type = IdType.AUTO)
    private Long id;

    @Schema(description = "用户ID")
    @TableField("user_id")
    private Long userId;

    @Schema(description = "岗位ID")
    @TableField("position_id")
    private Long positionId;

    @Schema(description = "岗位收藏状态（0-未收藏，1-已收藏）")
    @TableField("status")
    private Long status;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField("favorite_time")
    private Date favoriteTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField("update_time")
    private Date updateTime;

}
