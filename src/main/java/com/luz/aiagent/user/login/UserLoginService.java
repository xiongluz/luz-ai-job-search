package com.luz.aiagent.user.login;

import cn.hutool.core.util.IdUtil;
import com.luz.aiagent.user.login.UserLoginDtos.CreateLoginQrcodeResponse;
import com.luz.aiagent.user.login.UserLoginDtos.LoginStatusResponse;
import com.luz.aiagent.user.login.UserLoginDtos.OAuthAuthorizeUrlResponse;
import com.luz.aiagent.user.login.UserLoginDtos.OAuthCallbackResponse;
import com.luz.aiagent.user.login.UserLoginDtos.WechatLoginEventRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.StringJoiner;

/**
 * 微信扫码登录的核心业务编排服务。
 *
 * <p>该服务把三个独立入口串成同一次登录：</p>
 * <ol>
 *     <li>浏览器创建二维码，以随机 scene 建立本地登录会话；</li>
 *     <li>微信推送扫码/关注事件，通过 EventKey 中的 scene 绑定 openid；</li>
 *     <li>微信网页授权回调通过 state 中的 scene 找回会话，补齐昵称头像并完成登录。</li>
 * </ol>
 *
 * <p>浏览器在此期间使用 scene 轮询状态。临时会话由 {@link LoginSessionStore}
 * 保存在 Redis，用户数据则通过 {@link UserAccountRepository} 抽象访问。</p>
 */
@Service
public class UserLoginService {
    /**
     * 微信配置缺失时返回给前端的占位二维码内容前缀。
     * 该协议不是可用的公众号二维码，只用于本地联调时保留 scene。
     */
    private static final String FALLBACK_QR_PREFIX = "wechat-login://scene/";

    /**
     * 本地登录会话仓库。
     */
    private final LoginSessionStore sessionStore;

    /**
     * 用户数据仓库，当前项目默认注入内存实现。
     */
    private final UserAccountRepository userAccountRepository;

    /**
     * 微信服务端 API 客户端。
     */
    private final WechatApiClient wechatApiClient;

    /**
     * 公众号服务器配置 Token，用于验证微信回调签名。
     */
    @Value("${wechat.login.token:change-me}")
    private String token;

    /**
     * OAuth 完成后期望前往的前端地址；当前仅随 JSON 返回，不主动重定向。
     */
    @Value("${wechat.login.oauth-redirect-uri:}")
    private String oauthRedirectUri;

    /**
     * 本地登录会话有效秒数，实际使用时最低为 60 秒。
     */
    @Value("${wechat.login.session-ttl-seconds:300}")
    private long sessionTtlSeconds;

    /**
     * 构造登录业务服务。
     *
     * @param sessionStore          本地会话仓库
     * @param userAccountRepository 用户数据仓库
     * @param wechatApiClient       微信 API 客户端
     */
    public UserLoginService(LoginSessionStore sessionStore, UserAccountRepository userAccountRepository, WechatApiClient wechatApiClient) {
        this.sessionStore = sessionStore;
        this.userAccountRepository = userAccountRepository;
        this.wechatApiClient = wechatApiClient;
    }

    /**
     * 创建一次新的二维码登录会话。
     *
     * <p>先在本地生成 scene 和过期时间，再请求微信创建临时带参二维码。微信凭证
     * 未配置时仍返回会话和占位内容，方便前后端在本地联调状态查询接口。</p>
     *
     * @param socketId 可选的前端连接 ID，轮询模式下可以为空
     * @return scene、二维码地址、WAIT_SCAN 状态和过期时间
     */
    public CreateLoginQrcodeResponse createQrcode(String socketId) {
        Duration ttl = Duration.ofSeconds(Math.max(60L, sessionTtlSeconds));
        LoginSession session = sessionStore.create(socketId, ttl);

        // 微信二维码创建失败会抛异常；只有配置缺失或微信未返回地址时使用占位内容。
        Optional<String> qrCodeUrl = wechatApiClient.createTemporaryQrCodeUrl(session.scene());
        String qrCodeContent = qrCodeUrl.orElse(FALLBACK_QR_PREFIX + session.scene());
        String message = qrCodeUrl.isPresent() ? "wechat qrcode ready" : "wechat app-id/app-secret not configured, using fallback content";
        return new CreateLoginQrcodeResponse(session.scene(), qrCodeContent, qrCodeUrl.orElse(""), session.status(), session.expireAt(), message, session.socketId());
    }

