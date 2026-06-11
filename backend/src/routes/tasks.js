const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { calculateAndUpdateDebt } = require('../jobs/dailyDebt');
const { localMidnightUTC } = require('../lib/timezone');

const router = express.Router();

// GET /api/tasks — get all tasks for the logged-in user
// ?date=YYYY-MM-DD        → tasks due exactly on that day
// ?upToDate=YYYY-MM-DD   → all incomplete tasks due on or before that day
//                           + tasks completed on that day (dashboard view)
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
      // Return: all incomplete tasks (any due date) + tasks completed today (local time)
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

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: { pushupDebt: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ tasks });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks — create a new quest
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

    const task = await prisma.task.create({
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
      include: { pushupDebt: true },
    });

    if (due < new Date()) {
      await calculateAndUpdateDebt(req.userId);
      const taskWithDebt = await prisma.task.findUnique({
        where: { id: task.id },
        include: { pushupDebt: true },
      });
      return res.status(201).json({ task: taskWithDebt });
    }

    return res.status(201).json({ task });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/tasks/:id/complete — mark quest as complete, award XP
router.patch('/:id/complete', auth, async (req, res) => {
  const taskId = parseInt(req.params.id, 10);

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (task.completed) return res.status(400).json({ error: 'Task already completed' });

    const xpReward = task.xpReward ?? 50;

    const [updated, updatedUser] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data: { completed: true, completedAt: new Date() },
        include: { pushupDebt: true },
      }),
      prisma.user.update({
        where: { id: req.userId },
        data: {
          totalTasksCompleted: { increment: 1 },
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

    return res.json({ task: updated, xpEarned: xpReward });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/tasks/:id/uncomplete — unmark task as complete
router.patch('/:id/uncomplete', auth, async (req, res) => {
  const taskId = parseInt(req.params.id, 10);

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!task.completed) return res.status(400).json({ error: 'Task is not completed' });

    const [updated] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data: { completed: false, completedAt: null },
        include: { pushupDebt: true },
      }),
      prisma.user.update({
        where: { id: req.userId },
        data: { totalTasksCompleted: { decrement: 1 } },
      }),
    ]);

    return res.json({ task: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tasks/:id — delete a task
// Deleting an incomplete task incurs a 5-pushup penalty
router.delete('/:id', auth, async (req, res) => {
  const taskId = parseInt(req.params.id, 10);

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { pushupDebt: true },
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const wasIncomplete = !task.completed;
    const existingDebt = task.pushupDebt;

    // Soft-delete: keep the row so completed tasks remain countable in the leaderboard
    await prisma.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });

    if (wasIncomplete) {
      if (existingDebt) {
        // Orphan the debt (taskId → null) so it groups under "Deleted tasks", and add penalty
        await prisma.pushupDebt.update({
          where: { id: existingDebt.id },
          data: { taskId: null, pushupsOwed: existingDebt.pushupsOwed + 5 },
        });
      } else {
        await prisma.pushupDebt.create({
          data: {
            taskId: null,
            userId: req.userId,
            pushupsOwed: 5,
            daysOverdue: 1,
          },
        });
      }
    }

    return res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
