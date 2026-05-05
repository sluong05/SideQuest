const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { calculateAndUpdateDebt } = require('../jobs/dailyDebt');

const router = express.Router();

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

    // Null out the task reference for soft-deleted tasks so the frontend
    // groups them under "Deleted tasks" rather than showing a stale task name.
    const sanitised = debts.map((d) => ({
      ...d,
      task: d.task?.deletedAt ? null : d.task,
    }));

    return res.json({ debts: sanitised, totalOwed: Math.ceil(totalOwed) });
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

module.exports = router;
