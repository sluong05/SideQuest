const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { localMidnightUTC, localDateString } = require('../lib/timezone');
const { MIN_QUEST_AGE_SECONDS, DAILY_COMPLETION_CAP } = require('../lib/siteConfig');
const {
  recalcDebt, lockoutDebtFor, lockoutWarning, deletePenaltyFor, withinFreeEditWindow, safeTz,
} = require('../lib/debt');
const {
  xpForDifficulty, isCompletionCredited, isOnTime, completionRewards, syncLevel, decrementClamped,
} = require('../lib/economy');
const { refreshStreak } = require('../lib/streak');

const router = express.Router();

const VALID_RECURRENCES = ['none', 'daily', 'weekly'];
const VALID_CATEGORIES = ['fitness', 'learning', 'focus', 'productivity', 'wellness', 'chores', 'other'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const VALID_DEBT_TYPES = ['pushups', 'custom', 'fitness', 'focus', 'wellness', 'chores'];
const EDITABLE_FIELDS = ['title', 'description', 'dueDate', 'recurrence', 'category', 'difficulty', 'debtAmount', 'debtType'];

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

  if (!VALID_RECURRENCES.includes(recurrence)) {
    return res.status(400).json({ error: 'Invalid recurrence value' });
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: 'Invalid difficulty' });
  }

  if (!VALID_DEBT_TYPES.includes(debtType)) {
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

  const xpReward = xpForDifficulty(difficulty);

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

    // Soft lockout: creation always succeeds; heavy (non-bomb) debt adds a warning.
    const warning = lockoutWarning(await lockoutDebtFor(prisma, req.userId).catch(() => 0));
    const extra = warning ? { warning } : {};

    if (due < new Date()) {
      await recalcDebt(prisma, req.userId);
      const questWithDebt = await prisma.quest.findUnique({
        where: { id: quest.id },
        include: { debt: true },
      });
      return res.status(201).json({ quest: questWithDebt, ...extra });
    }

    return res.status(201).json({ quest, ...extra });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Shared field validation for create/edit. Returns an error string or null.
function validateQuestFields(f) {
  if (f.title !== undefined) {
    if (!f.title || typeof f.title !== 'string' || f.title.trim() === '') return 'Title is required';
    if (f.title.trim().length > 200) return 'Title must be 200 characters or fewer';
  }
  if (f.description !== undefined && f.description !== null && typeof f.description !== 'string') {
    return 'description must be a string';
  }
  if (typeof f.description === 'string' && f.description.length > 2000) {
    return 'Description must be 2000 characters or fewer';
  }
  if (f.recurrence !== undefined && !VALID_RECURRENCES.includes(f.recurrence)) return 'Invalid recurrence value';
  if (f.category !== undefined && !VALID_CATEGORIES.includes(f.category)) return 'Invalid category';
  if (f.difficulty !== undefined && !VALID_DIFFICULTIES.includes(f.difficulty)) return 'Invalid difficulty';
  if (f.debtType !== undefined && !VALID_DEBT_TYPES.includes(f.debtType)) return 'Invalid debt type';
  if (f.debtAmount !== undefined) {
    const n = Number(f.debtAmount);
    if (!Number.isFinite(n) || n < 0 || n > 1000) return 'debtAmount must be a number between 0 and 1000';
  }
  if (f.dueDate !== undefined && (f.dueDate === null || Number.isNaN(new Date(f.dueDate).getTime()))) {
    return 'Invalid dueDate';
  }
  return null;
}

async function userTimezone(db, userId) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return safeTz(u?.timezone);
}

// Number of completions logged by this user on `localDate` strictly before `before`.
function completionsBefore(db, userId, localDate, before) {
  return db.questCompletion.count({ where: { userId, localDate, completedAt: { lt: before } } });
}

function creditFor(quest, completedAt, earlierCompletionsToday) {
  const credited = isCompletionCredited({
    createdAt: quest.createdAt,
    completedAt,
    earlierCompletionsToday,
    minAgeSeconds: MIN_QUEST_AGE_SECONDS,
    dailyCap: DAILY_COMPLETION_CAP,
  });
  const onTime = isOnTime(completedAt, quest.dueDate);
  return { credited, onTime, ...completionRewards({ credited, onTime, xpReward: quest.xpReward }) };
}

function editLocked(res, error) {
  return res.status(400).json({ error, code: 'EDIT_LOCKED' });
}

