/**
 * 极简微信公众号扫码登录模块。
 *
 * <h2>职责划分</h2>
 * <ul>
 *     <li>{@link com.luz.aiagent.user.login.UserLoginController}：浏览器创建二维码、轮询状态和接收 OAuth 回调；</li>
 *     <li>{@link com.luz.aiagent.user.login.WechatCallbackController}：微信公众号服务器验证与事件接收；</li>
 *     <li>{@link com.luz.aiagent.user.login.UserLoginService}：串联二维码、事件、用户和 OAuth 状态；</li>
 *     <li>{@link com.luz.aiagent.user.login.LoginSessionStore}：在 Redis 中保存临时登录会话；</li>
 *     <li>{@link com.luz.aiagent.user.login.UserAccountRepository}：隔离用户数据存储方式，默认由 JDBC 实现写入 MySQL；</li>
 *     <li>{@link com.luz.aiagent.user.login.WechatApiClient}：调用微信二维码和网页授权 API。</li>
 * </ul>
 *
 * <h2>主流程</h2>
 * <ol>
 *     <li>前端调用 {@code GET /api/login/wechat/qrcode}，取得 scene 和二维码；</li>
 *     <li>用户扫码后，微信调用 {@code POST /api/wechat/callback} 并带回 openid 与 EventKey；</li>
 *     <li>服务通过 scene 找到内存会话，通过 openid 查询或创建用户；</li>
 *     <li>关注/扫码事件回复 OAuth 链接，用户在微信中点击并完成网页授权；</li>
 *     <li>微信调用 OAuth callback，服务补齐昵称头像并标记 SUCCESS；</li>
 *     <li>前端持续调用 status 接口；看到 SUCCESS 时后端建立浏览器 HttpSession，前端进入应用。</li>
 * </ol>
 *
 * <h2>当前边界</h2>
 * <p>二维码会话保存在 Redis，浏览器 HttpSession 仍保存在单进程内存中，用户资料默认
 * 保存到 MySQL {@code user} 表；微信回调仅支持明文模式。Java 服务重启后浏览器需要重新登录。</p>
 */
package com.luz.aiagent.user.login;
