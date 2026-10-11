package com.luz.aiagent.user.login;

import jakarta.annotation.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * 微信公众平台服务器回调入口。
 *
 * <p>应用上下文路径为 {@code /api}，所以需要在公众号后台把服务器 URL 配置为
 * {@code https://你的域名/api/wechat/callback}。当前实现对应微信的明文模式：
 * 校验 {@code signature} 后直接解析 XML；兼容/安全模式所需的 msg_signature、
 * Encrypt 解密和响应加密尚未实现。</p>
 */
@RestController
@RequestMapping("/wechat/callback")
public class WechatCallbackController {
    /** 微信登录业务编排服务。 */
    @Resource
    private UserLoginService userLoginService;

    /**
     * 完成公众号后台首次配置时的服务器接入验证。
     *
     * <p>只有 token、timestamp、nonce 计算出的 SHA-1 与 signature 一致时，
     * 才原样返回 echostr；校验失败返回 HTTP 403。</p>
     *
     * @param signature 微信签名
     * @param timestamp 微信时间戳字符串
     * @param nonce 微信随机字符串
     * @param echostr 微信要求原样返回的校验字符串
     * @return 原始 echostr
     */
    @GetMapping(produces = MediaType.TEXT_PLAIN_VALUE)
    public String verify(
            @RequestParam String signature,
            @RequestParam String timestamp,
            @RequestParam String nonce,
            @RequestParam String echostr
    ) {
        if (!userLoginService.verifySignature(signature, timestamp, nonce)) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "signature verification failed");
        }
        return echostr;
    }

    /**
     * 接收微信推送的扫码、关注或取消关注事件。
     *
     * <p>先验证请求来源，再解析 XML、更新登录会话，并在关注/扫码事件中回复一条
     * 包含 OAuth 授权地址的文本消息。其他事件返回 {@code success}，告诉微信事件
     * 已经处理，避免因未收到约定响应而重复推送。</p>
     *
     * @param signature 微信签名
     * @param timestamp 微信时间戳字符串
     * @param nonce 微信随机字符串
     * @param body 微信发送的原始 XML
     * @return 无需回复时为 success；关注/扫码事件时为包含授权链接的 XML 文本消息
     */
    @PostMapping(produces = MediaType.TEXT_XML_VALUE)
    public ResponseEntity<String> receive(
            @RequestParam String signature,
            @RequestParam String timestamp,
            @RequestParam String nonce,
            @RequestBody String body
    ) {
        if (!userLoginService.verifySignature(signature, timestamp, nonce)) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "signature verification failed");
        }
        String reply = userLoginService.handleWechatEventAndReply(body);
        MediaType xmlUtf8 = MediaType.parseMediaType("text/xml; charset=UTF-8");
        return ResponseEntity.ok().contentType(xmlUtf8).body(reply);
    }
}
