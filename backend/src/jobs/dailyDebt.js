const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');

const prisma = new PrismaClient();

/**
 * Calculate pushup debt for a specific user (or all users if userId is null).
 *
 * Rules:
 * - Incomplete tasks past their dueDate generate debt: pushups = 5 * days_overdue
 * - Existing unresolved debt compounds: new_debt = current_debt * 1.10
 * - Days overdue is recalculated each run
 */
async function calculateAndUpdateDebt(userId = null) {
  const now = new Date();

  const whereClause = {
    completed: false,
    dueDate: { lt: now },
  };

  if (userId) {
    whereClause.userId = userId;
  }

  const overdueTasks = await prisma.task.findMany({
    where: whereClause,
    include: { pushupDebt: true },
  });

  for (const task of overdueTasks) {
    const dueDate = new Date(task.dueDate);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysOverdue = Math.max(1, Math.ceil((now - dueDate) / msPerDay));
    const basePushups = 5 * daysOverdue;

    if (!task.pushupDebt) {
      // First time this task is overdue — create new debt entry
      await prisma.pushupDebt.create({
        data: {
          taskId: task.id,
          userId: task.userId,
          pushupsOwed: basePushups,
          daysOverdue,
          interestApplied: false,
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
    where: { completed: true, recurrence: { not: 'none' } },
    include: { pushupDebt: true },
  });

  for (const task of completedRecurring) {
    const nextDue = new Date();

    if (task.recurrence === 'daily') {
      nextDue.setUTCHours(23, 59, 59, 999);
    } else if (task.recurrence === 'weekly') {
      const base = new Date(task.dueDate);
      base.setUTCDate(base.getUTCDate() + 7);
      base.setUTCHours(23, 59, 59, 999);
      nextDue.setTime(base.getTime());
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

  // ── Delete completed non-recurring tasks from the previous day ────────────
  const deleted = await prisma.task.deleteMany({
    where: { completed: true, recurrence: 'none' },
  });

  console.log(`[DebtJob] Deleted ${deleted.count} completed non-recurring tasks`);
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
