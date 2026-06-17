const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

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
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
