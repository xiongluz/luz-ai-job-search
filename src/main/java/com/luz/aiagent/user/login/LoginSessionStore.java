package com.luz.aiagent.user.login;

import com.luz.aiagent.utils.Constant;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * 登录会话的 Redis 仓库。
 *
 * <p>使用 {@link RedisTemplate} 以 {@code session:<scene>} 为键保存 {@link LoginSession}，
 * 替代了简化方案中的进程内 {@link java.util.concurrent.ConcurrentHashMap}。会话通过
 * Redis 自身的过期时间自动失效，因此服务重启、扩容到多实例或请求被转发到另一实例时，
 * 登录会话仍可继续使用。</p>
 *
 * <p>会话对象在 Redis 与 JVM 之间以 JSON 形式往返，因此 {@link #findActive(String)}
 * 返回的是一份反序列化副本。对副本做的任何修改都必须再通过 {@link #save(LoginSession)}
 * 写回，否则不会影响 Redis 中的值。</p>
 */
@Component
public class LoginSessionStore {

    /** 字符串键、JSON 值的 Redis 客户端。 */
    private final RedisTemplate<String, Object> redisTemplate;

    public LoginSessionStore(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * 创建新的登录会话。
     *
     * <p>{@code scene} 使用去掉连字符的 UUID，既有足够随机性，也满足微信
     * {@code QR_STR_SCENE} 对字符串场景值的长度要求。</p>
     *
     * @param socketId 可选的前端连接标识
     * @param ttl 会话有效期；为空、零或负数时回退为 5 分钟
     * @return 已写入 Redis、状态为 WAIT_SCAN 的会话
     */
    public LoginSession create(String socketId, Duration ttl) {
        Duration safeTtl = ttl == null || ttl.isNegative() || ttl.isZero() ? Duration.ofMinutes(5) : ttl;
        String scene = UUID.randomUUID().toString().replace("-", "");
        LoginSession session = new LoginSession(scene, normalize(socketId), Instant.now().plus(safeTtl));
        redisTemplate.opsForValue().set(key(scene), session, safeTtl);
        return session;
    }

    /**
     * 查询仍然有效的登录会话。
     *
     * <p>过期由 Redis 的键超时自动处理，因此过期会话与不存在会话都会返回 empty。</p>
     *
     * @param scene 二维码场景值
     * @return 有效会话；参数为空或会话不存在时返回 empty
     */
    public Optional<LoginSession> findActive(String scene) {
        if (!StringUtils.hasText(scene)) {
            return Optional.empty();
        }
        Object value = redisTemplate.opsForValue().get(key(scene));
        return value instanceof LoginSession ? Optional.of((LoginSession) value) : Optional.empty();
    }

    /**
     * 把会话写回 Redis。
     *
     * <p>{@link #findActive(String)} 返回的是反序列化副本，调用方修改副本后必须调用
     * 本方法持久化。写回时按剩余有效时间重新设置过期，已过期则直接删除。</p>
     *
     * @param session 需要持久化的会话；为空或 scene 为空时不处理
     */
    public void save(LoginSession session) {
        if (session == null || !StringUtils.hasText(session.scene())) {
            return;
        }
        String key = key(session.scene());
        Duration remaining = Duration.between(Instant.now(), session.expireAt());
        if (remaining.isNegative() || remaining.isZero()) {
            redisTemplate.delete(key);
        } else {
            redisTemplate.opsForValue().set(key, session, remaining);
        }
    }

    /**
     * 主动移除一个登录会话，可用于登录完成后的延迟清理或主动失效。
     *
     * @param scene 二维码场景值
     */
    public void remove(String scene) {
        if (StringUtils.hasText(scene)) {
            redisTemplate.delete(key(scene));
        }
    }

    /** 组合会话键：{@code session:<scene>}。 */
    private String key(String scene) {
        return Constant.WX_SESSION + scene;
    }

    /** 将可选字符串去除首尾空白，并把空字符串统一为 null。 */
    private String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
