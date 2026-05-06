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
// Ranked by: 1) most tasks completed in last 7 days  2) clean (no debt)  3) lowest debt  4) most pushups done
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
        totalTasksCompleted: true,
        pushupDebts: {
          where: { resolved: false },
          select: { pushupsOwed: true },
        },
        pushupSessions: {
          select: { pushupsCompleted: true },
        },
        tasks: {
          where: { completed: true, completedAt: { gte: sevenDaysAgo } },
          select: { id: true },
        },
      },
    });

    const leaderboard = users.map((user) => {
      const totalDebt = user.pushupDebts.reduce((sum, d) => sum + d.pushupsOwed, 0);
      const totalPushups = user.pushupSessions.reduce((sum, s) => sum + s.pushupsCompleted, 0);
      const tasksCompleted7d = user.tasks.length;

      return {
        id: user.id,
        username: user.username || maskEmail(user.email),
        totalDebt: Math.ceil(totalDebt),
        totalPushups,
        tasksCompleted7d,
        totalTasksCompleted: user.totalTasksCompleted,
        memberSince: user.createdAt,
      };
    });

    leaderboard.sort((a, b) => {
      // 1. Most tasks completed in last 7 days
      if (a.tasksCompleted7d !== b.tasksCompleted7d) return b.tasksCompleted7d - a.tasksCompleted7d;
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
