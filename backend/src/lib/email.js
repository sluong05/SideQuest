// Single place for outbound mail: sender identity, site links, unsubscribe
// tokens and RFC 8058 one-click List-Unsubscribe headers.
const jwt = require('jsonwebtoken');
const { SITE_URL, EMAIL_FROM, API_PUBLIC_URL } = require('./siteConfig');

const BASE_STYLE = 'font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a2e;';
const BTN_STYLE = 'display:inline-block; background:#f59e0b; color:#1a1a2e; font-weight:bold; padding:12px 24px; border-radius:8px; text-decoration:none; margin:16px 0;';

// Resend's constructor throws without an API key, so create it lazily — the
// server must boot (and simply skip mail) when RESEND_API_KEY is unset.
let resendClient;
function getResend() {
  if (resendClient !== undefined) return resendClient;
  if (!process.env.RESEND_API_KEY) return null;
  const { Resend } = require('resend');
  resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

function isEmailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

// Unsubscribe tokens never expire (links in old emails must keep working) and
// carry `purpose` so the auth middleware never accepts them as a session.
function signUnsubscribeToken(userId) {
  return jwt.sign({ userId, purpose: 'unsub' }, process.env.JWT_SECRET);
}

// Returns the userId, or null for anything invalid / not an unsub token.
function verifyUnsubscribeToken(token) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 1000) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || decoded.purpose !== 'unsub' || !Number.isInteger(decoded.userId)) return null;
    return decoded.userId;
  } catch {
    return null;
  }
}

// The unsubscribe endpoint lives on the API (it must accept the provider's
// one-click POST), so these links use API_PUBLIC_URL rather than SITE_URL.
// The header form uses ?token= (headers aren't quoted-printable encoded); the
// body link uses the path form so no literal '=' reaches the HTML.
function unsubscribeHeaderUrl(userId) {
  return `${API_PUBLIC_URL}/api/auth/unsubscribe?token=${signUnsubscribeToken(userId)}`;
}
function unsubscribeLinkUrl(userId) {
  return `${API_PUBLIC_URL}/api/auth/unsubscribe/${signUnsubscribeToken(userId)}`;
}

function siteLink(path = '/') {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function button(href, label) {
  return `<a href="${href}" style="${BTN_STYLE}">${label}</a>`;
}

// Wraps body HTML in the standard layout. When unsubscribeUserId is given, a
// footer with a one-click unsubscribe link is appended.
function layout(innerHtml, { unsubscribeUserId, footerNote } = {}) {
  const note = footerNote ? `${footerNote}<br>` : '';
  const unsub = unsubscribeUserId
    ? `<a href="${unsubscribeLinkUrl(unsubscribeUserId)}" style="color:#666;">Unsubscribe from reminder emails</a> · <a href="${siteLink('/profile')}" style="color:#666;">Notification settings</a>`
    : '';
  const footer = note || unsub
    ? `<p style="color:#666; font-size:12px; margin-top:16px;">${note}${unsub}</p>`
    : '';
  return `<div style="${BASE_STYLE}">${innerHtml}${footer}</div>`;
}

/**
 * Send one email. `unsubscribeUserId` marks it as a reminder/notification mail:
 * it gets List-Unsubscribe + List-Unsubscribe-Post headers. Transactional mail
 * (verification, password reset) omits it. Returns false when mail is not
 * configured; throws on provider errors so callers can log.
 */
async function sendEmail({ to, subject, html, unsubscribeUserId }) {
  const resend = getResend();
  if (!resend) return false;
  const payload = { from: EMAIL_FROM, to, subject, html };
  if (unsubscribeUserId) {
    payload.headers = {
      'List-Unsubscribe': `<${unsubscribeHeaderUrl(unsubscribeUserId)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
  const result = await resend.emails.send(payload);
  if (result && result.error) {
    throw new Error(result.error.message || 'Resend send failed');
  }
  return true;
}

module.exports = {
  sendEmail,
  layout,
  button,
  siteLink,
  isEmailConfigured,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeHeaderUrl,
  unsubscribeLinkUrl,
  BASE_STYLE,
  BTN_STYLE,
};
