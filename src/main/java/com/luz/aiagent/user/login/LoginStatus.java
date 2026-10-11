package com.luz.aiagent.user.login;

/**
 * 微信扫码登录会话的状态。
 *
 * <p>状态保存在 {@link LoginSession} 中，由浏览器通过状态查询接口轮询。
 * 当前实现创建会话时直接进入 {@link #WAIT_SCAN}，OAuth 完成后直接进入
 * {@link #SUCCESS}，因此 {@link #INIT} 和 {@link #AUTHORIZED} 暂时是为后续
 * 更细粒度的状态流转预留的。</p>
 */
public enum LoginStatus {
    /** 会话刚初始化，尚未生成或返回二维码；当前实现暂不使用该中间态。 */
    INIT,

    /** 二维码已经生成，等待用户扫码。 */
    WAIT_SCAN,

    /** 已识别扫码用户，等待关注或网页授权。 */
    SCANNED,

    /** 已确认用户关注公众号，等待网页授权补充资料。 */
    SUBSCRIBED,

    /** 已取得网页授权资料；当前实现会立即继续进入 SUCCESS。 */
    AUTHORIZED,

    /** 用户资料已保存并完成登录。 */
    SUCCESS,

    /** 会话已经超过有效期，前端应重新申请二维码。 */
    EXPIRED,

    /** 请求参数或会话状态无效。 */
    INVALID
}
