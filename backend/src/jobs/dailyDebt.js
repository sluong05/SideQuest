const prisma = require('../lib/prisma');
const cron = require('node-cron');
const { localDateString, localEndOfDayUTC } = require('../lib/timezone');

// Returns a plain Date representing midnight on the given date in the given timezone.
// Used to count calendar-day boundaries locally rather than in UTC.
function localCalendarDay(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parseInt(parts.find(p => p.type === 'year').value);
  const m = parseInt(parts.find(p => p.type === 'month').value);
  const d = parseInt(parts.find(p => p.type === 'day').value);
  return new Date(y, m - 1, d);
}

/**
 * Calculate quest debt for a specific user (or all users if userId is null).
 * Debt = 5 pts on first overdue moment, +5 per local midnight that passes after.
 */
async function calculateAndUpdateDebt(userId = null) {
  const now = new Date();

  const whereClause = {
    completed: false,
    deletedAt: null,
    dueDate: { lt: now },
  };

  if (userId) {
    whereClause.userId = userId;
  }

  const overdueQuests = await prisma.quest.findMany({
    where: whereClause,
    include: { debt: true, user: { select: { timezone: true, debtFreezeUntil: true } } },
  });

  for (const quest of overdueQuests) {
    if (quest.user?.debtFreezeUntil && quest.user.debtFreezeUntil > now) continue;
    const dueDate = new Date(quest.dueDate);
    const msPerDay = 1000 * 60 * 60 * 24;
    const tz = quest.user?.timezone || 'UTC';
    // daysOverdue=1 the moment the due time passes; +1 for each local midnight after.
    const dueDateLocalDay = localCalendarDay(dueDate, tz);
    const nowLocalDay = localCalendarDay(now, tz);
    const daysOverdue = 1 + Math.floor((nowLocalDay - dueDateLocalDay) / msPerDay);
    const baseDebt = 5 * daysOverdue;

    if (!quest.debt) {
      // First time this quest is overdue — create new debt entry
      await prisma.debt.create({
        data: {
          questId: quest.id,
          userId: quest.userId,
          amountOwed: baseDebt,
          daysOverdue,
          resolved: false,
        },
      });
    } else if (!quest.debt.resolved) {
      // Only add debt for new overdue days — don't reset what the user has already paid off
      const newDays = daysOverdue - quest.debt.daysOverdue;
      if (newDays > 0) {
        await prisma.debt.update({
          where: { id: quest.debt.id },
          data: {
            amountOwed: quest.debt.amountOwed + 5 * newDays,
            daysOverdue,
          },
        });
      }
    }
  }

  console.log(`[DebtJob] Processed ${overdueQuests.length} overdue quests${userId ? ` for user ${userId}` : ''}`);

  // ── Reset completed recurring quests for their next period ─────────────────
  // Only runs on the full nightly pass (not per-user on-demand calls)
  if (userId) return;

  const completedRecurring = await prisma.quest.findMany({
    where: { completed: true, deletedAt: null, recurrence: { not: 'none' } },
    include: { debt: true, user: { select: { timezone: true } } },
  });

  for (const quest of completedRecurring) {
    const tz = quest.user?.timezone || 'UTC';
    let nextDue;

    if (quest.recurrence === 'daily') {
      // Reset to end of today in the user's local timezone
      nextDue = localEndOfDayUTC(localDateString(now, tz), tz);
    } else if (quest.recurrence === 'weekly') {
      // Preserve the original due time — just advance by exactly 7 days
      nextDue = new Date(new Date(quest.dueDate).getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    // Remove resolved debt so a fresh debt record can be created if overdue again
    if (quest.debt?.resolved) {
      await prisma.debt.delete({ where: { id: quest.debt.id } });
    }

    await prisma.quest.update({
      where: { id: quest.id },
      data: { completed: false, completedAt: null, dueDate: nextDue },
    });
  }

  console.log(`[DebtJob] Reset ${completedRecurring.length} recurring quests`);

  // ── Hard-delete quests that are past the 7-day leaderboard window ────────
  // Soft-deleted incomplete quests have no leaderboard value and can go immediately.
  // Completed quests (deleted or not) are kept for 7 days so the leaderboard counts them.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
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
 * Start the daily debt cron job — runs at midnight every day
 */
function startDebtCronJob() {
  // Run at 00:01 every day
  cron.schedule('1 0 * * *', async () => {
    console.log('[DebtJob] Running daily debt calculation...');
    try {
      await calculateAndUpdateDebt();
      console.log('[DebtJob] Done.');
    } catch (err) {
      console.error('[DebtJob] Error during debt calculation:', err);
    }
  });

  console.log('[DebtJob] Daily debt cron job scheduled (runs at 00:01 daily)');
}

module.exports = { calculateAndUpdateDebt, startDebtCronJob };
