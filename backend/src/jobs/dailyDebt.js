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
 * Calculate pushup debt for a specific user (or all users if userId is null).
 * Debt = 5 pushups on first overdue moment, +5 per local midnight that passes after.
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

  const overdueTasks = await prisma.task.findMany({
    where: whereClause,
    include: { pushupDebt: true, user: { select: { timezone: true } } },
  });

  for (const task of overdueTasks) {
    const dueDate = new Date(task.dueDate);
    const msPerDay = 1000 * 60 * 60 * 24;
    const tz = task.user?.timezone || 'UTC';
    // daysOverdue=1 the moment the due time passes; +1 for each local midnight after.
    const dueDateLocalDay = localCalendarDay(dueDate, tz);
    const nowLocalDay = localCalendarDay(now, tz);
    const daysOverdue = 1 + Math.floor((nowLocalDay - dueDateLocalDay) / msPerDay);
    const basePushups = 5 * daysOverdue;

    if (!task.pushupDebt) {
      // First time this task is overdue — create new debt entry
      await prisma.pushupDebt.create({
        data: {
          taskId: task.id,
          userId: task.userId,
          pushupsOwed: basePushups,
          daysOverdue,
          resolved: false,
        },
      });
    } else if (!task.pushupDebt.resolved) {
      // Only add debt for new overdue days — don't reset what the user has already paid off
      const newDays = daysOverdue - task.pushupDebt.daysOverdue;
      if (newDays > 0) {
        await prisma.pushupDebt.update({
          where: { id: task.pushupDebt.id },
          data: {
            pushupsOwed: task.pushupDebt.pushupsOwed + 5 * newDays,
            daysOverdue,
          },
        });
      }
    }
  }

  console.log(`[DebtJob] Processed ${overdueTasks.length} overdue tasks${userId ? ` for user ${userId}` : ''}`);

  // ── Reset completed recurring tasks for their next period ─────────────────
  // Only runs on the full nightly pass (not per-user on-demand calls)
  if (userId) return;

  const completedRecurring = await prisma.task.findMany({
    where: { completed: true, deletedAt: null, recurrence: { not: 'none' } },
    include: { pushupDebt: true, user: { select: { timezone: true } } },
  });

  for (const task of completedRecurring) {
    const tz = task.user?.timezone || 'UTC';
    let nextDue;

    if (task.recurrence === 'daily') {
      // Reset to end of today in the user's local timezone
      nextDue = localEndOfDayUTC(localDateString(now, tz), tz);
    } else if (task.recurrence === 'weekly') {
      // Preserve the original due time — just advance by exactly 7 days
      nextDue = new Date(new Date(task.dueDate).getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    // Remove resolved debt so a fresh debt record can be created if overdue again
    if (task.pushupDebt?.resolved) {
      await prisma.pushupDebt.delete({ where: { id: task.pushupDebt.id } });
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { completed: false, completedAt: null, dueDate: nextDue },
    });
  }

  console.log(`[DebtJob] Reset ${completedRecurring.length} recurring tasks`);

  // ── Hard-delete tasks that are past the 7-day leaderboard window ────────
  // Soft-deleted incomplete tasks have no leaderboard value and can go immediately.
  // Completed tasks (deleted or not) are kept for 7 days so the leaderboard counts them.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deleted = await prisma.task.deleteMany({
    where: {
      OR: [
        { completed: true, recurrence: 'none', completedAt: { lt: sevenDaysAgo } },
        { deletedAt: { not: null }, completed: false },
      ],
    },
  });

  console.log(`[DebtJob] Hard-deleted ${deleted.count} expired tasks`);
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
