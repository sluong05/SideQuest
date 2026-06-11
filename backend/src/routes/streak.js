const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { localMidnightUTC, localDateString } = require('../lib/timezone');

const router = express.Router();

/**
 * Calculate the user's current streak.
 * A streak day = a day where all quests due that day were completed
 * AND no debt was created (or all debt was resolved same day).
 *
 * We look back day by day from yesterday and count consecutive clean days.
 * All day boundaries are computed in the user's stored timezone so that a
 * quest due at 11pm local is grouped under the correct calendar day.
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.userId;

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, streakShieldActive: true, maxStreak: true },
    });
    const tz = userRecord?.timezone || 'UTC';

    const now = new Date();
    const todayStr = localDateString(now, tz);
    const todayUTC = localMidnightUTC(todayStr, tz);

    const lookbackStart = new Date(todayUTC.getTime() - 365 * 24 * 60 * 60 * 1000);

    // All quests due in the last 365 days (by local calendar)
    const quests = await prisma.quest.findMany({
      where: {
        userId,
        dueDate: { gte: lookbackStart, lt: todayUTC },
      },
      include: { debt: true },
    });

    // Group quests by their LOCAL due date
    const byDay = {};
    for (const quest of quests) {
      const key = localDateString(new Date(quest.dueDate), tz);
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(quest);
    }

    // Walk backwards one local day at a time. Stepping back by subtracting 1ms
    // from each day's local midnight gives the last moment of the previous local
    // day — correctly handles DST transitions where days aren't exactly 24h.
    let streak = 0;
    let shieldConsumed = false;
    let curMidnight = todayUTC;
    for (let i = 0; i < 365; i++) {
      const prevMoment = new Date(curMidnight.getTime() - 1);
      const key = localDateString(prevMoment, tz);
      curMidnight = localMidnightUTC(key, tz);

      const dayQuests = byDay[key];
      if (!dayQuests || dayQuests.length === 0) continue;

      const allCompleted = dayQuests.every((t) => t.completed);
      const hasUnresolvedDebt = dayQuests.some((t) => t.debt && !t.debt.resolved);

      if (allCompleted && !hasUnresolvedDebt) {
        streak++;
      } else if (!shieldConsumed && userRecord.streakShieldActive) {
        shieldConsumed = true;
        streak++;
      } else {
        break;
      }
    }

    const updates = {};
    if (shieldConsumed) updates.streakShieldActive = false;
    if (streak > (userRecord.maxStreak ?? 0)) updates.maxStreak = streak;

    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: updates });
    }

    return res.json({ streak });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
