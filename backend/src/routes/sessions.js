const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/sessions — log completed pushups and reduce debt
router.post('/', auth, async (req, res) => {
  const { pushupsCompleted } = req.body;

  if (!pushupsCompleted || pushupsCompleted <= 0) {
    return res.status(400).json({ error: 'pushupsCompleted must be a positive number' });
  }

  try {
    // Log the session
    const session = await prisma.pushupSession.create({
      data: {
        pushupsCompleted: Math.floor(pushupsCompleted),
        userId: req.userId,
      },
    });

    // Apply pushups to oldest unresolved debts first
    let remaining = pushupsCompleted;

    const debts = await prisma.pushupDebt.findMany({
      where: {
        resolved: false,
        userId: req.userId,
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const debt of debts) {
      if (remaining <= 0) break;

      if (remaining >= debt.pushupsOwed) {
        remaining -= debt.pushupsOwed;
        await prisma.pushupDebt.update({
          where: { id: debt.id },
          data: { pushupsOwed: 0, resolved: true },
        });
      } else {
        await prisma.pushupDebt.update({
          where: { id: debt.id },
          data: { pushupsOwed: debt.pushupsOwed - remaining },
        });
        remaining = 0;
      }
    }

    // Get updated total
    const updatedDebts = await prisma.pushupDebt.findMany({
      where: {
        resolved: false,
        userId: req.userId,
      },
    });
    const totalOwed = Math.ceil(updatedDebts.reduce((sum, d) => sum + d.pushupsOwed, 0));

    return res.status(201).json({ session, totalOwed, pushupsApplied: pushupsCompleted - Math.max(remaining, 0) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sessions — get pushup session history for the user
router.get('/', auth, async (req, res) => {
  try {
    const sessions = await prisma.pushupSession.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      take: 30,
    });

    const totalCompleted = sessions.reduce((sum, s) => sum + s.pushupsCompleted, 0);

    return res.json({ sessions, totalCompleted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
