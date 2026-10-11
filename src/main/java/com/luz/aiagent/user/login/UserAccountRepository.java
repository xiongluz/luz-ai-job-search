package com.luz.aiagent.user.login;

import java.util.Optional;

/**
 * 用户数据访问抽象。
 *
 * <p>登录业务只依赖该接口，不关心数据存放在内存还是 MySQL。默认注入
 * {@link JdbcUserAccountRepository} 并访问 MySQL {@code user} 表；仅在显式启用
 * memory 类型时使用 {@link InMemoryUserAccountRepository}。</p>
 */
public interface UserAccountRepository {
    /**
     * 按用户表主键查询。
     *
     * @param id 用户 ID
     * @return 用户快照，不存在时为 empty
     */
    Optional<UserAccount> findById(Long id);

    /**
     * 按微信公众号 openid 查询。
     *
     * @param openid 公众号用户唯一标识
     * @return 用户快照，不存在时为 empty
     */
    Optional<UserAccount> findByOpenid(String openid);

    /**
     * 新增或更新用户。
     *
     * @param account 待保存的用户快照
     * @return 保存后快照；新增用户应包含生成的主键
     */
    UserAccount save(UserAccount account);
}