    /**
     * 查询一次登录会话的最新状态。
     *
     * <p>scene 为空返回 INVALID；会话不存在或已被惰性清理时统一返回 EXPIRED。
     * 找到会话后再按 openid 查询用户，以便把昵称、头像和关注状态一并返回前端。</p>
     *
     * @param scene 二维码场景值
     * @return 可直接供登录页轮询处理的状态响应
     */
    public LoginStatusResponse getStatus(String scene) {
        if (!StringUtils.hasText(scene)) {
            return new LoginStatusResponse("", LoginStatus.INVALID, null, null, null, null, null, false, null, "scene must not be blank");
        }
        Optional<LoginSession> sessionOptional = sessionStore.findActive(scene);
        if (sessionOptional.isEmpty()) {
            return new LoginStatusResponse(scene, LoginStatus.EXPIRED, null, null, null, null, null, false, null, "login session missing or expired");
        }

        LoginSession session = sessionOptional.get();
        UserAccount account = lookupAccount(session.openid()).orElse(null);
        return buildStatusResponse(session, account);
    }

    /**
     * 查询可用于恢复浏览器登录会话的有效用户。
     *
     * <p>账号被禁用或数据库已记录为取消关注后，即使旧 HttpSession 尚未过期，
     * 也不会继续视为已登录。</p>
     *
     * @param userId HttpSession 中保存的用户 ID
     * @return 正常状态的用户；不存在或已禁用时为空
     */
    public Optional<UserAccount> findActiveUser(Long userId) {
        if (userId == null) {
            return Optional.empty();
        }
        return userAccountRepository.findById(userId).filter(account -> account.status() == 1 && account.subscribe());
    }

    /**
     * 为已经扫码的登录会话生成网页授权地址。
     *
     * <p>微信公众号二维码本身只负责触发关注/扫码事件，不会自动弹出网页授权页。
     * 这个方法把当前 scene 放入 OAuth 的 state，授权完成后微信会把它原样带回回调
     * 地址，从而找回同一条内存登录会话。</p>
     *
     * @param scene 已扫码二维码对应的场景值
     * @return 可在微信客户端内打开的授权地址
     */
    public OAuthAuthorizeUrlResponse createOAuthAuthorizeUrl(String scene) {
        if (!StringUtils.hasText(scene)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "scene must not be blank");
        }

