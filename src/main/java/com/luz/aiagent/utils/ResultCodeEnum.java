package com.luz.aiagent.utils;

import lombok.Getter;

/**
 * 统一返回结果状态信息类
 */
@Getter
public enum ResultCodeEnum {

    SUCCESS(200, "成功"),
    FAIL(201, "失败"),
    NO_INFO_FOR_THIS_USER(202, "不存在此用户信息"),

    LOGIN_AUTH(401, "未登陆"),
    /**
     * 服务异常
     **/
    RC500(500, "系统异常，请稍后重试");

    private Integer code;

    private String message;

    private ResultCodeEnum(Integer code, String message) {
        this.code = code;
        this.message = message;
    }

}
