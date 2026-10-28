const express = require('express');
const prisma = require('../lib/prisma');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const { avatarUrl } = require('../lib/siteConfig');

const router = express.Router();

const AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);

// Decodes a stored "data:image/...;base64,..." avatar. Returns
// { contentType, buffer } or null when missing/unsupported. SVG and other types
// are refused so a stored avatar can never be served as active content.
function decodeAvatarDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:(image\/[a-z0-9.+-]+)(;[^,]*)?,(.*)$/is.exec(dataUrl);
  if (!m) return null;
  let contentType = m[1].toLowerCase();
  if (!AVATAR_TYPES.has(contentType)) return null;
  if (contentType === 'image/jpg') contentType = 'image/jpeg';
  const isBase64 = /;base64/i.test(m[2] || '');
  let buffer;
  try {
    buffer = isBase64 ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'binary');
  } catch {
    return null;
  }
  if (buffer.length === 0) return null;
  return { contentType, buffer };
}

function avatarEtag(buffer) {
  return `"${crypto.createHash('sha1').update(buffer).digest('hex')}"`;
}

// GET /api/users/:id/avatar — no auth; the stored avatar as a cacheable image.
// Registered before '/:username' so a numeric id + '/avatar' never hits it.
router.get('/:id(\\d+)/avatar', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) return res.status(404).end();
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { avatar: true } });
    const decoded = user && decodeAvatarDataUrl(user.avatar);
    if (!decoded) return res.status(404).json({ error: 'Avatar not found' });

    const etag = avatarEtag(decoded.buffer);
    res.set({
      'Cache-Control': 'public, max-age=86400',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return res.type(decoded.contentType).send(decoded.buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/public/:username — no auth; share-card / OG profile data.
// Only competition-facing stats — never email, debt or account fields.
router.get('/public/:username', async (req, res) => {
  const username = String(req.params.username || '');
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(404).json({ error: 'User not found' });
  try {
    const u = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true, username: true, bio: true, level: true, xp: true,
        currentStreak: true, maxStreak: true, totalQuestsCompleted: true, createdAt: true,
        avatar: true,
      },
    });
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({
      username: u.username,
      bio: u.bio,
      avatarUrl: avatarUrl(u.id, !!u.avatar),
      level: u.level,
      xp: u.xp,
      currentStreak: u.currentStreak,
      maxStreak: u.maxStreak,
      totalQuestsCompleted: u.totalQuestsCompleted,
      joinedAt: u.createdAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/:username — public profile card, visible to any authenticated
// user (the leaderboard links every player's profile). Only non-sensitive,
// competition-facing stats are exposed here — never email or account fields.
router.get('/:username', auth, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        id: true,
        username: true,
        createdAt: true,
        maxStreak: true,
        totalQuestsCompleted: true,
        bio: true,
        avatar: true,
        debts: { where: { resolved: false }, select: { amountOwed: true } },
        payoffSessions: { select: { amount: true } },
      },
    });

    if (!target) return res.status(404).json({ error: 'User not found' });

    const totalDebt = Math.ceil(target.debts.reduce((s, d) => s + d.amountOwed, 0));
    const totalPaid = target.payoffSessions.reduce((s, s2) => s + s2.amount, 0);

    return res.json({
      user: {
        id: target.id,
        username: target.username,
        memberSince: target.createdAt,
        maxStreak: target.maxStreak,
        totalQuestsCompleted: target.totalQuestsCompleted,
        totalDebt,
        totalPaid,
        bio: target.bio,
        avatar: target.avatar,
        avatarUrl: avatarUrl(target.id, !!target.avatar),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.decodeAvatarDataUrl = decodeAvatarDataUrl;
