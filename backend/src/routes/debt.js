const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { calculateAndUpdateDebt } = require('../jobs/dailyDebt');

const router = express.Router();

// GET /api/debt — get all unresolved debt for the user
router.get('/', auth, async (req, res) => {
  try {
    const debts = await prisma.debt.findMany({
      where: {
        resolved: false,
        userId: req.userId,
      },
      include: { quest: true },
      orderBy: { createdAt: 'asc' },
    });

    const totalOwed = debts.reduce((sum, d) => sum + d.amountOwed, 0);

    // Null out the quest reference for soft-deleted quests so the frontend
    // groups them under "Deleted quests" rather than showing a stale quest name.
    const sanitised = debts.map((d) => ({
      ...d,
      quest: d.quest?.deletedAt ? null : d.quest,
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
