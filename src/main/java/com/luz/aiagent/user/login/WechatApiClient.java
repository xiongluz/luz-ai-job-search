package com.luz.aiagent.user.login;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 微信公众平台 HTTP API 客户端。
 *
 * <p>这个类负责两组彼此独立的微信凭证流程：</p>
 * <ul>
 *     <li>公众号全局 access_token：使用 appId/appSecret 获取，用于创建带参二维码；</li>
 *     <li>网页授权 access_token：使用 OAuth code 获取，用于读取当前授权用户资料。</li>
 * </ul>
 *
 * <p>公众号全局 access_token 缓存在当前 Java 进程中，并在微信返回的有效期前
 * 60 秒主动失效。当前 RestTemplate 没有单独配置连接和读取超时，生产环境应通过
 * 统一 HTTP 客户端配置补充超时、连接池和可观测性。</p>
 */
@Component
public class WechatApiClient {
    /** 获取公众号全局 access_token 的微信接口。 */
    private static final String TOKEN_ENDPOINT = "https://api.weixin.qq.com/cgi-bin/token";

    /** 创建公众号带参二维码 ticket 的微信接口。 */
    private static final String QR_CODE_ENDPOINT = "https://api.weixin.qq.com/cgi-bin/qrcode/create";

    /** 使用 ticket 展示二维码图片的微信地址前缀。 */
    private static final String QR_CODE_IMAGE_PREFIX = "https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=";

    /** 使用网页授权 code 换取用户级 access_token 的微信接口。 */
    private static final String OAUTH_TOKEN_ENDPOINT = "https://api.weixin.qq.com/sns/oauth2/access_token";

    /** 使用用户级 access_token 拉取昵称和头像的微信接口。 */
    private static final String OAUTH_USER_INFO_ENDPOINT = "https://api.weixin.qq.com/sns/userinfo";

    /** 当前模块使用的同步 HTTP 客户端。 */
    private final RestTemplate restTemplate;

    /** 用于解析微信 JSON 响应。 */
    private final ObjectMapper objectMapper;

    /** 当前进程缓存的公众号全局 access_token。 */
    private volatile CachedAccessToken cachedAccessToken;

    /** 微信公众号 AppID。 */
    @Value("${wechat.login.app-id:}")
    private String appId;

    /** 微信公众号 AppSecret。 */
    @Value("${wechat.login.app-secret:}")
    private String appSecret;

    /** 微信网页授权完成后接收 code 的完整回调地址。 */
    @Value("${wechat.login.oauth-redirect-uri:}")
    private String oauthRedirectUri;

    /** 临时二维码在微信侧的有效秒数。 */
    @Value("${wechat.login.qr-expire-seconds:300}")
    private long qrExpireSeconds;

    /**
     * 创建微信 API 客户端。
     *
     * @param objectMapper Spring 管理的 JSON 解析器
     */
    @Autowired
    public WechatApiClient(ObjectMapper objectMapper) {
        this(objectMapper, new RestTemplate());
    }

    /**
     * 创建微信 API 客户端，并允许测试注入 HTTP 客户端。
     *
     * @param objectMapper Spring 管理的 JSON 解析器
     * @param restTemplate HTTP 客户端
     */
    WechatApiClient(ObjectMapper objectMapper, RestTemplate restTemplate) {
        this.objectMapper = objectMapper;
        this.restTemplate = restTemplate;
    }

