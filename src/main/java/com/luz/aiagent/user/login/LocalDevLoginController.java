package com.luz.aiagent.user.login;

import com.luz.aiagent.user.login.UserLoginDtos.CurrentUserResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

/**
 * 本机开发用的登录入口。
 *
 * <p>这个控制器故意同时受 Spring {@code local} profile、显式开关和内存用户仓库
 * 三重条件限制。它只为本地页面测试建立真实的 {@code GQLD_SESSION}，不会参与
 * 生产环境的微信公众号登录流程，也不会把测试账号写入 MySQL。</p>
 */
@RestController
@RequestMapping("/login/wechat")
@Profile("local")
@ConditionalOnProperty(prefix = "dev.auth", name = "enabled", havingValue = "true")
@ConditionalOnProperty(prefix = "user.repository", name = "type", havingValue = "memory")
public class LocalDevLoginController {
    /** 固定的本地测试身份，不对应任何真实微信用户。 */
    private static final String LOCAL_OPENID = "local-dev-openid";
    private static final String LOCAL_UNIONID = "local-dev-unionid";
    private static final String LOCAL_NICKNAME = "本地开发账号";
    private static final String LOCAL_AVATAR_URL = "/brand.jpg";

    private final UserAccountRepository userAccountRepository;
    private final String proxyToken;

    /** 浏览器 session 的有效秒数，和正式登录保持同一默认值。 */
    @Value("${wechat.login.web-session-ttl-seconds:43200}")
    private long webSessionTtlSeconds;

    public LocalDevLoginController(
            UserAccountRepository userAccountRepository,
            @Value("${dev.auth.proxy-token:}") String proxyToken
    ) {
        this.userAccountRepository = userAccountRepository;
        this.proxyToken = proxyToken;
    }

    /**
     * 为本地开发浏览器创建或恢复固定测试账号的 HttpSession。
     *
     * @param request 当前浏览器请求；只接受 loopback 来源
     * @param presentedToken 本地 Vite 代理注入的单次启动随机密钥
     * @return 与 {@code /api/login/wechat/session} 相同的已认证用户摘要
     */
    @PostMapping("/dev-session")
    public ResponseEntity<CurrentUserResponse> createDevSession(
            HttpServletRequest request,
            @RequestHeader(value = "X-GQLD-Local-Dev-Token", required = false) String presentedToken
    ) {
        if (!isLoopback(request) || !hasValidProxyToken(presentedToken)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "local development login request was rejected"
            );
        }

        Instant now = Instant.now();
        UserAccount account = userAccountRepository.findByOpenid(LOCAL_OPENID)
                .map(existing -> existing
                        .withProfile(LOCAL_UNIONID, LOCAL_NICKNAME, LOCAL_AVATAR_URL, now)
                        .markSubscribed(now)
                        .markLogin(now))
                .orElseGet(() -> new UserAccount(
                        null,
                        LOCAL_OPENID,
                        LOCAL_UNIONID,
                        LOCAL_NICKNAME,
                        LOCAL_AVATAR_URL,
                        true,
                        now,
                        now,
                        1,
                        now,
                        now
                ));
        account = userAccountRepository.save(account);
        establishWebSession(request, account.id());

        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(CurrentUserResponse.authenticated(account));
    }

    /** 创建或轮换 session ID，避免开发登录也引入 session fixation。 */
    private void establishWebSession(HttpServletRequest request, Long userId) {
        HttpSession previousSession = request.getSession(false);
        if (previousSession != null) {
            previousSession.invalidate();
        }
        HttpSession session = request.getSession(true);

        long safeTtl = Math.max(60L, Math.min(Integer.MAX_VALUE, webSessionTtlSeconds));
        session.setMaxInactiveInterval((int) safeTtl);
        session.setAttribute(UserLoginController.SESSION_USER_ID, userId);
    }

    /**
     * 不信任 X-Forwarded-For 等可伪造请求头，只根据 Servlet 容器看到的对端地址判断。
     */
    private boolean isLoopback(HttpServletRequest request) {
        if (request == null || request.getRemoteAddr() == null || request.getRemoteAddr().isBlank()) {
            return false;
        }
        try {
            if (!InetAddress.getByName(request.getRemoteAddr()).isLoopbackAddress()) {
                return false;
            }

            // 额外校验 Host，避免错误地把本地 profile 挂在公网反向代理后仍可调用。
            String serverName = request.getServerName();
            if (serverName == null || serverName.isBlank()) {
                return false;
            }
            String normalized = serverName.trim().toLowerCase(java.util.Locale.ROOT);
            return "localhost".equals(normalized)
                    || "127.0.0.1".equals(normalized)
                    || "[::1]".equals(normalized)
                    || "::1".equals(normalized);
        } catch (Exception ignored) {
            return false;
        }
    }

    /** 使用常量时间比较校验代理密钥，空密钥永远不允许登录。 */
    private boolean hasValidProxyToken(String presentedToken) {
        if (proxyToken == null || proxyToken.isBlank()
                || presentedToken == null || presentedToken.isBlank()) {
            return false;
        }
        return MessageDigest.isEqual(
                proxyToken.getBytes(StandardCharsets.UTF_8),
                presentedToken.getBytes(StandardCharsets.UTF_8)
        );
    }
}
