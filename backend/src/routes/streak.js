const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { refreshStreak } = require('../lib/streak');

const router = express.Router();

/**
 * GET /api/streak — the user's current streak (rules in src/lib/streak.js).
 * Computed from QuestCompletion history + quests due each local day in the
 * user's timezone; caches User.currentStreak / maxStreak and persists Streak
 * Shield consumption in User.streakShieldDate.
 */
router.get('/', auth, async (req, res) => {
  try {
    const { streak, graceUsedThisWeek } = await refreshStreak(prisma, req.userId);
    return res.json({ streak, graceUsedThisWeek });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
