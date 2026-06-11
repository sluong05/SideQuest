const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

const ACTIVITIES = ['fitness', 'focus', 'wellness', 'chores', 'custom'];

// POST /api/sessions — log a debt payoff activity and reduce debt
router.post('/', auth, async (req, res) => {
  const { pushupsCompleted, activity } = req.body;

  if (!pushupsCompleted || pushupsCompleted <= 0) {
    return res.status(400).json({ error: 'pushupsCompleted must be a positive number' });
  }
  const activityType = ACTIVITIES.includes(activity) ? activity : 'fitness';

  try {
    const floored = Math.floor(pushupsCompleted);

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { pushupMultiplierActive: true },
    });

    const session = await prisma.pushupSession.create({
      data: {
        pushupsCompleted: floored,
        activity: activityType,
        userId: req.userId,
      },
    });

    // If multiplier is active, each pushup counts as 2 for debt draining
    const drainPower = user.pushupMultiplierActive ? floored * 2 : floored;
    let remaining = drainPower;

    if (user.pushupMultiplierActive) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { pushupMultiplierActive: false },
      });
    }

    const debts = await prisma.pushupDebt.findMany({
      where: { resolved: false, userId: req.userId },
      orderBy: { createdAt: 'asc' },
    });

    for (const debt of debts) {
      if (remaining <= 0) break;

      if (remaining >= debt.pushupsOwed) {
        remaining -= debt.pushupsOwed;
        debt.pushupsOwed = 0;
        await prisma.pushupDebt.update({
          where: { id: debt.id },
          data: { pushupsOwed: 0, resolved: true },
        });
      } else {
        debt.pushupsOwed -= remaining;
        await prisma.pushupDebt.update({
          where: { id: debt.id },
          data: { pushupsOwed: debt.pushupsOwed },
        });
        remaining = 0;
      }
    }

    let coinsEarned = 0;
    if (remaining > 0) {
      // Coins earned from surplus pushups (after debt cleared), capped at actual reps done
      const surplus = Math.min(remaining, floored);
      coinsEarned = surplus;
      await prisma.user.update({
        where: { id: req.userId },
        data: { coins: { increment: coinsEarned } },
      });
    }

    const totalOwed = Math.ceil(debts.reduce((sum, d) => sum + d.pushupsOwed, 0));
    const multiplierUsed = user.pushupMultiplierActive;

    return res.status(201).json({
      session,
      totalOwed,
      coinsEarned,
      pushupsApplied: floored,
      multiplierUsed,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sessions — get pushup session history for the user
router.get('/', auth, async (req, res) => {
  try {
    const [sessions, aggregate] = await Promise.all([
      prisma.pushupSession.findMany({
        where: { userId: req.userId },
        orderBy: { date: 'desc' },
        take: 30,
      }),
      prisma.pushupSession.aggregate({
        where: { userId: req.userId },
        _sum: { pushupsCompleted: true },
      }),
    ]);

    const totalCompleted = sessions.reduce((sum, s) => sum + s.pushupsCompleted, 0);
    const allTimePushups = aggregate._sum.pushupsCompleted || 0;

    return res.json({ sessions, totalCompleted, allTimePushups });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
