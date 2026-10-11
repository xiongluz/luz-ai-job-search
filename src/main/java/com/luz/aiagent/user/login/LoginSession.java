package com.luz.aiagent.user.login;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.Objects;

/**
 * 一次微信扫码登录的临时会话。
 *
 * <p>对象以 JSON 形式保存在 Redis 中，以 {@code scene} 作为关联浏览器、
 * 微信事件回调和 OAuth 回调的唯一键。会话由 Redis 过期时间自动失效。</p>
 *
 * <p>固定字段在构造时写入，后续从微信回调获得的身份和状态字段使用
 * {@code volatile} 保证轮询线程能够看到最新值；多个字段的成组更新则通过
 * {@code synchronized} 方法完成。</p>
 */
public class LoginSession {
    /** 带参数二维码场景值，也是内存会话 Map 的 key。 */
    private final String scene;

    /** 可选的前端 WebSocket 连接标识；当前轮询实现只保存、不主动推送。 */
    private final String socketId;

    /** 会话创建时间。 */
    private final Instant createdAt;

    /** 会话绝对过期时间。 */
    private final Instant expireAt;

    /** 微信公众号 openid，在扫码或关注事件到达后写入。 */
    private volatile String openid;

    /** 微信开放平台 unionid，微信未返回时可以为空。 */
    private volatile String unionid;

    /** openid 对应的本地用户 ID，完成用户查询或创建后写入。 */
    private volatile Long userId;

    /** 当前登录状态，供浏览器轮询。 */
    private volatile LoginStatus status;

    /** 最近一次身份、用户或状态变更的时间。 */
    private volatile Instant updatedAt;

    /**
     * 创建等待扫码的登录会话。
     *
     * @param scene   微信二维码场景值，不能为空
     * @param socketId 可选的前端连接标识
     * @param expireAt 会话过期时间，不能为空
     */
    public LoginSession(String scene, String socketId, Instant expireAt) {
        this(Objects.requireNonNull(scene, "scene must not be null"), socketId, Instant.now(),
                Objects.requireNonNull(expireAt, "expireAt must not be null"), null, null, null, LoginStatus.WAIT_SCAN, null);
        this.updatedAt = this.createdAt;
    }

    /**
     * 供 JSON 反序列化使用的全量构造器。
     *
     * <p>会话从 Redis 反序列化时需要用保存时的全部字段重建对象，因此这里显式接收
     * 创建时间与可变状态，避免丢失 {@code createdAt} 或已推进的登录状态。</p>
     */
    @JsonCreator
    private LoginSession(
            @JsonProperty("scene") String scene,
            @JsonProperty("socketId") String socketId,
            @JsonProperty("createdAt") Instant createdAt,
            @JsonProperty("expireAt") Instant expireAt,
            @JsonProperty("openid") String openid,
            @JsonProperty("unionid") String unionid,
            @JsonProperty("userId") Long userId,
            @JsonProperty("status") LoginStatus status,
            @JsonProperty("updatedAt") Instant updatedAt) {
        this.scene = scene;
        this.socketId = socketId;
        this.createdAt = createdAt;
        this.expireAt = expireAt;
        this.openid = openid;
        this.unionid = unionid;
        this.userId = userId;
        this.status = status;
        this.updatedAt = updatedAt;
    }

    /** @return 二维码场景值 */
    public String scene() {
        return scene;
    }

    /** @return 可选的前端连接标识 */
    public String socketId() {
        return socketId;
    }

    /** @return 会话创建时间 */
    public Instant createdAt() {
        return createdAt;
    }

    /** @return 会话过期时间 */
    public Instant expireAt() {
        return expireAt;
    }

    /** @return 当前会话绑定的公众号 openid，尚未扫码时为 null */
    public String openid() {
        return openid;
    }

    /** @return 当前会话绑定的 unionid，微信未返回时为 null */
    public String unionid() {
        return unionid;
    }

    /** @return 当前会话关联的本地用户 ID，尚未落用户数据时为 null */
    public Long userId() {
        return userId;
    }

    /** @return 当前登录状态 */
    public LoginStatus status() {
        return status;
    }

    /** @return 最近更新时间 */
    public Instant updatedAt() {
        return updatedAt;
    }

    /**
     * 将微信身份绑定到本次登录会话。
     *
     * @param openid 公众号用户唯一标识
     * @param unionid 开放平台统一标识，可以为空
     */
    public synchronized void bindWechatIdentity(String openid, String unionid) {
        this.openid = openid;
        this.unionid = unionid;
        this.updatedAt = Instant.now();
    }

    /**
     * 关联本地用户记录。
     *
     * @param userId 用户表主键
     */
    public synchronized void attachUser(Long userId) {
        this.userId = userId;
        this.updatedAt = Instant.now();
    }

    /**
     * 更新登录状态。
     *
     * @param status 新状态
     */
    public synchronized void markStatus(LoginStatus status) {
        this.status = status;
        this.updatedAt = Instant.now();
    }

    /**
     * 判断会话在指定时刻是否过期。
     *
     * @param now 用于比较的当前时间；为 null 时返回 false
     * @return 当前时间等于或晚于过期时间时返回 true
     */
    public boolean isExpired(Instant now) {
        return now != null && expireAt != null && !now.isBefore(expireAt);
    }
}
