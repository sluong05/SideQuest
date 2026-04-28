const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

function maskEmail(email) {
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name[0]}${name[1]}***@${domain}`;
}

// GET /api/leaderboard — users sorted by lowest total pushup debt
router.get('/', auth, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
        pushupDebts: {
          where: { resolved: false },
          select: { pushupsOwed: true },
        },
        pushupSessions: {
          select: { pushupsCompleted: true },
        },
      },
    });

    const leaderboard = users.map((user) => {
      const totalDebt = user.pushupDebts.reduce((sum, d) => sum + d.pushupsOwed, 0);

      const totalCompleted = user.pushupSessions.reduce(
        (sum, s) => sum + s.pushupsCompleted,
        0
      );

      return {
        id: user.id,
        username: user.username || maskEmail(user.email),
        totalDebt: Math.ceil(totalDebt),
        totalCompleted,
        memberSince: user.createdAt,
      };
    });

    // Sort by lowest debt first, then by most pushups completed as tiebreaker
    leaderboard.sort((a, b) => {
      if (a.totalDebt !== b.totalDebt) return a.totalDebt - b.totalDebt;
      return b.totalCompleted - a.totalCompleted;
    });

    return res.json({ leaderboard });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
