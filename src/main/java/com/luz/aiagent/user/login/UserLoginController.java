package com.luz.aiagent.user.login;

import cn.hutool.core.util.IdUtil;
import com.luz.aiagent.user.login.UserLoginDtos.CreateLoginQrcodeResponse;
import com.luz.aiagent.user.login.UserLoginDtos.CurrentUserResponse;
import com.luz.aiagent.user.login.UserLoginDtos.LoginStatusResponse;
import com.luz.aiagent.user.login.UserLoginDtos.OAuthAuthorizeUrlResponse;
import com.luz.aiagent.user.login.UserLoginDtos.OAuthCallbackResponse;
import com.luz.aiagent.utils.Constant;
import com.luz.aiagent.utils.Result;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * 浏览器侧微信登录接口。
 *
 * <p>应用配置了 {@code server.servlet.context-path=/api}，因此该控制器的完整基础路径
 * 是 {@code /api/login/wechat}。微信业务状态流转交给 {@link UserLoginService}，
 * 控制器同时负责在桌面浏览器轮询成功后建立应用 HttpSession。</p>
 */
@RestController
@RequestMapping("/login/wechat")
public class UserLoginController {
    /**
     * HttpSession 中保存已登录用户主键的属性名。
     */
    static final String SESSION_USER_ID = UserLoginController.class.getName() + ".userId";

    /**
     * 微信登录业务编排服务。
     */
    @Resource
    private UserLoginService userLoginService;

    /**
     * 浏览器登录会话有效秒数，默认 12 小时。
     */
    @Value("${wechat.login.web-session-ttl-seconds:43200}")
    private long webSessionTtlSeconds;

    @Autowired
    private RedisTemplate redisTemplate;

    /**
     * 创建一次扫码登录会话并返回公众号带参二维码信息。
     *
     * <p>socketId 同时支持查询参数和 {@code X-Socket-Id} 请求头；两者都存在时
     * 优先使用查询参数。纯轮询方案可以完全不传 socketId。</p>
     *
     * @param socketId       查询参数中的可选连接标识
     * @param socketIdHeader 请求头中的可选连接标识
     * @return 二维码内容、scene、初始状态和过期时间
     */
    @GetMapping("/qrcode")
    public CreateLoginQrcodeResponse qrcode(@RequestParam(required = false) String socketId, @RequestHeader(value = "X-Socket-Id", required = false) String socketIdHeader) {
        String effectiveSocketId = socketId != null && !socketId.isBlank() ? socketId : socketIdHeader;
        return userLoginService.createQrcode(effectiveSocketId);
    }

    /**
     * 查询指定 scene 的当前登录状态，供登录页定时轮询。
     *
     * @param scene   创建二维码时返回的场景值
     * @param request 当前桌面浏览器请求，用于在 SUCCESS 时建立 HttpSession
     * @return 当前会话和用户摘要；不存在或已过期时状态为 EXPIRED
     */
    @GetMapping("/status")
    public Result<Map<String, Object>> status(@RequestParam String scene, HttpServletRequest request) {
        LoginStatusResponse response = userLoginService.getStatus(scene);
        Map<String, Object> map = new HashMap<>();
        map.put("status", response.status());
        map.put("message", response.message());
        if (response.status() == LoginStatus.SUCCESS && response.userId() != null) {
            Optional<UserAccount> activeUser = userLoginService.findActiveUser(response.userId());
            activeUser.ifPresent(account -> establishWebSession(request, account.id()));

            //生成令牌，存入redis中
            String token = IdUtil.fastSimpleUUID();
            String logintoken = Constant.USER_LOGIN_KEY_PREFIX + token;
            activeUser.ifPresent(account -> redisTemplate.opsForValue().set(logintoken, account, Constant.USER_LOGIN_UP_TIME, TimeUnit.DAYS));
            map.put("token", token);
            map.put("id", response.userId());
        }
        return Result.ok(map);
    }

    /**
     * 查询当前浏览器是否已经建立应用登录会话。
     *
     * @param request 当前浏览器请求
     * @return 已登录用户摘要；没有有效会话时返回 authenticated=false
     */
    @GetMapping("/session")
    public CurrentUserResponse currentSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return CurrentUserResponse.anonymous();
        }

        Long userId = readSessionUserId(session.getAttribute(SESSION_USER_ID));
        if (userId == null) {
            return CurrentUserResponse.anonymous();
        }

        return userLoginService.findActiveUser(userId).map(CurrentUserResponse::authenticated).orElseGet(() -> {
            session.removeAttribute(SESSION_USER_ID);
            return CurrentUserResponse.anonymous();
        });
    }

    /**
     * 注销当前浏览器会话，供“切换账号”在生成新二维码前清理旧身份。
     *
     * @param request 当前浏览器请求
     * @return HTTP 204
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return ResponseEntity.noContent().build();
    }

    /**
     * 为已扫码会话生成微信公众号网页授权地址。
     *
     * <p>手机微信收到公众号回复后通常直接点击回复中的地址；这个接口是网页端的
     * 备用入口，也便于联调时查看授权地址。普通桌面浏览器打开该地址不会弹出微信
     * 授权框，必须在微信客户端内打开。</p>
     *
     * @param scene 创建二维码时返回的场景值
     * @return 网页授权地址和会话过期时间
     */
    @GetMapping("/oauth/url")
    public OAuthAuthorizeUrlResponse oauthUrl(@RequestParam String scene) {
        return userLoginService.createOAuthAuthorizeUrl(scene);
    }

    /**
     * 接收微信网页授权回调并完成用户资料更新和登录状态落定。
     *
     * <p>标准 OAuth 流程会把原先传入的 state 原样带回，因此优先兼容显式 scene，
     * scene 为空时使用 state。当前接口返回 JSON，不执行 HTTP 302 跳转。</p>
     *
     * @param scene 可选的显式场景值
     * @param state 微信 OAuth 回传状态，通常就是 scene
     * @param code  微信生成的一次性网页授权 code
     * @return 登录成功后的用户摘要和配置的前端跳转地址
     */
    @GetMapping("/oauth/callback")
    public String oauthCallback(@RequestParam(required = false) String scene, @RequestParam(required = false) String state, @RequestParam String code) {
        String effectiveScene = scene != null && !scene.isBlank() ? scene : state;
        try {
            OAuthCallbackResponse response = userLoginService.completeOAuth(effectiveScene, code);
            if (response.status() == LoginStatus.SUCCESS) {
                return "登录成功，请前往页面查看！（该链接仅供一次登录）";
            }
        } catch (ResponseStatusException error) {
            return "登录失败，请重试！";
        }
        return "登录失败，请重试！";
    }

    /**
     * 失效旧会话、创建全新浏览器会话，并绑定已通过微信授权的用户主键。
     */
    private void establishWebSession(HttpServletRequest request, Long userId) {
        HttpSession previousSession = request.getSession(false);
        if (previousSession != null) {
            previousSession.invalidate();
        }
        HttpSession session = request.getSession(true);

        long safeTtl = Math.max(60L, Math.min(Integer.MAX_VALUE, webSessionTtlSeconds));
        session.setMaxInactiveInterval((int) safeTtl);
        session.setAttribute(SESSION_USER_ID, userId);
    }

    /**
     * 兼容 Servlet 容器将数字属性还原成不同 Number 子类的情况。
     */
    private Long readSessionUserId(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }
}
