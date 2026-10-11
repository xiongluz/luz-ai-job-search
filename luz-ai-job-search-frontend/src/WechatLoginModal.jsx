import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  LOCAL_AUTH_BYPASS_ENABLED,
  createLocalDevSession,
  createWechatLoginQr,
  getWechatLoginStatus,
  getWechatOAuthUrl,
} from "./wechatLoginApi.js";

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(["SUCCESS", "EXPIRED", "INVALID"]);

const STATUS_COPY = {
  WAIT_SCAN: "等待微信扫码",
  SCANNED: "已识别扫码，请在微信中授权",
  SUBSCRIBED: "已关注公众号，请在微信中授权",
  AUTHORIZED: "授权完成，正在登录",
  SUCCESS: "登录成功",
  EXPIRED: "二维码已过期",
  INVALID: "登录会话无效",
};

function messageForError(error) {
  return error?.payload?.message || error?.message || "暂时无法连接登录服务";
}

/**
 * 微信扫码登录弹层。
 *
 * 未配置公众号时，后端会返回带 scene 的占位内容；组件在浏览器本地把它编码成
 * 演示二维码。配置 AppID 后，组件会自动优先展示微信返回的真实二维码图片。
 */
export default function WechatLoginModal({ onClose, onSuccess }) {
  const [qrcode, setQrcode] = useState(null);
  const [localQrUrl, setLocalQrUrl] = useState("");
  const [status, setStatus] = useState("LOADING");
  const [errorMessage, setErrorMessage] = useState("");
  const [authorizeUrl, setAuthorizeUrl] = useState("");
  const [authorizeError, setAuthorizeError] = useState("");
  const [authorizeLoading, setAuthorizeLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const successReportedRef = useRef(false);

  const loadQrcode = useCallback(async () => {
    setLoading(true);
    setQrcode(null);
    setLocalQrUrl("");
    setErrorMessage("");
    setAuthorizeUrl("");
    setAuthorizeError("");
    setStatus("LOADING");
    successReportedRef.current = false;

    try {
      if (LOCAL_AUTH_BYPASS_ENABLED) {
        const session = await createLocalDevSession();
        setStatus("SUCCESS");
        if (!successReportedRef.current) {
          successReportedRef.current = true;
          onSuccess?.({ ...session, status: "SUCCESS" });
        }
        return;
      }

      const result = await createWechatLoginQr();
      setQrcode(result);
      setStatus(result.status || "WAIT_SCAN");
    } catch (error) {
      setStatus("FAILED");
      setErrorMessage(messageForError(error));
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  useEffect(() => {
    loadQrcode();
  }, [loadQrcode]);

  useEffect(() => {
    if (!qrcode?.qrcodeContent || qrcode.qrcodeImageUrl) {
      setLocalQrUrl("");
      return undefined;
    }

    let cancelled = false;
    QRCode.toDataURL(qrcode.qrcodeContent, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#071a24", light: "#f7fbf9" },
    })
      .then((url) => {
        if (!cancelled) setLocalQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("FAILED");
          setErrorMessage("演示二维码生成失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrcode]);

  useEffect(() => {
    if (!qrcode?.scene) return undefined;

    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const result = await getWechatLoginStatus(qrcode.scene);
        if (cancelled) return;
        const payload = result?.data ?? result;
        const nextStatus = payload.status || "WAIT_SCAN";
        setStatus(nextStatus);
        if (nextStatus === "SUCCESS") {
          if (!successReportedRef.current) {
            successReportedRef.current = true;
            onSuccess?.(payload);
          }
          return;
        }
        if (!TERMINAL_STATUSES.has(nextStatus)) {
          timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (cancelled) return;
        setStatus("FAILED");
        setErrorMessage(messageForError(error));
      }
    }

    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [qrcode?.scene, onSuccess]);

  useEffect(() => {
    const canAuthorize = ["SCANNED", "SUBSCRIBED"].includes(status);
    if (!qrcode?.scene || !canAuthorize) {
      setAuthorizeUrl("");
      setAuthorizeError("");
      setAuthorizeLoading(false);
      return undefined;
    }

    let cancelled = false;
    setAuthorizeLoading(true);
    setAuthorizeError("");

    getWechatOAuthUrl(qrcode.scene)
      .then((result) => {
        if (cancelled) return;
        setAuthorizeUrl(result.authorizeUrl || "");
        if (!result.authorizeUrl) {
          setAuthorizeError("授权地址暂未生成，请查看微信消息或稍后重试");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAuthorizeUrl("");
          setAuthorizeError(messageForError(error));
        }
      })
      .finally(() => {
        if (!cancelled) setAuthorizeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [qrcode?.scene, status]);

  const qrImageUrl = qrcode?.qrcodeImageUrl || localQrUrl;
  const isRealWechatQr = Boolean(qrcode?.qrcodeImageUrl);
  const statusText = STATUS_COPY[status]
    || (status === "LOADING" ? "正在准备二维码" : "登录服务暂不可用");
  const canRefresh = ["EXPIRED", "FAILED", "INVALID"].includes(status);

  return (
    <div className="wechat-login-overlay" role="presentation">
      <section
        className="wechat-login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wechat-login-title"
      >
        <button
          className="wechat-login-close"
          type="button"
          onClick={onClose}
          aria-label="关闭登录窗口"
          title="关闭"
        >
          ×
        </button>

        <div className="wechat-login-heading">
          <span className="wechat-login-eyebrow">律动求职 · 安全登录</span>
          <h1 id="wechat-login-title">微信扫码登录</h1>
          <p>打开微信扫一扫，进入你的求职工作台。</p>
        </div>

        <div className={"wechat-qr-frame " + (qrImageUrl ? "has-image" : "is-empty")}>
          {qrImageUrl ? (
            <img src={qrImageUrl} alt="微信扫码登录二维码" />
          ) : (
            <div className="wechat-qr-empty" aria-live="polite">
              <span>{loading ? "正在加载" : "二维码暂不可用"}</span>
            </div>
          )}
          <span className="wechat-qr-corner corner-top-left" aria-hidden="true" />
          <span className="wechat-qr-corner corner-top-right" aria-hidden="true" />
          <span className="wechat-qr-corner corner-bottom-left" aria-hidden="true" />
          <span className="wechat-qr-corner corner-bottom-right" aria-hidden="true" />
        </div>

        <div className="wechat-login-status" aria-live="polite">
          <span className={"wechat-status-dot is-" + status.toLowerCase()} aria-hidden="true" />
          <strong>{statusText}</strong>
        </div>

        {isRealWechatQr ? (
          <p className="wechat-login-note">二维码来自微信公众号，可直接使用微信扫描。</p>
        ) : (
          <p className="wechat-login-note is-demo">当前为演示二维码，公众号配置完成后将自动替换。</p>
        )}

        {errorMessage && <p className="wechat-login-error">{errorMessage}</p>}

        {(status === "SCANNED" || status === "SUBSCRIBED") && (
          <div className="wechat-login-authorize" aria-live="polite">
            {authorizeLoading ? (
              <p>正在准备授权地址...</p>
            ) : authorizeUrl ? (
              <>
                <p>请在手机微信中点击公众号发来的授权链接。</p>
                <a href={authorizeUrl} target="_blank" rel="noreferrer">
                  在微信中打开授权页
                </a>
              </>
            ) : (
              <p>{authorizeError || "请在微信消息中点击授权链接"}</p>
            )}
          </div>
        )}

        {canRefresh && (
          <button className="wechat-login-refresh" type="button" onClick={loadQrcode} disabled={loading}>
            {loading ? "正在刷新" : "重新生成二维码"}
          </button>
        )}

        <div className="wechat-login-divider" aria-hidden="true"><span>微信登录</span></div>
        <small className="wechat-login-footer">首次使用将创建你的求职账号</small>
      </section>
    </div>
  );
}