// PATCH /api/quests/:id — edit a quest
// title/description: always editable unless the completion has locked (completed
// before today, local time). Other fields: only while not completed AND (not yet
// due OR inside the free-edit window after creation).
router.patch('/:id', auth, async (req, res) => {
  const questId = parseInt(req.params.id, 10);
  if (Number.isNaN(questId)) return res.status(400).json({ error: 'Invalid quest id' });

  const body = req.body || {};
  const fields = {};
  for (const k of EDITABLE_FIELDS) if (body[k] !== undefined) fields[k] = body[k];

  const validationError = validateQuestFields(fields);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const quest = await prisma.quest.findUnique({ where: { id: questId }, include: { debt: true } });

    if (!quest || quest.deletedAt) return res.status(404).json({ error: 'Quest not found' });
    if (quest.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const now = new Date();
    const tz = await userTimezone(prisma, req.userId);

    if (quest.completed && quest.completedAt) {
      const todayStart = localMidnightUTC(localDateString(now, tz), tz);
      if (quest.completedAt < todayStart) {
        return editLocked(res, 'Completed quests lock once the day ends and can no longer be edited');
      }
    }

    const data = {};
    if (fields.title !== undefined) data.title = fields.title.trim();
    if (fields.description !== undefined) {
      const trimmedDesc = typeof fields.description === 'string' ? fields.description.trim() : '';
      data.description = trimmedDesc === '' ? null : trimmedDesc;
    }

    const restricted = EDITABLE_FIELDS.filter((k) => !['title', 'description'].includes(k) && fields[k] !== undefined);
    const inFreeWindow = withinFreeEditWindow(quest, now);
    if (restricted.length > 0) {
      if (quest.completed) return editLocked(res, 'Completed quests can only have their title and description edited');
      if (!(now < quest.dueDate || inFreeWindow)) {
        return editLocked(res, 'This quest is already overdue — only the title and description can be edited');
      }
      if (fields.dueDate !== undefined) data.dueDate = new Date(fields.dueDate);
      if (fields.recurrence !== undefined) data.recurrence = fields.recurrence;
      if (fields.category !== undefined) data.category = fields.category;
      if (fields.debtType !== undefined) data.debtType = fields.debtType;
      if (fields.debtAmount !== undefined) data.debtAmount = Number(fields.debtAmount);
      if (fields.difficulty !== undefined) {
        data.difficulty = fields.difficulty;
        data.xpReward = xpForDifficulty(fields.difficulty);
      }
    }

    if (Object.keys(data).length === 0) {
      return res.json({ quest });
    }

    // Only apply if the quest's completion state didn't change since we read it.
    const { count } = await prisma.quest.updateMany({
      where: { id: questId, userId: req.userId, deletedAt: null, completed: quest.completed },
      data,
    });
    if (count === 0) return editLocked(res, 'Quest changed while editing — reload and try again');

    // A quest created with a mistaken past due date and fixed inside the free
    // window shouldn't keep the debt that the bad date produced.
    if (data.dueDate && inFreeWindow && data.dueDate > now && quest.debt && !quest.debt.resolved) {
      await prisma.debt.deleteMany({ where: { id: quest.debt.id, resolved: false } });
    }
    if (data.dueDate && data.dueDate < now) {
      await recalcDebt(prisma, req.userId).catch((err) => console.error('[Quests] debt recalc failed:', err.message));
    }

    const updated = await prisma.quest.findUnique({ where: { id: questId }, include: { debt: true } });
    return res.json({ quest: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/quests/:id/complete — mark quest as complete, award XP/coins
router.patch('/:id/complete', auth, async (req, res) => {
  const questId = parseInt(req.params.id, 10);
  if (Number.isNaN(questId)) return res.status(400).json({ error: 'Invalid quest id' });

  try {
    const quest = await prisma.quest.findUnique({ where: { id: questId } });

    if (!quest || quest.deletedAt) return res.status(404).json({ error: 'Quest not found' });
    if (quest.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (quest.completed) return res.status(400).json({ error: 'Quest already completed' });

    const tz = await userTimezone(prisma, req.userId);
    const now = new Date();
    const localDate = localDateString(now, tz);

    const outcome = await prisma.$transaction(async (tx) => {
      // Atomic claim — only one concurrent request can flip completed:false → true.
      const { count } = await tx.quest.updateMany({
        where: { id: questId, userId: req.userId, completed: false, deletedAt: null },
        data: { completed: true, completedAt: now },
      });
      if (count !== 1) return null;

      const earlier = await completionsBefore(tx, req.userId, localDate, now);
      const reward = creditFor(quest, now, earlier);

      await tx.questCompletion.upsert({
        where: { questId_localDate: { questId, localDate } },
        create: { questId, userId: req.userId, localDate, completedAt: now },
        update: { completedAt: now },
      });

      if (reward.credited) {
        await tx.user.update({
          where: { id: req.userId },
          data: {
            totalQuestsCompleted: { increment: 1 },
            xp: { increment: reward.xp },
            ...(reward.coins > 0 ? { coins: { increment: reward.coins } } : {}),
          },
        });
      }
      return reward;
    });

    if (!outcome) return res.status(400).json({ error: 'Quest already completed' });

    const { level: newLevel, leveledUp } = await syncLevel(prisma, req.userId);
    await refreshStreak(prisma, req.userId).catch((err) => console.error('[Quests] streak refresh failed:', err.message));

    const updated = await prisma.quest.findUnique({ where: { id: questId }, include: { debt: true } });
    return res.json({
      quest: updated,
      xpAwarded: outcome.xp,
      coinsAwarded: outcome.coins,
      leveledUp,
      newLevel,
      xpEarned: outcome.xp, // legacy field
      credited: outcome.credited,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/quests/:id/uncomplete — unmark quest as complete
// Only allowed on the same local day it was completed; after local midnight
// the completion locks (XP, streak, and stats are settled for that day).
// Reverses exactly what /complete awarded (recomputed deterministically).
router.patch('/:id/uncomplete', auth, async (req, res) => {
  const questId = parseInt(req.params.id, 10);
  if (Number.isNaN(questId)) return res.status(400).json({ error: 'Invalid quest id' });

  try {
    const quest = await prisma.quest.findUnique({ where: { id: questId } });

    if (!quest || quest.deletedAt) return res.status(404).json({ error: 'Quest not found' });
    if (quest.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!quest.completed) return res.status(400).json({ error: 'Quest is not completed' });

    const timezone = await userTimezone(prisma, req.userId);
    const todayStart = localMidnightUTC(localDateString(new Date(), timezone), timezone);
    if (quest.completedAt && quest.completedAt < todayStart) {
      return res.status(400).json({ error: 'Completed quests lock once the day ends and can no longer be undone' });
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const { count } = await tx.quest.updateMany({
        where: { id: questId, userId: req.userId, completed: true, completedAt: quest.completedAt },
        data: { completed: false, completedAt: null },
      });
      if (count !== 1) return null;

      if (!quest.completedAt) {
        // Legacy row without a timestamp — keep the old behaviour.
        await decrementClamped(tx, req.userId, 'totalQuestsCompleted', 1);
        return { xp: 0, coins: 0 };
      }

      const row = await tx.questCompletion.findFirst({
        where: { questId, completedAt: quest.completedAt },
        select: { id: true, localDate: true },
      });
      const localDate = row?.localDate || localDateString(quest.completedAt, timezone);
      const earlier = await completionsBefore(tx, req.userId, localDate, quest.completedAt);
      const reward = creditFor(quest, quest.completedAt, earlier);

      if (row) await tx.questCompletion.delete({ where: { id: row.id } });

      if (reward.credited) {
        await decrementClamped(tx, req.userId, 'xp', reward.xp);
        await decrementClamped(tx, req.userId, 'coins', reward.coins);
        await decrementClamped(tx, req.userId, 'totalQuestsCompleted', 1);
      }
      return reward;
    });

    if (!outcome) return res.status(400).json({ error: 'Quest is not completed' });

    const { level } = await syncLevel(prisma, req.userId);
    await refreshStreak(prisma, req.userId).catch((err) => console.error('[Quests] streak refresh failed:', err.message));

    const updated = await prisma.quest.findUnique({ where: { id: questId }, include: { debt: true } });
    return res.json({ quest: updated, xpRemoved: outcome.xp, coinsRemoved: outcome.coins, newLevel: level });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/quests/:id — delete a quest
// Free if completed or created < FREE_EDIT_MINUTES ago; otherwise a penalty of
// quest.debtAmount is added as a separate debt (source 'delete').
router.delete('/:id', auth, async (req, res) => {
  const questId = parseInt(req.params.id, 10);
  if (Number.isNaN(questId)) return res.status(400).json({ error: 'Invalid quest id' });

  try {
    const quest = await prisma.quest.findUnique({
      where: { id: questId },
      include: { debt: true },
    });

    if (!quest || quest.deletedAt) return res.status(404).json({ error: 'Quest not found' });
    if (quest.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const now = new Date();
    const penalty = deletePenaltyFor(quest, now);
    const inFreeWindow = withinFreeEditWindow(quest, now);
    const existingDebt = quest.debt;

    await prisma.$transaction(async (tx) => {
      // Soft-delete: keep the row so completed quests remain countable in the
      // leaderboard. Conditional so a double-tap can't charge the penalty twice.
      const { count } = await tx.quest.updateMany({
        where: { id: questId, deletedAt: null },
        data: { deletedAt: now },
      });
      if (count !== 1) return;

      if (!quest.completed && existingDebt) {
        if (inFreeWindow && !existingDebt.resolved) {
          // Debt from a due date entered moments ago — part of the free undo.
          await tx.debt.deleteMany({ where: { id: existingDebt.id, resolved: false } });
        } else {
          // Orphan the debt (questId → null) so it groups under "Deleted quests"
          await tx.debt.update({ where: { id: existingDebt.id }, data: { questId: null } });
        }
      }

      if (penalty > 0) {
        await tx.debt.create({
          data: {
            questId: null,
            userId: req.userId,
            amountOwed: penalty,
            daysOverdue: 1,
            source: 'delete',
          },
        });
      }
    });

    return res.json({ message: 'Quest deleted', success: true, penalty });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
