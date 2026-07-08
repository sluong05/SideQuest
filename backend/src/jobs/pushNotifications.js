const webpush = require('web-push');
const prisma = require('../lib/prisma');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:noreply@pushupdebt.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ── Web Push (VAPID) — used by the web app ──────────────────────────────────
async function sendWebPushToUser(userId, title, body, url) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url })
      );
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }
}

// ── APNs (token-based) — used by the native iOS app ─────────────────────────
// Env: APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_AUTH_KEY (.p8 contents,
// newlines may be escaped as \n), APNS_PRODUCTION ("true" for App Store/TestFlight).
let apnProvider;
function getApnProvider() {
  if (apnProvider !== undefined) return apnProvider;
  const { APNS_KEY_ID, APNS_TEAM_ID, APNS_AUTH_KEY } = process.env;
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_AUTH_KEY) {
    const missing = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_AUTH_KEY'].filter((k) => !process.env[k]);
    console.warn(`[Push] APNs disabled — missing env vars: ${missing.join(', ')}`);
    apnProvider = null;
    return apnProvider;
  }
  if (!process.env.APNS_BUNDLE_ID) {
    console.warn('[Push] APNS_BUNDLE_ID is not set — APNs sends will fail with MissingTopic');
  }
  try {
    const apn = require('@parse/node-apn');
    apnProvider = new apn.Provider({
      token: {
        key: APNS_AUTH_KEY.replace(/\\n/g, '\n'),
        keyId: APNS_KEY_ID,
        teamId: APNS_TEAM_ID,
      },
      production: process.env.APNS_PRODUCTION === 'true',
    });
  } catch (err) {
    console.error('[Push] Failed to init APNs provider:', err.message);
    apnProvider = null;
  }
  return apnProvider;
}

async function sendApnsToUser(userId, title, body, url) {
  const provider = getApnProvider();
  if (!provider) return;

  const tokens = await prisma.deviceToken.findMany({ where: { userId, platform: 'ios' } });
  if (tokens.length === 0) {
    console.log(`[Push] No iOS device tokens registered for user ${userId} — skipping APNs`);
    return;
  }

  const apn = require('@parse/node-apn');
  const note = new apn.Notification();
  note.alert = { title, body };
  note.sound = 'default';
  note.topic = process.env.APNS_BUNDLE_ID; // e.g. com.sidequest.app
  note.payload = { url };

  for (const t of tokens) {
    try {
      const result = await provider.send(note, t.token);
      for (const failure of result.failed || []) {
        const reason = (failure.response && failure.response.reason) || failure.error?.message || 'unknown';
        console.error(`[Push] APNs rejected token ...${t.token.slice(-8)}: status=${failure.status} reason=${reason}`);
        if (String(failure.status) === '410' || reason === 'BadDeviceToken' || reason === 'Unregistered') {
          await prisma.deviceToken.delete({ where: { token: t.token } }).catch(() => {});
        }
      }
      if ((result.sent || []).length > 0) {
        console.log(`[Push] APNs delivered to ...${t.token.slice(-8)}`);
      }
    } catch (err) {
      console.error('[Push] APNs send error:', err.message);
    }
  }
}

// Fan out to both transports. Each is independently gated on its own config so a
// missing VAPID key never blocks APNs (and vice-versa).
async function sendPushToUser(userId, title, body, url = '/') {
  await Promise.all([
    sendWebPushToUser(userId, title, body, url),
    sendApnsToUser(userId, title, body, url),
  ]);
}

module.exports = { sendPushToUser };
