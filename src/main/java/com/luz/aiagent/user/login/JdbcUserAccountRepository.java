package com.luz.aiagent.user.login;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

/**
 * 基于 Spring JDBC 的 MySQL 用户仓库。
 *
 * <p>表名 {@code user} 使用反引号包裹，避免与 MySQL 内置名称产生歧义。
 * {@link #save(UserAccount)} 以唯一键 openid 执行原子 upsert，因此微信重复推送
 * 同一个扫码/关注事件时不会创建重复用户。</p>
 *
 * <p>该实现默认启用。只有把 {@code user.repository.type} 设置为 memory 时，
 * Spring 才会改用 {@link InMemoryUserAccountRepository}。</p>
 */
@Repository
@ConditionalOnProperty(prefix = "user.repository", name = "type", havingValue = "jdbc", matchIfMissing = true)
public class JdbcUserAccountRepository implements UserAccountRepository {
    /** 查询用户所需的完整字段列表。 */
    private static final String USER_COLUMNS = """
            id, openid, unionid, nickname, avatar_url, subscribe,
            subscribe_time, last_login_time, status, created_at, updated_at
            """;

    /**
     * 根据 openid 新增或更新用户。
     *
     * <p>VALUES(column) 在 MySQL 8.0/8.4 中仍可用于 ON DUPLICATE KEY UPDATE。
     * 这里写入的是完整用户快照，空资料是否保留由 UserAccount.withProfile 预先决定。</p>
     */
    private static final String UPSERT_SQL = """
            INSERT INTO `user` (
                openid, unionid, nickname, avatar_url, subscribe,
                subscribe_time, last_login_time, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                unionid = VALUES(unionid),
                nickname = VALUES(nickname),
                avatar_url = VALUES(avatar_url),
                subscribe = VALUES(subscribe),
                subscribe_time = VALUES(subscribe_time),
                last_login_time = VALUES(last_login_time),
                status = VALUES(status)
            """;

    /** 将 JDBC ResultSet 转换成登录模块使用的不可变用户快照。 */
    private static final RowMapper<UserAccount> USER_ROW_MAPPER = JdbcUserAccountRepository::mapUser;

    /** Spring 提供的 JDBC 操作模板，连接池由 HikariCP 管理。 */
    private final JdbcTemplate jdbcTemplate;

    /**
     * 创建 MySQL 用户仓库。
     *
     * @param jdbcTemplate Spring 根据 datasource 配置创建的 JDBC 模板
     */
    public JdbcUserAccountRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** {@inheritDoc} */
    @Override
    public Optional<UserAccount> findById(Long id) {
        if (id == null) {
            return Optional.empty();
        }
        String sql = "SELECT " + USER_COLUMNS + " FROM `user` WHERE id = ? LIMIT 1";
        return jdbcTemplate.query(sql, USER_ROW_MAPPER, id).stream().findFirst();
    }

    /** {@inheritDoc} */
    @Override
    public Optional<UserAccount> findByOpenid(String openid) {
        if (!StringUtils.hasText(openid)) {
            return Optional.empty();
        }
        String sql = "SELECT " + USER_COLUMNS + " FROM `user` WHERE openid = ? LIMIT 1";
        return jdbcTemplate.query(sql, USER_ROW_MAPPER, openid.trim()).stream().findFirst();
    }

    /**
     * {@inheritDoc}
     *
     * <p>数据库依靠 uk_openid 判断新增还是更新。执行后重新查询数据库，确保返回
     * 自增 ID，以及由数据库生成的 created_at、updated_at。</p>
     */
    @Override
    public UserAccount save(UserAccount account) {
        if (account == null || !StringUtils.hasText(account.openid())) {
            throw new IllegalArgumentException("user account openid must not be blank");
        }

        String openid = account.openid().trim();
        jdbcTemplate.update(
                UPSERT_SQL,
                openid,
                nullIfBlank(account.unionid()),
                nullIfBlank(account.nickname()),
                nullIfBlank(account.avatarUrl()),
                account.subscribe() ? 1 : 0,
                toTimestamp(account.subscribeTime()),
                toTimestamp(account.lastLoginTime()),
                account.status()
        );

        return findByOpenid(openid)
                .orElseThrow(() -> new IllegalStateException("saved user could not be read back: " + openid));
    }

    /** 把数据库一行数据映射为 UserAccount。 */
    private static UserAccount mapUser(ResultSet resultSet, int rowNum) throws SQLException {
        return new UserAccount(
                resultSet.getLong("id"),
                resultSet.getString("openid"),
                resultSet.getString("unionid"),
                resultSet.getString("nickname"),
                resultSet.getString("avatar_url"),
                resultSet.getInt("subscribe") == 1,
                toInstant(resultSet.getTimestamp("subscribe_time")),
                toInstant(resultSet.getTimestamp("last_login_time")),
                resultSet.getInt("status"),
                toInstant(resultSet.getTimestamp("created_at")),
                toInstant(resultSet.getTimestamp("updated_at"))
        );
    }

    /** 将 Instant 转为 JDBC Timestamp；空时间保持 null。 */
    private static Timestamp toTimestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    /** 将 JDBC Timestamp 转为 Instant；数据库 NULL 保持 null。 */
    private static Instant toInstant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    /** 将空白微信资料统一存为数据库 NULL。 */
    private static String nullIfBlank(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
