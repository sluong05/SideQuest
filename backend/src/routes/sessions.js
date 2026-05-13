const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// POST /api/sessions — log completed pushups and reduce debt
router.post('/', auth, async (req, res) => {
  const { pushupsCompleted } = req.body;

  if (!pushupsCompleted || pushupsCompleted <= 0) {
    return res.status(400).json({ error: 'pushupsCompleted must be a positive number' });
  }

  try {
    const floored = Math.floor(pushupsCompleted);

    const session = await prisma.pushupSession.create({
      data: {
        pushupsCompleted: floored,
        userId: req.userId,
      },
    });

    let remaining = floored;

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
      coinsEarned = remaining;
      await prisma.user.update({
        where: { id: req.userId },
        data: { coins: { increment: coinsEarned } },
      });
    }

    const totalOwed = Math.ceil(debts.reduce((sum, d) => sum + d.pushupsOwed, 0));

    return res.status(201).json({ session, totalOwed, coinsEarned, pushupsApplied: floored - remaining });
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
