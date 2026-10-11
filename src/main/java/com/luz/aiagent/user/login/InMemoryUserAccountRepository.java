package com.luz.aiagent.user.login;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * {@link UserAccountRepository} 的临时内存实现。
 *
 * <p>该实现用于在数据库访问层尚未接入时调通微信登录流程，数据不会写入 MySQL，
 * 服务重启后全部丢失。只有显式配置 {@code user.repository.type=memory} 时才会启用。</p>
 *
 * <p>主 Map 按用户 ID 保存完整快照，openid 索引 Map 保存 openid 到用户 ID 的映射。
 * save 使用 synchronized 保证生成 ID、写主 Map 和写索引三个动作串行完成。</p>
 */
@Repository
@ConditionalOnProperty(prefix = "user.repository", name = "type", havingValue = "memory")
public class InMemoryUserAccountRepository implements UserAccountRepository {
    /** 模拟数据库自增主键，从 1001 开始。 */
    private final AtomicLong sequence = new AtomicLong(1000);

    /** 用户 ID 到完整用户快照的主存储。 */
    private final ConcurrentHashMap<Long, UserAccount> usersById = new ConcurrentHashMap<>();

    /** openid 到用户 ID 的唯一索引。 */
    private final ConcurrentHashMap<String, Long> openidIndex = new ConcurrentHashMap<>();

    /** {@inheritDoc} */
    @Override
    public Optional<UserAccount> findById(Long id) {
        if (id == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(usersById.get(id));
    }

    /** {@inheritDoc} */
    @Override
    public Optional<UserAccount> findByOpenid(String openid) {
        if (!StringUtils.hasText(openid)) {
            return Optional.empty();
        }
        Long id = openidIndex.get(openid);
        if (id == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(usersById.get(id));
    }

    /**
     * {@inheritDoc}
     *
     * <p>ID 为空时模拟数据库生成自增主键；ID 已存在时覆盖保存对应用户快照。</p>
     */
    @Override
    public synchronized UserAccount save(UserAccount account) {
        if (account == null || !StringUtils.hasText(account.openid())) {
            throw new IllegalArgumentException("user account openid must not be blank");
        }
        Long id = account.id() == null ? sequence.incrementAndGet() : account.id();
        UserAccount stored = account.id() == null ? account.withId(id) : account;
        usersById.put(id, stored);
        openidIndex.put(stored.openid(), id);
        return stored;
    }
}
