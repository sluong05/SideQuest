const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { calculateAndUpdateDebt } = require('../jobs/dailyDebt');
const { localMidnightUTC, localDateString } = require('../lib/timezone');

const router = express.Router();

// GET /api/quests — get all quests for the logged-in user
// ?date=YYYY-MM-DD        → quests due exactly on that day
// ?upToDate=YYYY-MM-DD   → all incomplete quests due on or before that day
//                           + quests completed on that day (dashboard view)
router.get('/', auth, async (req, res) => {
  try {
    const { date, upToDate } = req.query;
    let whereClause = { userId: req.userId, deletedAt: null };

    if (upToDate) {
      const userRecord = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { timezone: true },
      });
      const timezone = userRecord?.timezone || 'UTC';
      const dayStart = localMidnightUTC(upToDate, timezone);
      // Return: all incomplete quests (any due date) + quests completed today (local time)
      whereClause.OR = [
        { completed: false },
        { completed: true, completedAt: { gte: dayStart } },
      ];
    } else if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      whereClause.dueDate = { gte: start, lte: end };
    }

    const quests = await prisma.quest.findMany({
      where: whereClause,
      include: { debt: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ quests });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/quests — create a new quest
router.post('/', auth, async (req, res) => {
  const {
    title,
    dueDate,
    recurrence = 'none',
    category = 'other',
    difficulty = 'medium',
    debtType = 'pushups',
    debtAmount = 5,
  } = req.body;

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }

  const validRecurrences = ['none', 'daily', 'weekly'];
  if (!validRecurrences.includes(recurrence)) {
    return res.status(400).json({ error: 'Invalid recurrence value' });
  }

  const xpByDifficulty = { easy: 25, medium: 50, hard: 100 };
  const xpReward = xpByDifficulty[difficulty] ?? 50;

  try {
    const due = dueDate ? new Date(dueDate) : new Date();

    const quest = await prisma.quest.create({
      data: {
        title: title.trim(),
        dueDate: due,
        recurrence,
        userId: req.userId,
        category,
        difficulty,
        xpReward,
        debtType,
        debtAmount: Number(debtAmount),
      },
      include: { debt: true },
    });

    if (due < new Date()) {
      await calculateAndUpdateDebt(req.userId);
      const questWithDebt = await prisma.quest.findUnique({
        where: { id: quest.id },
        include: { debt: true },
      });
      return res.status(201).json({ quest: questWithDebt });
    }

    return res.status(201).json({ quest });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/quests/:id/complete — mark quest as complete, award XP
router.patch('/:id/complete', auth, async (req, res) => {
  const questId = parseInt(req.params.id, 10);

  try {
    const quest = await prisma.quest.findUnique({ where: { id: questId } });

    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    if (quest.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (quest.completed) return res.status(400).json({ error: 'Quest already completed' });

    const xpReward = quest.xpReward ?? 50;

    const [updated, updatedUser] = await prisma.$transaction([
      prisma.quest.update({
        where: { id: questId },
        data: { completed: true, completedAt: new Date() },
        include: { debt: true },
      }),
      prisma.user.update({
        where: { id: req.userId },
        data: {
          totalQuestsCompleted: { increment: 1 },
          xp: { increment: xpReward },
        },
      }),
    ]);

    // Recalculate level: every 500 XP = 1 level
    const newLevel = Math.floor(updatedUser.xp / 500) + 1;
    if (newLevel !== updatedUser.level) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { level: newLevel },
      });
    }

    return res.json({ quest: updated, xpEarned: xpReward });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/quests/:id/uncomplete — unmark quest as complete
// Only allowed on the same local day it was completed; after local midnight
// the completion locks (XP, streak, and stats are settled for that day).
router.patch('/:id/uncomplete', auth, async (req, res) => {
  const questId = parseInt(req.params.id, 10);

  try {
    const quest = await prisma.quest.findUnique({ where: { id: questId } });

    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    if (quest.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!quest.completed) return res.status(400).json({ error: 'Quest is not completed' });

    const userRecord = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { timezone: true },
    });
    const timezone = userRecord?.timezone || 'UTC';
    const todayStart = localMidnightUTC(localDateString(new Date(), timezone), timezone);
    if (quest.completedAt && quest.completedAt < todayStart) {
      return res.status(400).json({ error: 'Completed quests lock once the day ends and can no longer be undone' });
    }

    const [updated] = await prisma.$transaction([
      prisma.quest.update({
        where: { id: questId },
        data: { completed: false, completedAt: null },
        include: { debt: true },
      }),
      prisma.user.update({
        where: { id: req.userId },
        data: { totalQuestsCompleted: { decrement: 1 } },
      }),
    ]);

    return res.json({ quest: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/quests/:id — delete a quest
// Deleting an incomplete quest incurs a 5-pt debt penalty
router.delete('/:id', auth, async (req, res) => {
  const questId = parseInt(req.params.id, 10);

  try {
    const quest = await prisma.quest.findUnique({
      where: { id: questId },
      include: { debt: true },
    });

    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    if (quest.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const wasIncomplete = !quest.completed;
    const existingDebt = quest.debt;

    // Soft-delete: keep the row so completed quests remain countable in the leaderboard
    await prisma.quest.update({
      where: { id: questId },
      data: { deletedAt: new Date() },
    });

    if (wasIncomplete) {
      if (existingDebt) {
        // Orphan the debt (questId → null) so it groups under "Deleted quests", and add penalty
        await prisma.debt.update({
          where: { id: existingDebt.id },
          data: { questId: null, amountOwed: existingDebt.amountOwed + 5 },
        });
      } else {
        await prisma.debt.create({
          data: {
            questId: null,
            userId: req.userId,
            amountOwed: 5,
            daysOverdue: 1,
          },
        });
      }
    }

    return res.json({ message: 'Quest deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
