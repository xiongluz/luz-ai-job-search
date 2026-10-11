package com.luz.aiagent.user.login;

import lombok.Data;

import java.time.Instant;

/**
 * 微信登录模块对外传输对象的集中定义。
 *
 * <p>使用 Java record 保证对象只承载数据，不混入业务逻辑。浏览器接口响应、
 * 微信 XML 解析结果和 OAuth 回调响应都统一放在这里，便于查看接口契约。</p>
 */
@Data
public final class UserLoginDtos {
    /** 工具类只提供嵌套 DTO，不允许实例化。 */
    private UserLoginDtos() {
    }

    /**
     * 创建微信登录二维码接口的响应。
     *
     * @param scene 本次登录会话的场景值，后续轮询和 OAuth state 都使用它
     * @param qrcodeContent 前端用于展示二维码的统一内容；配置微信凭证后为二维码图片地址，未配置时为占位协议内容
     * @param qrcodeImageUrl 微信返回的可直接放入 img 标签的二维码地址；未配置微信时为空
     * @param status 初始登录状态，当前固定为 WAIT_SCAN
     * @param expireAt 本地登录会话过期时间
     * @param message 当前结果说明
     * @param socketId 前端传入的可选连接标识
     */
    public record CreateLoginQrcodeResponse(
            String scene,
            String qrcodeContent,
            String qrcodeImageUrl,
            LoginStatus status,
            Instant expireAt,
            String message,
            String socketId
    ) {
    }

    /**
     * 微信网页授权地址接口的响应。
     *
     *
     * <p>授权地址只能在微信客户端内打开。{@code scene} 会作为 OAuth 的
     * {@code state} 原样带回，服务端据此找回当前扫码会话。</p>
     *
     * @param scene 当前登录会话的场景值
     * @param authorizeUrl 微信网页授权地址
     * @param expireAt 当前登录会话过期时间
     * @param message 结果说明
     */
    public record OAuthAuthorizeUrlResponse(
            String scene,
            String authorizeUrl,
            Instant expireAt,
            String message
    ) {
    }

    /**
     * 浏览器轮询登录状态接口的响应。
     *
     * @param scene 当前场景值
     * @param status 当前登录状态
     * @param userId 已关联的本地用户 ID，尚未识别用户时为空
     * @param openid 已识别的公众号 openid，尚未扫码时为空
     * @param unionid 微信未提供或账号未绑定开放平台时为空
     * @param nickname OAuth 尚未完成时通常为空
     * @param avatarUrl OAuth 尚未完成时通常为空
     * @param subscribe 当前记录的关注状态
     * @param expireAt 本地登录会话过期时间；会话已被清理时为空
     * @param message 面向前端的状态说明
     */
    public record LoginStatusResponse(
            String scene,
            LoginStatus status,
            Long userId,
            String openid,
            String unionid,
            String nickname,
            String avatarUrl,
            boolean subscribe,
            Instant expireAt,
            String message
    ) {
    }

    /**
     * 浏览器应用会话查询响应。
     *
     * <p>二维码登录成功后，桌面浏览器在轮询接口中建立 HttpSession。页面刷新时
     * 使用该响应恢复登录状态，不依赖可伪造的前端本地登录标记。</p>
     *
     * @param authenticated 当前浏览器会话是否已经登录
     * @param userId 本地用户 ID，未登录时为空
     * @param openid 当前公众号下的用户标识，未登录时为空
     * @param unionid 可选的微信统一用户标识
     * @param nickname 微信昵称
     * @param avatarUrl 微信头像地址
     * @param subscribe 当前是否关注公众号
     */
    public record CurrentUserResponse(
            boolean authenticated,
            Long userId,
            String openid,
            String unionid,
            String nickname,
            String avatarUrl,
            boolean subscribe
    ) {
        /** @return 未登录浏览器使用的统一空响应 */
        public static CurrentUserResponse anonymous() {
            return new CurrentUserResponse(false, null, null, null, null, null, false);
        }

        /** @return 根据有效用户记录构造的已登录响应 */
        public static CurrentUserResponse authenticated(UserAccount account) {
            return new CurrentUserResponse(
                    true,
                    account.id(),
                    account.openid(),
                    account.unionid(),
                    account.nickname(),
                    account.avatarUrl(),
                    account.subscribe()
            );
        }
    }

    /**
     * 微信事件回调 XML 解析后的内部请求对象。
     *
     * @param messageType 微信消息类型，事件消息通常为 event
     * @param event 事件名，例如 subscribe、SCAN、unsubscribe
     * @param openid XML 的 FromUserName，即公众号用户 openid
     * @param scene 从 EventKey 中标准化出的二维码场景值
     * @param rawEventKey 微信原始 EventKey；新关注扫码通常带 qrscene_ 前缀
     * @param unionid 可选 unionid；普通事件推送通常不包含
     * @param nickname 可选昵称；普通事件推送通常不包含
     * @param avatarUrl 可选头像；普通事件推送通常不包含
     * @param eventTime 由 CreateTime 秒级时间戳转换出的事件时间
     * @param toUserName 微信推送中的公众号原始 ID，用于构造回复消息
     */
    public record WechatLoginEventRequest(
            String messageType,
            String event,
            String openid,
            String scene,
            String rawEventKey,
            String unionid,
            String nickname,
            String avatarUrl,
            Instant eventTime,
            String toUserName
    ) {
        /**
         * 兼容只关心事件字段的旧调用方；没有提供公众号原始 ID 时不生成回复消息。
         */
        public WechatLoginEventRequest(
                String messageType,
                String event,
                String openid,
                String scene,
                String rawEventKey,
                String unionid,
                String nickname,
                String avatarUrl,
                Instant eventTime
        ) {
            this(messageType, event, openid, scene, rawEventKey, unionid, nickname, avatarUrl, eventTime, "");
        }
    }

    /**
     * 网页 OAuth 回调完成后的响应。
     *
     * @param scene 完成本次登录的场景值
     * @param status 成功时为 SUCCESS
     * @param userId 本地用户 ID
     * @param openid 微信公众号 openid
     * @param nickname OAuth 获取到的昵称
     * @param avatarUrl OAuth 获取到的头像地址
     * @param redirectUrl 配置的前端登录完成地址；当前控制器只返回该值，不主动重定向
     * @param message 结果说明
     */
    public record OAuthCallbackResponse(
            String scene,
            LoginStatus status,
            Long userId,
            String openid,
            String nickname,
            String avatarUrl,
            String redirectUrl,
            String message
    ) {
    }

    /**
     * 微信服务器接入校验参数模型。
     *
     * <p>当前控制器直接使用独立的 RequestParam，因此该 record 暂未被调用，
     * 保留它用于后续统一参数绑定或测试构造。</p>
     *
     * @param signature 微信签名
     * @param timestamp 微信时间戳字符串
     * @param nonce 微信随机字符串
     * @param echostr 首次接入验证时需要原样返回的随机字符串
     */
    public record WechatSignatureQuery(
            String signature,
            String timestamp,
            String nonce,
            String echostr
    ) {
    }
}
