const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/users/:username — public profile, only visible to friends or self
router.get('/:username', auth, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        id: true,
        username: true,
        createdAt: true,
        maxStreak: true,
        totalTasksCompleted: true,
        bio: true,
        avatar: true,
        pushupDebts: { where: { resolved: false }, select: { pushupsOwed: true } },
        pushupSessions: { select: { pushupsCompleted: true } },
      },
    });

    if (!target) return res.status(404).json({ error: 'User not found' });

    const totalDebt = Math.ceil(target.pushupDebts.reduce((s, d) => s + d.pushupsOwed, 0));
    const totalPushups = target.pushupSessions.reduce((s, s2) => s + s2.pushupsCompleted, 0);

    return res.json({
      user: {
        id: target.id,
        username: target.username,
        memberSince: target.createdAt,
        maxStreak: target.maxStreak,
        totalTasksCompleted: target.totalTasksCompleted,
        totalDebt,
        totalPushups,
        bio: target.bio,
        avatar: target.avatar,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
