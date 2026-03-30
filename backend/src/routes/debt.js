const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const { calculateAndUpdateDebt } = require('../jobs/dailyDebt');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/debt — get all unresolved pushup debt for the user
router.get('/', auth, async (req, res) => {
  try {
    const debts = await prisma.pushupDebt.findMany({
      where: {
        resolved: false,
        userId: req.userId,
      },
      include: { task: true },
      orderBy: { createdAt: 'asc' },
    });

    const totalOwed = debts.reduce((sum, d) => sum + d.pushupsOwed, 0);

    return res.json({ debts, totalOwed: Math.ceil(totalOwed) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/debt/calculate — manually trigger debt calculation for testing
router.post('/calculate', auth, async (req, res) => {
  try {
    await calculateAndUpdateDebt(req.userId);
    return res.json({ message: 'Debt recalculated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/debt/summary — get debt summary stats for the dashboard
router.get('/summary', auth, async (req, res) => {
  try {
    const debts = await prisma.pushupDebt.findMany({
      where: {
        resolved: false,
        userId: req.userId,
      },
      include: { task: true },
    });

    const totalOwed = Math.ceil(debts.reduce((sum, d) => sum + d.pushupsOwed, 0));
    const overdueTaskCount = debts.length;
    const maxDaysOverdue = debts.reduce((max, d) => Math.max(max, d.daysOverdue), 0);

    return res.json({ totalOwed, overdueTaskCount, maxDaysOverdue });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