        LoginSession session = sessionStore.findActive(scene).orElseThrow(() -> new ResponseStatusException(HttpStatus.GONE, "login session missing or expired"));
        if (session.status() != LoginStatus.SCANNED && session.status() != LoginStatus.SUBSCRIBED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "wechat user has not scanned this login qrcode");
        }

        String authorizeUrl = wechatApiClient.createOAuthAuthorizeUrl(scene);
        return new OAuthAuthorizeUrlResponse(scene, authorizeUrl, session.expireAt(), "oauth authorize url ready");
    }

    /**
     * 将微信推送的 XML 解析成内部事件对象。
     *
     * <p>XML 解析器开启安全处理并禁止 DOCTYPE，避免外部实体注入。关注事件中的
     * EventKey 格式通常是 {@code qrscene_场景值}，普通 SCAN 事件则直接携带场景值，
     * 两种格式会由 {@link #normalizeScene(String)} 统一。</p>
     *
     * <p>普通微信事件通常只提供 openid、Event、EventKey 和 CreateTime，
     * 并不直接附带昵称与头像；这些资料主要由后续 OAuth 获取。</p>
     *
     * @param xml 微信发送的原始 XML
     * @return 标准化后的事件对象，包含公众号原始 ID，供回复消息使用
     * @throws ResponseStatusException 请求体为空或 XML 无法解析时抛出 400
     */
    public WechatLoginEventRequest parseWechatEvent(String xml) {
        if (!StringUtils.hasText(xml)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wechat callback body must not be blank");
        }
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setExpandEntityReferences(false);
            factory.setNamespaceAware(false);

            // 每次回调使用独立 DocumentBuilder，避免在线程之间共享非线程安全解析器。
            Document document = factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
            Element root = document.getDocumentElement();
            String messageType = textOf(root, "MsgType");
            String event = textOf(root, "Event");
            String rawEventKey = textOf(root, "EventKey");
            String scene = normalizeScene(rawEventKey);
            String openid = textOf(root, "FromUserName");
            String unionid = textOf(root, "UnionID");
            String nickname = textOf(root, "NickName");
            String avatarUrl = textOf(root, "HeadImgUrl");
            Instant eventTime = parseEventTime(textOf(root, "CreateTime"));
            String toUserName = textOf(root, "ToUserName");
            return new WechatLoginEventRequest(messageType, event, openid, scene, rawEventKey, unionid, nickname, avatarUrl, eventTime, toUserName);
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "failed to parse wechat xml callback: " + error.getMessage(), error);
        }
    }

    /**
     * 处理原始微信 XML 回调。
     *
     * @param xml 微信事件 XML
     */
    public void handleWechatEvent(String xml) {
        WechatLoginEventRequest request = parseWechatEvent(xml);
        handleWechatEvent(request);
    }

    /**
     * 处理微信事件，并为关注/扫码事件生成公众号文本回复。
     *
     * <p>微信收到公众号事件后不会替业务自动打开 OAuth 页面。把授权地址作为事件
     * 的文本回复发回用户，用户在手机微信中点击该链接，才会看到微信授权确认页。</p>
     *
     * @param xml 微信发送的原始 XML
     * @return 微信要求的响应文本；需要回复时为 XML，否则为 {@code success}
     */
    public String handleWechatEventAndReply(String xml) {
        WechatLoginEventRequest request = parseWechatEvent(xml);
        LoginStatusResponse status = handleWechatEvent(request);
        return buildWechatReply(request, status);
    }

    /**
     * 根据微信事件推进登录会话并创建或更新用户。
     *
     * <p>处理步骤如下：</p>
     * <ol>
     *     <li>验证 openid 与 scene，并定位仍有效的本地会话；</li>
     *     <li>把微信身份绑定到会话；</li>
     *     <li>按 openid 查询用户，不存在时构造新用户；</li>
     *     <li>根据事件更新关注状态、用户资料和会话状态。</li>
     * </ol>
     *
     * <p>当前实现要求所有事件都携带 scene。微信的普通 unsubscribe 事件通常没有
     * EventKey，因此这类事件目前会返回 INVALID，不会更新用户关注状态；如果需要
     * 全量同步取消关注，应另加一个只按 openid 更新用户的分支。</p>
     *
     * @param request 已解析的微信事件
     * @return 事件处理后的登录状态；公众号回复由 {@link #handleWechatEventAndReply(String)} 负责
     */
    public LoginStatusResponse handleWechatEvent(WechatLoginEventRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wechat event request must not be null");
        }
        if (!StringUtils.hasText(request.openid()) || !StringUtils.hasText(request.scene())) {
            return new LoginStatusResponse(firstText(request.scene(), ""), LoginStatus.INVALID, null, request.openid(), request.unionid(), request.nickname(), request.avatarUrl(), false, null, "openid or scene missing");
        }

        Optional<LoginSession> sessionOptional = sessionStore.findActive(request.scene());
        if (sessionOptional.isEmpty()) {
            return new LoginStatusResponse(request.scene(), LoginStatus.EXPIRED, null, request.openid(), request.unionid(), request.nickname(), request.avatarUrl(), false, null, "login session missing or expired");
        }

        LoginSession session = sessionOptional.get();

        // 此后 OAuth 回调会再次校验 openid，防止另一个微信用户占用当前 scene。
        session.bindWechatIdentity(request.openid(), request.unionid());

        Instant now = request.eventTime() == null ? Instant.now() : request.eventTime();
        String event = firstText(request.event(), "").toUpperCase();
        UserAccount account = lookupAccount(request.openid()).orElseGet(() -> new UserAccount(null, request.openid(), request.unionid(), request.nickname(), request.avatarUrl(), false, null, null, 1, now, now));

        if ("UNSUBSCRIBE".equals(event)) {
            account = account.markUnsubscribed(now);
            account = userAccountRepository.save(account);
            session.markStatus(LoginStatus.SCANNED);
            session.attachUser(account.id());
            sessionStore.save(session);
            return buildStatusResponse(session, account, "user unsubscribed");
        }

        // 新关注和已关注用户再次扫码都视为已关注；CLICK 是现有实现保留的兼容分支。
        boolean subscribed = "SUBSCRIBE".equals(event) || "SCAN".equals(event) || "CLICK".equals(event);
        if (subscribed) {
            account = account.markSubscribed(now);
        }
        account = account.withProfile(request.unionid(), request.nickname(), request.avatarUrl(), now);
        account = userAccountRepository.save(account);
        session.attachUser(account.id());

        // 新关注明确进入 SUBSCRIBED；已关注用户的 SCAN 进入 SCANNED，等待 OAuth。
        session.markStatus("SUBSCRIBE".equals(event) ? LoginStatus.SUBSCRIBED : LoginStatus.SCANNED);
        sessionStore.save(session);
        return buildStatusResponse(session, account);
    }

    /**
     * 使用网页授权 code 补齐用户资料并完成登录。
     *
     * <p>scene 用于找回二维码会话，code 由微信换取 openid、昵称和头像。如果扫码
     * 阶段已经把 openid 绑定到会话，则必须与 OAuth 返回的 openid 一致，否则拒绝
     * 完成登录，避免会话被不同微信账号串用。</p>
     *
     * <p>资料保存成功后更新 lastLoginTime，并直接把会话状态设为 SUCCESS。
     * 当前实现不会停留在 AUTHORIZED，也尚未签发 JWT、Cookie 或服务端登录凭证。</p>
     *
     * @param scene 二维码登录会话场景值，通常来自 OAuth state
     * @param code  微信网页授权的一次性 code
     * @return 登录成功后的用户摘要和前端跳转地址配置
     */
    public OAuthCallbackResponse completeOAuth(String scene, String code) {
        if (!StringUtils.hasText(scene)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "scene must not be blank");
        }
        if (!StringUtils.hasText(code)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "code must not be blank");
        }

        LoginSession session = sessionStore.findActive(scene).orElseThrow(() -> new ResponseStatusException(HttpStatus.GONE, "login session missing or expired"));
        if (session.status() != LoginStatus.SCANNED && session.status() != LoginStatus.SUBSCRIBED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "wechat user has not scanned this login qrcode");
        }
        WechatApiClient.WechatOAuthProfile profile = wechatApiClient.exchangeOAuthCode(code);

        // scene 只能被最初扫码的微信身份继续使用。
        if (StringUtils.hasText(session.openid()) && StringUtils.hasText(profile.openid()) && !session.openid().equals(profile.openid())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "oauth openid does not match current login session");
        }

        Instant now = Instant.now();
        UserAccount account = lookupAccount(profile.openid()).orElseGet(() -> new UserAccount(null, profile.openid(), profile.unionid(), profile.nickname(), profile.avatarUrl(), true, now, null, 1, now, now));
        if (account.status() != 1) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "user account is disabled");
        }

        // OAuth 成功后合并资料、记录关注和最后登录时间，再交由仓库新增或更新。
        account = account.withProfile(profile.unionid(), profile.nickname(), profile.avatarUrl(), now).markSubscribed(now).markLogin(now);
        account = userAccountRepository.save(account);

        session.bindWechatIdentity(profile.openid(), profile.unionid());
        session.attachUser(account.id());
        session.markStatus(LoginStatus.SUCCESS);
        sessionStore.save(session);

        return new OAuthCallbackResponse(scene, LoginStatus.SUCCESS, account.id(), account.openid(), account.nickname(), account.avatarUrl(), oauthRedirectUri, "login success");
    }

    /**
     * 校验请求是否由配置了相同 Token 的微信服务器发出。
     *
     * <p>按照微信规则，将 token、timestamp、nonce 按字典序排序后拼接，计算 SHA-1，
     * 再与 signature 比较。这里只实现明文模式签名，不处理安全模式的 msg_signature。</p>
     *
     * @param signature 微信请求签名
     * @param timestamp 微信时间戳字符串
     * @param nonce     微信随机字符串
     * @return 参数完整且签名一致时返回 true
     */
    public boolean verifySignature(String signature, String timestamp, String nonce) {
        if (!StringUtils.hasText(token) || !StringUtils.hasText(signature) || !StringUtils.hasText(timestamp) || !StringUtils.hasText(nonce)) {
            return false;
        }
        List<String> values = new ArrayList<>(List.of(token, timestamp, nonce));
        values.sort(Comparator.naturalOrder());
        String plain = String.join("", values);
        return sha1Hex(plain).equalsIgnoreCase(signature);
    }

    /**
     * 使用状态对应的默认提示语构建轮询响应。
     */
    private LoginStatusResponse buildStatusResponse(LoginSession session, UserAccount account) {
        return buildStatusResponse(session, account, messageOf(session.status()));
    }

    /**
     * 合并会话数据和用户数据，形成统一的轮询响应。
     *
     * <p>会话中的 openid、unionid 优先；会话尚无对应值时再回退到用户快照。
     * 用户尚未建立时，资料字段保持为空。</p>
     */
    private LoginStatusResponse buildStatusResponse(LoginSession session, UserAccount account, String message) {
        return new LoginStatusResponse(session.scene(), session.status(), account == null ? session.userId() : account.id(), session.openid() == null ? (account == null ? null : account.openid()) : session.openid(), session.unionid() == null ? (account == null ? null : account.unionid()) : session.unionid(), account == null ? null : account.nickname(), account == null ? null : account.avatarUrl(), account != null && account.subscribe(), session.expireAt(), message);
    }

    /**
     * 仅在 openid 有值时查询用户，统一处理空身份。
     *
     * @param openid 公众号用户标识
     * @return 用户快照或 empty
     */
    private Optional<UserAccount> lookupAccount(String openid) {
        if (!StringUtils.hasText(openid)) {
            return Optional.empty();
        }
        return userAccountRepository.findByOpenid(openid);
    }

    /**
     * 把状态枚举转换成当前接口使用的简短英文提示。
     */
    private String messageOf(LoginStatus status) {
        if (status == null) {
            return "unknown";
        }
        return switch (status) {
            case INIT -> "session initialized";
            case WAIT_SCAN -> "waiting for scan";
            case SCANNED -> "scanned, waiting for authorization";
            case SUBSCRIBED -> "subscribed, waiting for authorization";
            case AUTHORIZED -> "authorized";
            case SUCCESS -> "login success";
            case EXPIRED -> "expired";
            case INVALID -> "invalid";
        };
    }

    /**
     * 把微信 CreateTime 的 Unix 秒级时间戳转换为 Instant。
     * 无值或格式错误时使用服务器当前时间，保证后续用户时间字段可写。
     */
    private Instant parseEventTime(String value) {
        if (!StringUtils.hasText(value)) {
            return Instant.now();
        }
        try {
            return Instant.ofEpochSecond(Long.parseLong(value));
        } catch (NumberFormatException error) {
            return Instant.now();
        }
    }

    /**
     * 统一两类 EventKey：新关注扫码事件去掉 {@code qrscene_} 前缀，
     * 已关注用户 SCAN 事件的原始 scene 保持不变。
     */
    private String normalizeScene(String eventKey) {
        if (!StringUtils.hasText(eventKey)) {
            return "";
        }
        return eventKey.startsWith("qrscene_") ? eventKey.substring("qrscene_".length()) : eventKey;
    }

    /**
     * 读取 XML 根节点下指定标签的首个文本值。
     * 标签不存在或内容为 null 时统一返回空字符串。
     */
    private String textOf(Element root, String tagName) {
        NodeList nodes = root.getElementsByTagName(tagName);
        if (nodes == null || nodes.getLength() == 0 || nodes.item(0) == null) {
            return "";
        }
        return nodes.item(0).getTextContent() == null ? "" : nodes.item(0).getTextContent().trim();
    }

    /**
     * 从候选值中返回第一个非空白字符串，没有可用值时返回空字符串。
     */
    private String firstText(String... values) {
        if (values == null) {
            return "";
        }
        return Arrays.stream(values).filter(StringUtils::hasText).findFirst().orElse("");
    }

    /**
     * 为有效的关注/扫码事件生成 OAuth 文本回复。
     *
     * <p>如果网页授权配置尚未完成，仍返回一条正常微信消息，避免微信因为业务配置
     * 错误不断重试事件；登录状态已经被正确记录，管理员补齐配置后可使用页面备用入口。</p>
     */
    private String buildWechatReply(WechatLoginEventRequest request, LoginStatusResponse status) {
        String event = firstText(request.event(), "").toUpperCase();
        boolean shouldAuthorize = "SUBSCRIBE".equals(event) || "SCAN".equals(event);
        if (!shouldAuthorize || status == null || (status.status() != LoginStatus.SUBSCRIBED && status.status() != LoginStatus.SCANNED) || !StringUtils.hasText(request.openid()) || !StringUtils.hasText(request.toUserName()) || !StringUtils.hasText(request.scene())) {
            return "success";
        }

        String content;
        try {
            String authorizeUrl = wechatApiClient.createOAuthAuthorizeUrl(request.scene());
            content = "请点击下面链接完成登录授权：\n" + authorizeUrl;
        } catch (ResponseStatusException error) {
            content = "登录授权配置尚未完成，请稍后再试。";
        }
        return textReply(request.openid(), request.toUserName(), content);
    }

    /**
     * 构造微信公众号明文模式下的文本消息响应。
     */
    private String textReply(String recipientOpenid, String accountOpenid, String content) {
        return "<xml>" + "<ToUserName>" + cdata(recipientOpenid) + "</ToUserName>" + "<FromUserName>" + cdata(accountOpenid) + "</FromUserName>" + "<CreateTime>" + Instant.now().getEpochSecond() + "</CreateTime>" + "<MsgType>" + cdata("text") + "</MsgType>" + "<Content>" + cdata(content) + "</Content>" + "</xml>";
    }

    /**
     * 将任意文本安全地放进 CDATA，避免授权地址中的特殊字符破坏 XML。
     */
    private String cdata(String value) {
        String safeValue = value == null ? "" : value.replace("]]>", "]]]]><![CDATA[>");
        return "<![CDATA[" + safeValue + "]]>";
    }

    /**
     * 计算 UTF-8 文本的 40 位小写 SHA-1 十六进制摘要。
     * 该算法只用于遵循微信既定的回调签名协议，不用于密码存储。
     */
    private String sha1Hex(String text) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringJoiner joiner = new StringJoiner("");
            for (byte b : bytes) {
                joiner.add(String.format("%02x", b));
            }
            return joiner.toString();
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "failed to calculate signature", error);
        }
    }
}
