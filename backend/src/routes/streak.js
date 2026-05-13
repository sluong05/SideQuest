const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { localMidnightUTC, localDateString } = require('../lib/timezone');

const router = express.Router();

/**
 * Calculate the user's current streak.
 * A streak day = a day where all tasks due that day were completed
 * AND no pushup debt was created (or all debt was resolved same day).
 *
 * We look back day by day from yesterday and count consecutive clean days.
 * All day boundaries are computed in the user's stored timezone so that a
 * task due at 11pm local is grouped under the correct calendar day.
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

    // All tasks due in the last 365 days (by local calendar)
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        dueDate: { gte: lookbackStart, lt: todayUTC },
      },
      include: { pushupDebt: true },
    });

    // Group tasks by their LOCAL due date
    const byDay = {};
    for (const task of tasks) {
      const key = localDateString(new Date(task.dueDate), tz);
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(task);
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

      const dayTasks = byDay[key];
      if (!dayTasks || dayTasks.length === 0) continue;

      const allCompleted = dayTasks.every((t) => t.completed);
      const hasUnresolvedDebt = dayTasks.some((t) => t.pushupDebt && !t.pushupDebt.resolved);

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
