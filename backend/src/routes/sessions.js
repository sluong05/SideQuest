const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

const ACTIVITIES = ['fitness', 'focus', 'wellness', 'chores', 'custom'];

// POST /api/sessions — log a debt payoff activity and reduce debt
router.post('/', auth, async (req, res) => {
  // `pushupsCompleted` accepted as a legacy alias until all clients send `amount`
  const { activity } = req.body;
  const amount = req.body.amount ?? req.body.pushupsCompleted;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  const activityType = ACTIVITIES.includes(activity) ? activity : 'fitness';

  try {
    const floored = Math.floor(amount);

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { payoffMultiplierActive: true },
    });

    const session = await prisma.payoffSession.create({
      data: {
        amount: floored,
        activity: activityType,
        userId: req.userId,
      },
    });

    // If multiplier is active, each point counts as 2 for debt draining
    const drainPower = user.payoffMultiplierActive ? floored * 2 : floored;
    let remaining = drainPower;

    if (user.payoffMultiplierActive) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { payoffMultiplierActive: false },
      });
    }

    const debts = await prisma.debt.findMany({
      where: { resolved: false, userId: req.userId },
      orderBy: { createdAt: 'asc' },
    });

    for (const debt of debts) {
      if (remaining <= 0) break;

      if (remaining >= debt.amountOwed) {
        remaining -= debt.amountOwed;
        debt.amountOwed = 0;
        await prisma.debt.update({
          where: { id: debt.id },
          data: { amountOwed: 0, resolved: true },
        });
      } else {
        debt.amountOwed -= remaining;
        await prisma.debt.update({
          where: { id: debt.id },
          data: { amountOwed: debt.amountOwed },
        });
        remaining = 0;
      }
    }

    let coinsEarned = 0;
    if (remaining > 0) {
      // Coins earned from surplus points (after debt cleared), capped at the amount actually logged
      const surplus = Math.min(remaining, floored);
      coinsEarned = surplus;
      await prisma.user.update({
        where: { id: req.userId },
        data: { coins: { increment: coinsEarned } },
      });
    }

    const totalOwed = Math.ceil(debts.reduce((sum, d) => sum + d.amountOwed, 0));
    const multiplierUsed = user.payoffMultiplierActive;

    return res.status(201).json({
      session,
      totalOwed,
      coinsEarned,
      amountApplied: floored,
      multiplierUsed,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sessions — get payoff session history for the user
router.get('/', auth, async (req, res) => {
  try {
    const [sessions, aggregate] = await Promise.all([
      prisma.payoffSession.findMany({
        where: { userId: req.userId },
        orderBy: { date: 'desc' },
        take: 30,
      }),
      prisma.payoffSession.aggregate({
        where: { userId: req.userId },
        _sum: { amount: true },
      }),
    ]);

    const totalCompleted = sessions.reduce((sum, s) => sum + s.amount, 0);
    const allTimePaid = aggregate._sum.amount || 0;

    return res.json({ sessions, totalCompleted, allTimePaid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
