const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { getFriendIds } = require('./friends');

const router = express.Router();

function maskEmail(email) {
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name[0]}${name[1]}***@${domain}`;
}

// GET /api/leaderboard?friends=true
// Ranked by: 1) most quests completed in last 7 days  2) clean (no debt)  3) lowest debt  4) most debt paid
router.get('/', auth, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const friendsOnly = req.query.friends === 'true';

    let userFilter = {};
    if (friendsOnly) {
      const friendIds = await getFriendIds(req.userId);
      userFilter = { id: { in: [req.userId, ...friendIds] } };
    }

    const users = await prisma.user.findMany({
      where: userFilter,
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
        totalQuestsCompleted: true,
        avatar: true,
        xp: true,
        level: true,
        maxStreak: true,
        coins: true,
        debts: {
          where: { resolved: false },
          select: { amountOwed: true },
        },
        payoffSessions: {
          select: { amount: true },
        },
        quests: {
          where: { completed: true, completedAt: { gte: sevenDaysAgo } },
          select: { id: true },
        },
      },
    });

    const leaderboard = users.map((user) => {
      const totalDebt = user.debts.reduce((sum, d) => sum + d.amountOwed, 0);
      const totalPaid = user.payoffSessions.reduce((sum, s) => sum + s.amount, 0);
      const questsCompleted7d = user.quests.length;

      return {
        id: user.id,
        username: user.username || maskEmail(user.email),
        totalDebt: Math.ceil(totalDebt),
        totalPaid,
        questsCompleted7d,
        totalQuestsCompleted: user.totalQuestsCompleted,
        memberSince: user.createdAt,
        avatar: user.avatar || null,
        xp: user.xp ?? 0,
        level: user.level ?? 1,
        maxStreak: user.maxStreak ?? 0,
        coins: user.coins ?? 0,
      };
    });

    leaderboard.sort((a, b) => {
      // 1. Most quests completed in last 7 days
      if (a.questsCompleted7d !== b.questsCompleted7d) return b.questsCompleted7d - a.questsCompleted7d;
      // 2. Clean (zero debt) comes first
      const aClean = a.totalDebt === 0 ? 0 : 1;
      const bClean = b.totalDebt === 0 ? 0 : 1;
      if (aClean !== bClean) return aClean - bClean;
      // 3. Lower debt is better
      if (a.totalDebt !== b.totalDebt) return a.totalDebt - b.totalDebt;
      // 4. More debt paid is better
      return b.totalPaid - a.totalPaid;
    });

    return res.json({ leaderboard });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