    /**
     * 为指定 scene 创建公众号临时带参二维码。
     *
     * <p>采用字符串场景值 {@code QR_STR_SCENE}。微信先返回 ticket，本方法再把
     * ticket 编码成可直接作为图片 src 的 showqrcode 地址。未配置 appId/appSecret
     * 或 scene 为空时不请求微信，而是返回 Optional.empty。</p>
     *
     * @param scene 登录会话场景值
     * @return 二维码图片地址；配置不完整或微信没有返回有效地址时为空
     */
    public Optional<String> createTemporaryQrCodeUrl(String scene) {
        if (!StringUtils.hasText(appId) || !StringUtils.hasText(appSecret) || !StringUtils.hasText(scene)) {
            return Optional.empty();
        }

        String accessToken = getAccessToken();
        String endpoint = QR_CODE_ENDPOINT + "?access_token=" + encode(accessToken);
        // QR_STR_SCENE 允许使用字符串 scene，微信扫码事件会在 EventKey 中带回该值。
        Map<String, Object> body = Map.of(
                "expire_seconds", Math.max(60L, qrExpireSeconds),
                "action_name", "QR_STR_SCENE",
                "action_info", Map.of("scene", Map.of("scene_str", scene))
        );
        JsonNode root = postJson(endpoint, body);
        checkWechatError(root, "create qr code");
        String ticket = root.path("ticket").asText("");
        if (StringUtils.hasText(ticket)) {
            return Optional.of(QR_CODE_IMAGE_PREFIX + encode(ticket));
        }
        String url = root.path("url").asText("");
        return StringUtils.hasText(url) ? Optional.of(url) : Optional.empty();
    }

    /**
     * 创建微信公众号网页授权地址。
     *
     * <p>这是用户关注或扫码事件之后的第二步。授权地址必须在微信客户端内打开，
     * 微信确认授权后才会把一次性 {@code code} 回调给业务服务器。</p>
     *
     * @param state 与本地登录会话对应的 scene
     * @return 微信 OAuth 授权地址
     * @throws ResponseStatusException 必要配置缺失时抛出 400
     */
    public String createOAuthAuthorizeUrl(String state) {
        if (!StringUtils.hasText(appId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wechat login app-id not configured");
        }
        if (!StringUtils.hasText(oauthRedirectUri)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wechat oauth redirect-uri not configured");
        }
        if (!StringUtils.hasText(state)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "oauth state must not be blank");
        }

        return "https://open.weixin.qq.com/connect/oauth2/authorize"
                + "?appid=" + encode(appId.trim())
                + "&redirect_uri=" + encode(oauthRedirectUri.trim())
                + "&response_type=code"
                + "&scope=snsapi_userinfo"
                + "&state=" + encode(state.trim())
                + "#wechat_redirect";
    }

    /**
     * 使用网页授权 code 换取用户身份和公开资料。
     *
     * <p>第一步调用 oauth2/access_token 获得 openid 和用户级 access_token；
     * 第二步调用 sns/userinfo 获得昵称、头像与可能存在的 unionid。该流程要求
     * 发起 OAuth 时使用可读取资料的授权范围。</p>
     *
     * @param code 微信 OAuth 回调携带的一次性 code
     * @return 标准化后的微信用户资料
     * @throws ResponseStatusException 配置缺失、参数为空、微信返回错误或响应不完整时抛出
     */
    public WechatOAuthProfile exchangeOAuthCode(String code) {
        if (!StringUtils.hasText(appId) || !StringUtils.hasText(appSecret)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wechat login app-id/app-secret not configured");
        }
        if (!StringUtils.hasText(code)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "oauth code must not be blank");
        }

