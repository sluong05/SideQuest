const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

function maskEmail(email) {
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name[0]}${name[1]}***@${domain}`;
}

// GET /api/leaderboard
// Ranked by: 1) most tasks completed  2) clean (no debt)  3) lowest debt  4) most pushups done
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
        tasks: {
          where: { completed: true },
          select: { id: true },
        },
      },
    });

    const leaderboard = users.map((user) => {
      const totalDebt = user.pushupDebts.reduce((sum, d) => sum + d.pushupsOwed, 0);
      const totalPushups = user.pushupSessions.reduce((sum, s) => sum + s.pushupsCompleted, 0);
      const tasksCompleted = user.tasks.length;

      return {
        id: user.id,
        username: user.username || maskEmail(user.email),
        totalDebt: Math.ceil(totalDebt),
        totalPushups,
        tasksCompleted,
        memberSince: user.createdAt,
      };
    });

    leaderboard.sort((a, b) => {
      // 1. Most tasks completed
      if (a.tasksCompleted !== b.tasksCompleted) return b.tasksCompleted - a.tasksCompleted;
      // 2. Clean (zero debt) comes first
      const aClean = a.totalDebt === 0 ? 0 : 1;
      const bClean = b.totalDebt === 0 ? 0 : 1;
      if (aClean !== bClean) return aClean - bClean;
      // 3. Lower debt is better
      if (a.totalDebt !== b.totalDebt) return a.totalDebt - b.totalDebt;
      // 4. More pushups done is better
      return b.totalPushups - a.totalPushups;
    });

    return res.json({ leaderboard });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
