package com.luz.aiagent.user.login;

import com.fasterxml.jackson.annotation.JsonTypeInfo;

import java.time.Instant;

/**
 * 登录模块使用的用户领域对象，与 MySQL {@code user} 表字段一一对应。
 *
 * <p>使用不可变 record 表达用户快照。任何资料、关注状态或登录时间变更都会返回
 * 一个新对象，再由 {@link UserAccountRepository#save(UserAccount)} 持久化。</p>
 *
 * @param id 用户表主键，新用户保存前可以为 null
 * @param openid 单公众号下的微信用户唯一标识
 * @param unionid 微信开放平台统一用户标识，可以为空
 * @param nickname 微信昵称，可以为空
 * @param avatarUrl 微信头像地址，可以为空
 * @param subscribe 当前是否关注公众号
 * @param subscribeTime 首次记录关注的时间
 * @param lastLoginTime 最后一次登录成功时间
 * @param status 本地账号状态，1 正常、0 禁用
 * @param createdAt 创建时间
 * @param updatedAt 最近更新时间
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.CLASS, include = JsonTypeInfo.As.PROPERTY, property = "@class")
public record UserAccount(
        Long id,
        String openid,
        String unionid,
        String nickname,
        String avatarUrl,
        boolean subscribe,
        Instant subscribeTime,
        Instant lastLoginTime,
        int status,
        Instant createdAt,
        Instant updatedAt
) {
    /**
     * 为首次保存的用户快照补上仓库生成的主键。
     *
     * @param newId 新主键
     * @return 仅 ID 改变的新用户快照
     */
    public UserAccount withId(Long newId) {
        return new UserAccount(newId, openid, unionid, nickname, avatarUrl, subscribe, subscribeTime, lastLoginTime, status, createdAt, updatedAt);
    }

    /**
     * 合并微信用户资料。
     *
     * <p>微信本次没有返回的空字段不会覆盖已有资料，避免一次信息不完整的
     * 事件回调把昵称、头像或 unionid 清空。</p>
     *
     * @param newUnionid 新 unionid，可以为空
     * @param newNickname 新昵称，可以为空
     * @param newAvatarUrl 新头像，可以为空
     * @param now 本次更新时间
     * @return 合并资料后的新用户快照
     */
    public UserAccount withProfile(String newUnionid, String newNickname, String newAvatarUrl, Instant now) {
        return new UserAccount(id,
                openid,
                hasText(newUnionid) ? newUnionid : unionid,
                hasText(newNickname) ? newNickname : nickname,
                hasText(newAvatarUrl) ? newAvatarUrl : avatarUrl,
                subscribe,
                subscribeTime,
                lastLoginTime,
                status,
                createdAt,
                now);
    }

    /**
     * 标记用户已关注公众号。
     *
     * <p>只在首次关注时写入 subscribeTime，后续重复扫码不会覆盖原关注时间。</p>
     *
     * @param now 关注事件时间
     * @return 已关注的新用户快照
     */
    public UserAccount markSubscribed(Instant now) {
        return new UserAccount(id,
                openid,
                unionid,
                nickname,
                avatarUrl,
                true,
                subscribeTime == null ? now : subscribeTime,
                lastLoginTime,
                status,
                createdAt,
                now);
    }

    /**
     * 标记用户已取消关注；保留历史 subscribeTime。
     *
     * @param now 取消关注事件时间
     * @return 未关注的新用户快照
     */
    public UserAccount markUnsubscribed(Instant now) {
        return new UserAccount(id, openid, unionid, nickname, avatarUrl, false, subscribeTime, lastLoginTime, status, createdAt, now);
    }

    /**
     * 记录一次成功登录。
     *
     * @param now 登录成功时间
     * @return 更新 lastLoginTime 的新用户快照
     */
    public UserAccount markLogin(Instant now) {
        return new UserAccount(id,
                openid,
                unionid,
                nickname,
                avatarUrl,
                subscribe,
                subscribeTime,
                now,
                status,
                createdAt,
                now);
    }

    /** 判断字符串是否包含非空白字符。 */
    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