        String tokenUrl = OAUTH_TOKEN_ENDPOINT
                + "?appid=" + encode(appId)
                + "&secret=" + encode(appSecret)
                + "&code=" + encode(code)
                + "&grant_type=authorization_code";
        JsonNode tokenRoot = getJson(tokenUrl);
        checkWechatError(tokenRoot, "exchange oauth access token");
        String accessToken = tokenRoot.path("access_token").asText("");
        String openid = tokenRoot.path("openid").asText("");
        String unionid = tokenRoot.path("unionid").asText("");
        if (!StringUtils.hasText(accessToken) || !StringUtils.hasText(openid)) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat oauth response is incomplete");
        }

        String userInfoUrl = OAUTH_USER_INFO_ENDPOINT
                + "?access_token=" + encode(accessToken)
                + "&openid=" + encode(openid)
                + "&lang=zh_CN";
        JsonNode userRoot = getJson(userInfoUrl);
        checkWechatError(userRoot, "fetch oauth user info");

        String nickname = userRoot.path("nickname").asText("");
        String avatarUrl = userRoot.path("headimgurl").asText("");
        String userUnionid = userRoot.path("unionid").asText("");
        return new WechatOAuthProfile(openid, firstText(userUnionid, unionid), nickname, avatarUrl);
    }

    /**
     * 获取可调用公众号服务端 API 的全局 access_token。
     *
     * <p>方法使用 synchronized 避免 token 过期时多个请求同时刷新。缓存有效时
     * 直接复用；刷新后按照微信 expires_in 减去 60 秒保存，降低临界点失效风险。</p>
     */
    private synchronized String getAccessToken() {
        Instant now = Instant.now();
        if (cachedAccessToken != null && cachedAccessToken.expireAt != null && now.isBefore(cachedAccessToken.expireAt)) {
            return cachedAccessToken.token;
        }

        String endpoint = TOKEN_ENDPOINT
                + "?grant_type=client_credential"
                + "&appid=" + encode(appId)
                + "&secret=" + encode(appSecret);
        JsonNode root = getJson(endpoint);
        checkWechatError(root, "fetch access token");
        String token = root.path("access_token").asText("");
        long expiresIn = root.path("expires_in").asLong(7200L);
        if (!StringUtils.hasText(token)) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat access token is blank");
        }

        long safeSeconds = Math.max(60L, expiresIn - 60L);
        cachedAccessToken = new CachedAccessToken(token, Instant.now().plusSeconds(safeSeconds));
        return token;
    }

    /**
     * 发送 JSON POST 请求并把响应解析为 JsonNode。
     *
     * @param url 完整微信接口地址
     * @param body 将由 RestTemplate 序列化的请求体
     * @return JSON 根节点，空响应按空对象处理
     */
    private JsonNode postJson(String url, Object body) {
        try {
            /*
             * 微信二维码接口会检查 Content-Length。Spring Framework 6.1+
             * 的默认请求实现可能使用分块传输而不主动提供该请求头，因此这里
             * 先按 UTF-8 序列化，再显式声明准确的字节长度。
             */
            byte[] requestBody = objectMapper.writeValueAsBytes(body);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setAccept(List.of(MediaType.APPLICATION_JSON));
            headers.setContentLength(requestBody.length);

            ResponseEntity<String> response = restTemplate.postForEntity(
                    url,
                    new HttpEntity<>(requestBody, headers),
                    String.class
            );
            return objectMapper.readTree(response.getBody() == null ? "{}" : response.getBody());
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat api request failed: " + error.getMessage(), error);
        }
    }

    /**
     * 发送 GET 请求并把响应解析为 JsonNode。
     *
     * @param url 完整微信接口地址
     * @return JSON 根节点，空响应按空对象处理
     */
    private JsonNode getJson(String url) {
        try {
            byte[] bytes = restTemplate.getForObject(url, byte[].class);
            String content = bytes == null || bytes.length == 0 ? "{}" : new String(bytes, StandardCharsets.UTF_8);
            return objectMapper.readTree(content);
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat api request failed: " + error.getMessage(), error);
        }
    }

    /**
     * 检查微信通用 errcode/errmsg 错误格式。
     *
     * @param root 微信响应 JSON
     * @param action 当前操作名称，用于构造可定位的错误信息
     */
    private void checkWechatError(JsonNode root, String action) {
        if (root == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat api returned empty response: " + action);
        }
        int errCode = root.path("errcode").asInt(0);
        if (errCode != 0) {
            String errMsg = root.path("errmsg").asText("unknown error");
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat api error while " + action + ": " + errCode + " / " + errMsg);
        }
    }

    /** 对 URL 查询参数值执行 UTF-8 百分号编码。 */
    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    /** 本次值为空时使用回退值，避免空字段覆盖已有 unionid。 */
    private String firstText(String value, String fallback) {
        return StringUtils.hasText(value) ? value : fallback;
    }

    /**
     * 公众号全局 access_token 的本地缓存项。
     *
     * @param token 微信 access_token
     * @param expireAt 本地判定失效的时间
     */
    private record CachedAccessToken(String token, Instant expireAt) {
    }

    /**
     * 网页授权后得到的标准化微信用户资料。
     *
     * @param openid 当前公众号下的用户唯一标识
     * @param unionid 开放平台统一标识，可以为空
     * @param nickname 微信昵称，可以为空
     * @param avatarUrl 微信头像地址，可以为空
     */
    public record WechatOAuthProfile(String openid, String unionid, String nickname, String avatarUrl) {
    }
}
