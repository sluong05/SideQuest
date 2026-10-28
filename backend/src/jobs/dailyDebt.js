const prisma = require('../lib/prisma');
const cron = require('node-cron');
const { localDateString, localEndOfDayUTC } = require('../lib/timezone');
const { withJobLock } = require('../lib/jobLock');
const { recalcDebt, safeTz } = require('../lib/debt');

const BATCH = 500;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Next due date for a completed recurring quest, or null if it isn't due for a
 * reset yet. A quest resets only once the user's local date is past the local
 * date it was completed on, so a daily quest completed this morning stays
 * completed until the user's own midnight (not the server's).
 *   daily  → end of the user's current local day
 *   weekly → original due time + 7 days (previous behaviour, unchanged)
 */
function nextRecurringDue(quest, now, tz) {
  const zone = safeTz(tz);
  const today = localDateString(now, zone);
  const completedDay = quest.completedAt ? localDateString(new Date(quest.completedAt), zone) : null;
  if (completedDay && completedDay >= today) return null;

  if (quest.recurrence === 'daily') return localEndOfDayUTC(today, zone);
  if (quest.recurrence === 'weekly') return new Date(new Date(quest.dueDate).getTime() + WEEK_MS);
  return null;
}

async function resetRecurringQuests(now) {
  let reset = 0;
  let cursor = null;
  for (;;) {
    const batch = await prisma.quest.findMany({
      where: { completed: true, deletedAt: null, recurrence: { not: 'none' } },
      include: { debt: true, user: { select: { timezone: true } } },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    for (const quest of batch) {
      try {
        const nextDue = nextRecurringDue(quest, now, quest.user?.timezone);
        if (!nextDue) continue;

        // Remove resolved debt so a fresh debt record can be created if overdue again
        if (quest.debt?.resolved) {
          await prisma.debt.deleteMany({ where: { id: quest.debt.id, resolved: true } });
        }

        // Conditional on the completion we read, so a concurrent uncomplete /
        // re-complete isn't clobbered.
        const { count } = await prisma.quest.updateMany({
          where: { id: quest.id, completed: true, completedAt: quest.completedAt },
          data: { completed: false, completedAt: null, dueDate: nextDue },
        });
        reset += count;
      } catch (err) {
        console.error(`[DebtJob] Skipped recurring reset for quest ${quest.id} (user ${quest.userId}):`, err.message);
      }
    }

    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return reset;
}

/**
 * Calculate quest debt for a specific user (or all users if userId is null).
 * Rules live in src/lib/debt.js. The full pass (userId null) also resets
 * completed recurring quests and hard-deletes expired rows.
 */
async function calculateAndUpdateDebt(userId = null) {
  const now = new Date();
  const processed = await recalcDebt(prisma, userId, now);
  console.log(`[DebtJob] Processed ${processed} overdue quests${userId ? ` for user ${userId}` : ''}`);

  if (userId) return;

  const reset = await resetRecurringQuests(now);
  console.log(`[DebtJob] Reset ${reset} recurring quests`);

  // ── Hard-delete quests that are past the 7-day leaderboard window ────────
  // Soft-deleted incomplete quests have no leaderboard value and can go immediately.
  // Completed quests (deleted or not) are kept for 7 days so the leaderboard counts them.
  // QuestCompletion rows survive (questId → null) so streak history is kept.
  const sevenDaysAgo = new Date(now.getTime() - WEEK_MS);
  const deleted = await prisma.quest.deleteMany({
    where: {
      OR: [
        { completed: true, recurrence: 'none', completedAt: { lt: sevenDaysAgo } },
        { deletedAt: { not: null }, completed: false },
      ],
    },
  });
  console.log(`[DebtJob] Hard-deleted ${deleted.count} expired quests`);
}

/**
 * Start the debt cron job — runs hourly (minute 5) so each user's local
 * midnight is handled within the hour. Guarded by an advisory lock so
 * overlapping deploys/replicas never run it twice at once.
 */
function startDebtCronJob() {
  cron.schedule('5 * * * *', async () => {
    try {
      const result = await withJobLock('debt-hourly', () => calculateAndUpdateDebt());
      if (result && result.skipped) console.log('[DebtJob] Skipped — another instance holds the lock');
    } catch (err) {
      console.error('[DebtJob] Error during debt calculation:', err);
    }
  });

  console.log('[DebtJob] Hourly debt cron job scheduled (runs at :05 every hour)');
}

module.exports = { calculateAndUpdateDebt, startDebtCronJob, nextRecurringDue, resetRecurringQuests };
