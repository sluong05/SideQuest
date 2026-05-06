const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

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
