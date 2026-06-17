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
    description,
    dueDate,
    recurrence = 'none',
    category = 'other',
    difficulty = 'medium',
    debtType = 'pushups',
    debtAmount = 5,
  } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (title.trim().length > 200) {
    return res.status(400).json({ error: 'Title must be 200 characters or fewer' });
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return res.status(400).json({ error: 'description must be a string' });
  }
  if (typeof description === 'string' && description.length > 2000) {
    return res.status(400).json({ error: 'Description must be 2000 characters or fewer' });
  }

  const validRecurrences = ['none', 'daily', 'weekly'];
  if (!validRecurrences.includes(recurrence)) {
    return res.status(400).json({ error: 'Invalid recurrence value' });
  }

  const validCategories = ['fitness', 'learning', 'focus', 'productivity', 'wellness', 'chores', 'other'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  const validDifficulties = ['easy', 'medium', 'hard'];
  if (!validDifficulties.includes(difficulty)) {
    return res.status(400).json({ error: 'Invalid difficulty' });
  }

  const validDebtTypes = ['pushups', 'custom', 'fitness', 'focus', 'wellness', 'chores'];
  if (!validDebtTypes.includes(debtType)) {
    return res.status(400).json({ error: 'Invalid debt type' });
  }

  const debtAmountNum = Number(debtAmount);
  if (!Number.isFinite(debtAmountNum) || debtAmountNum < 0 || debtAmountNum > 1000) {
    return res.status(400).json({ error: 'debtAmount must be a number between 0 and 1000' });
  }

  // Reject invalid/unparseable due dates rather than silently storing "Invalid Date".
  if (dueDate !== undefined && dueDate !== null && Number.isNaN(new Date(dueDate).getTime())) {
    return res.status(400).json({ error: 'Invalid dueDate' });
  }

  const xpByDifficulty = { easy: 25, medium: 50, hard: 100 };
  const xpReward = xpByDifficulty[difficulty] ?? 50;

  try {
    const due = dueDate ? new Date(dueDate) : new Date();

    const trimmedDesc = typeof description === 'string' ? description.trim() : '';

    const quest = await prisma.quest.create({
      data: {
        title: title.trim(),
        description: trimmedDesc === '' ? null : trimmedDesc,
        dueDate: due,
        recurrence,
        userId: req.userId,
        category,
        difficulty,
        xpReward,
        debtType,
        debtAmount: debtAmountNum,
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

// PATCH /api/quests/:id — edit a quest's description (only the description is editable)
router.patch('/:id', auth, async (req, res) => {
  const questId = parseInt(req.params.id, 10);
  if (Number.isNaN(questId)) return res.status(400).json({ error: 'Invalid quest id' });
  const { description } = req.body;

  if (description !== undefined && description !== null && typeof description !== 'string') {
    return res.status(400).json({ error: 'description must be a string' });
  }
  if (typeof description === 'string' && description.length > 2000) {
    return res.status(400).json({ error: 'Description must be 2000 characters or fewer' });
  }

  try {
    const quest = await prisma.quest.findUnique({ where: { id: questId } });

    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    if (quest.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const trimmedDesc = typeof description === 'string' ? description.trim() : '';

    const updated = await prisma.quest.update({
      where: { id: questId },
      data: { description: trimmedDesc === '' ? null : trimmedDesc },
      include: { debt: true },
    });

    return res.json({ quest: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/quests/:id/complete — mark quest as complete, award XP
router.patch('/:id/complete', auth, async (req, res) => {
  const questId = parseInt(req.params.id, 10);
  if (Number.isNaN(questId)) return res.status(400).json({ error: 'Invalid quest id' });

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
  if (Number.isNaN(questId)) return res.status(400).json({ error: 'Invalid quest id' });

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
  if (Number.isNaN(questId)) return res.status(400).json({ error: 'Invalid quest id' });

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
