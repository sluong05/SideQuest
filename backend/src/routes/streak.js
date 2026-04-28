const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

/**
 * Calculate the user's current streak.
 * A streak day = a day where all tasks due that day were completed
 * AND no pushup debt was created (or all debt was resolved same day).
 *
 * We look back day by day from yesterday and count consecutive clean days.
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lookbackStart = new Date(today);
    lookbackStart.setDate(today.getDate() - 365);

    // Single query: all tasks due in the last 365 days
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        dueDate: { gte: lookbackStart, lt: today },
      },
      include: { pushupDebt: true },
    });

    // Group tasks by day (YYYY-MM-DD key)
    const byDay = {};
    for (const task of tasks) {
      const key = new Date(task.dueDate).toISOString().split('T')[0];
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(task);
    }

    // Walk backwards day by day and count consecutive clean days
    let streak = 0;
    for (let i = 1; i <= 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().split('T')[0];

      const dayTasks = byDay[key];
      if (!dayTasks || dayTasks.length === 0) continue;

      const allCompleted = dayTasks.every((t) => t.completed);
      const hasUnresolvedDebt = dayTasks.some((t) => t.pushupDebt && !t.pushupDebt.resolved);

      if (allCompleted && !hasUnresolvedDebt) {
        streak++;
      } else {
        break;
      }
    }

    return res.json({ streak });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
