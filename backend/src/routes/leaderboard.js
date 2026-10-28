const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { getFriendIds, hasAvatarMap } = require('./friends');
const { Prisma } = require('@prisma/client');
const { avatarUrl, MIN_QUEST_AGE_SECONDS, DAILY_COMPLETION_CAP } = require('../lib/siteConfig');

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

// Credited completions since `since`, per user. QuestCompletion has a row for
// every completion (credited or not), so the credit rules from the quest
// completion route are re-applied here: the quest must have been at least
// MIN_QUEST_AGE_SECONDS old when completed, and at most DAILY_COMPLETION_CAP
// completions count per user per local day. Returns [{ userId, count }] sorted
// by count desc. `userIds` (optional) restricts the set; `limit` caps rows.
async function creditedCompletionCounts(since, { userIds, limit } = {}) {
  if (userIds && userIds.length === 0) return [];
  const userFilter = userIds ? Prisma.sql`AND qc."userId" IN (${Prisma.join(userIds)})` : Prisma.empty;
  const limitSql = limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    WITH per_day AS (
      SELECT qc."userId" AS "userId", qc."localDate", COUNT(*)::int AS n
      FROM "QuestCompletion" qc
      JOIN "Task" t ON t."id" = qc."questId"
      WHERE qc."completedAt" >= ${since}
        AND qc."completedAt" >= t."createdAt" + (${MIN_QUEST_AGE_SECONDS}::int * INTERVAL '1 second')
        ${userFilter}
      GROUP BY qc."userId", qc."localDate"
    )
    SELECT "userId", SUM(LEAST(n, ${DAILY_COMPLETION_CAP}::int))::int AS count
    FROM per_day
    GROUP BY "userId"
    ORDER BY count DESC, "userId" ASC
    ${limitSql}`;
  return rows.map((r) => ({ userId: Number(r.userId), count: Number(r.count) }));
}

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
      xp: true,
      level: true,
      maxStreak: true,
      coins: true,
    };

    // 7-day completions come from QuestCompletion (one row per quest per local
    // day; uncompleting removes it), so recurring quests count every day they
    // were done — Quest.completedAt only remembers the latest completion. Only
    // credited completions count (see creditedCompletionCounts).
    let users;
    if (friendsOnly) {
      const friendIds = await getFriendIds(req.userId);
      users = await prisma.user.findMany({
        where: { id: { in: [req.userId, ...friendIds] } },
        select: userSelect,
      });
    } else {
      // Global board: the top N by 7-day completions, topped up with all-time
      // leaders when fewer than N users completed anything this week.
      const top = await creditedCompletionCounts(sevenDaysAgo, { limit: TOP_N });
      const topIds = top.map((t) => t.userId);
      users = topIds.length
        ? await prisma.user.findMany({ where: { id: { in: topIds } }, select: userSelect })
        : [];
      if (users.length < TOP_N) {
        const filler = await prisma.user.findMany({
          where: { id: { notIn: topIds } },
          orderBy: { totalQuestsCompleted: 'desc' },
          take: TOP_N - users.length,
          select: userSelect,
        });
        users.push(...filler);
      }
    }

    // Guarantee the current user is in the set even if they fall outside the top N.
    if (!users.some((u) => u.id === req.userId)) {
      const me = await prisma.user.findUnique({ where: { id: req.userId }, select: userSelect });
      if (me) users.push(me);
    }

    const ids = users.map((u) => u.id);

    // Aggregate the three metrics for just this bounded set of users.
    const [debtAgg, paidAgg, questAgg, avatars] = await Promise.all([
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
      creditedCompletionCounts(sevenDaysAgo, { userIds: ids }),
      hasAvatarMap(ids),
    ]);

    const debtMap = new Map(debtAgg.map((d) => [d.userId, d._sum.amountOwed || 0]));
    const paidMap = new Map(paidAgg.map((p) => [p.userId, p._sum.amount || 0]));
    const questMap = new Map(questAgg.map((q) => [q.userId, q.count]));

    const leaderboard = users.map((user) => ({
      id: user.id,
      username: user.username || maskEmail(user.email),
      totalDebt: Math.ceil(debtMap.get(user.id) || 0),
      totalPaid: paidMap.get(user.id) || 0,
      questsCompleted7d: questMap.get(user.id) || 0,
      totalQuestsCompleted: user.totalQuestsCompleted,
      memberSince: user.createdAt,
      avatar: null,
      avatarUrl: avatarUrl(user.id, avatars.get(user.id)),
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
