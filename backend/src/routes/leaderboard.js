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
//
// The global board is capped at the top N profiles (plus the requesting user, so
// they always see their own row). Per-user metrics are computed with aggregate
// groupBy queries rather than pulling every debt/session/quest row — otherwise the
// response grew unbounded with the number of stored sessions and inline avatars.
const TOP_N = 100;

router.get('/', auth, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const friendsOnly = req.query.friends === 'true';

    const userSelect = {
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
    };

    let userWhere = {};
    if (friendsOnly) {
      const friendIds = await getFriendIds(req.userId);
      userWhere = { id: { in: [req.userId, ...friendIds] } };
    }

    const users = await prisma.user.findMany({
      where: userWhere,
      orderBy: { totalQuestsCompleted: 'desc' },
      // Friends lists are naturally small; only the global board needs a cap.
      take: friendsOnly ? undefined : TOP_N,
      select: userSelect,
    });

    // Guarantee the current user is in the set even if they fall outside the top N.
    if (!users.some((u) => u.id === req.userId)) {
      const me = await prisma.user.findUnique({ where: { id: req.userId }, select: userSelect });
      if (me) users.push(me);
    }

    const ids = users.map((u) => u.id);

    // Aggregate the three metrics for just this bounded set of users.
    const [debtAgg, paidAgg, questAgg] = await Promise.all([
      prisma.debt.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, resolved: false },
        _sum: { amountOwed: true },
      }),
      prisma.payoffSession.groupBy({
        by: ['userId'],
        where: { userId: { in: ids } },
        _sum: { amount: true },
      }),
      prisma.quest.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, completed: true, completedAt: { gte: sevenDaysAgo } },
        _count: true,
      }),
    ]);

    const debtMap = new Map(debtAgg.map((d) => [d.userId, d._sum.amountOwed || 0]));
    const paidMap = new Map(paidAgg.map((p) => [p.userId, p._sum.amount || 0]));
    const questMap = new Map(questAgg.map((q) => [q.userId, q._count]));

    const leaderboard = users.map((user) => ({
      id: user.id,
      username: user.username || maskEmail(user.email),
      totalDebt: Math.ceil(debtMap.get(user.id) || 0),
      totalPaid: paidMap.get(user.id) || 0,
      questsCompleted7d: questMap.get(user.id) || 0,
      totalQuestsCompleted: user.totalQuestsCompleted,
      memberSince: user.createdAt,
      avatar: user.avatar || null,
      xp: user.xp ?? 0,
      level: user.level ?? 1,
      maxStreak: user.maxStreak ?? 0,
      coins: user.coins ?? 0,
    }));

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
