const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// The server later POSTs to a stored push endpoint via web-push, so the endpoint
// is an SSRF sink. Require https and reject loopback/private/link-local hosts so a
// client can't point it at internal services or cloud metadata.
function isSafePushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '[::1]' || host === '::1') return false;
  if (/^127\./.test(host)) return false;            // loopback
  if (/^10\./.test(host)) return false;             // private
  if (/^192\.168\./.test(host)) return false;       // private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false; // private
  if (/^169\.254\./.test(host)) return false;       // link-local / cloud metadata
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return false; // IPv6 private/link-local
  return true;
}

// GET /api/push/vapid-public-key — returns the public key so the client can subscribe
router.get('/vapid-public-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
  return res.json({ publicKey: key });
});

// POST /api/push/subscribe — save a push subscription for the logged-in user
router.post('/subscribe', auth, async (req, res) => {
  const { endpoint, p256dh, auth: authKey } = req.body;
  if (!endpoint || !p256dh || !authKey) {
    return res.status(400).json({ error: 'endpoint, p256dh, and auth are required' });
  }
  if (!isSafePushEndpoint(endpoint)) {
    return res.status(400).json({ error: 'Invalid push endpoint' });
  }
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.userId, p256dh, auth: authKey },
      create: { userId: req.userId, endpoint, p256dh, auth: authKey },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/push/unsubscribe — remove a subscription
router.delete('/unsubscribe', auth, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.userId },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
