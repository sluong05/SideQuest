// Debt rules (docs/AUDIT_FIXES.md "Debt rules"). The pure functions at the top
// hold all the day math and are unit-tested; the async helpers below apply the
// result with increment / conditional updateMany writes only.
const { localDateString, isValidTimeZone } = require('./timezone');
const { DEBT_MAX_DAYS, FREE_EDIT_MINUTES, LOCKOUT_THRESHOLD } = require('./siteConfig');

const DAY_MS = 24 * 60 * 60 * 1000;

function safeTz(tz) {
  return isValidTimeZone(tz) ? tz : 'UTC';
}

// Whole calendar days between two "YYYY-MM-DD" strings (to - from).
function dayDiff(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// 0 while not yet due; 1 the moment the due time passes; +1 per local midnight after.
function daysOverdueAt(dueDate, now, tz) {
  if (new Date(now).getTime() <= new Date(dueDate).getTime()) return 0;
  const zone = safeTz(tz);
  return 1 + Math.max(0, dayDiff(localDateString(new Date(dueDate), zone), localDateString(new Date(now), zone)));
}

function chargeableDays(daysOverdue, frozenDays = 0, maxDays = DEBT_MAX_DAYS) {
  return Math.max(0, Math.min(daysOverdue - frozenDays, maxDays));
}

function isFrozen(user, now) {
  const t = new Date(now).getTime();
  return Boolean(
    (user?.debtFreezeUntil && new Date(user.debtFreezeUntil).getTime() > t) ||
    (user?.pausedUntil && new Date(user.pausedUntil).getTime() > t)
  );
}

/**
 * Decide what to write for one overdue quest.
 *   existing: the quest's Debt row ({ daysOverdue, frozenDays, resolved }) or null
 * Returns one of
 *   { action: 'none' }
 *   { action: 'create', daysOverdue, frozenDays, amount }
 *   { action: 'update', prevDaysOverdue, daysOverdue, frozenIncrement, chargeIncrement }
 * Resolved debts never accrue again (existing behaviour: paying off a quest's
 * debt, or a Fresh Start, settles that quest).
 */
function planDebtUpdate({ existing, daysOverdue, frozen, debtAmount, maxDays = DEBT_MAX_DAYS }) {
  const perDay = Math.max(0, Number(debtAmount ?? 5) || 0);
  if (daysOverdue <= 0) return { action: 'none' };

  if (!existing) {
    const frozenDays = frozen ? daysOverdue : 0;
    return {
      action: 'create',
      daysOverdue,
      frozenDays,
      amount: chargeableDays(daysOverdue, frozenDays, maxDays) * perDay,
    };
  }
  if (existing.resolved) return { action: 'none' };

  const prev = existing.daysOverdue;
  const newDays = daysOverdue - prev;
  if (newDays <= 0) return { action: 'none' };

  const prevFrozen = existing.frozenDays || 0;
  if (frozen) {
    return { action: 'update', prevDaysOverdue: prev, daysOverdue, frozenIncrement: newDays, chargeIncrement: 0 };
  }
  const before = chargeableDays(prev, prevFrozen, maxDays);
  const after = chargeableDays(daysOverdue, prevFrozen, maxDays);
  return {
    action: 'update',
    prevDaysOverdue: prev,
    daysOverdue,
    frozenIncrement: 0,
    chargeIncrement: Math.max(0, after - before) * perDay,
  };
}

// Penalty for deleting a quest: free when completed or inside the free-edit window.
function deletePenaltyFor(quest, now = new Date(), freeMinutes = FREE_EDIT_MINUTES) {
  if (quest.completed) return 0;
  if (new Date(now).getTime() - new Date(quest.createdAt).getTime() < freeMinutes * 60 * 1000) return 0;
  return Math.max(0, Number(quest.debtAmount ?? 5) || 0);
}

function withinFreeEditWindow(quest, now = new Date(), freeMinutes = FREE_EDIT_MINUTES) {
  return new Date(now).getTime() - new Date(quest.createdAt).getTime() < freeMinutes * 60 * 1000;
}

// ── DB helpers ───────────────────────────────────────────────────────────────

const QUEST_DEBT_INCLUDE = {
  debt: true,
  user: { select: { timezone: true, debtFreezeUntil: true, pausedUntil: true } },
};

// Applies the debt plan to one quest (loaded with QUEST_DEBT_INCLUDE).
async function applyQuestDebt(prisma, quest, now) {
  const tz = safeTz(quest.user?.timezone);
  const plan = planDebtUpdate({
    existing: quest.debt,
    daysOverdue: daysOverdueAt(quest.dueDate, now, tz),
    frozen: isFrozen(quest.user, now),
    debtAmount: quest.debtAmount,
  });

  if (plan.action === 'create') {
    try {
      await prisma.debt.create({
        data: {
          questId: quest.id,
          userId: quest.userId,
          amountOwed: plan.amount,
          daysOverdue: plan.daysOverdue,
          frozenDays: plan.frozenDays,
          source: 'quest',
          resolved: false,
        },
      });
    } catch (err) {
      // Another run created it concurrently — the next pass picks up any delta.
      if (err.code !== 'P2002') throw err;
    }
  } else if (plan.action === 'update') {
    // Optimistic concurrency: only applies if nobody advanced daysOverdue since our read.
    await prisma.debt.updateMany({
      where: { id: quest.debt.id, daysOverdue: plan.prevDaysOverdue, resolved: false },
      data: {
        daysOverdue: plan.daysOverdue,
        frozenDays: { increment: plan.frozenIncrement },
        amountOwed: { increment: plan.chargeIncrement },
      },
    });
  }
  return plan.action;
}

// Recalculates debt for every overdue quest of one user, or of everyone (batched).
async function recalcDebt(prisma, userId = null, now = new Date()) {
  const where = { completed: false, deletedAt: null, dueDate: { lt: now } };
  if (userId) where.userId = userId;

  let processed = 0;
  let cursor = null;
  for (;;) {
    const batch = await prisma.quest.findMany({
      where,
      include: QUEST_DEBT_INCLUDE,
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const quest of batch) {
      // Isolate each quest so one bad record can't abort the batch.
      try {
        await applyQuestDebt(prisma, quest, now);
      } catch (err) {
        console.error(`[Debt] Skipped quest ${quest.id} (user ${quest.userId}):`, err.message);
      }
    }
    processed += batch.length;
    if (batch.length < 500) break;
    cursor = batch[batch.length - 1].id;
  }
  return processed;
}

// Unresolved debt that counts toward the soft lockout (Debt Bombs excluded).
async function lockoutDebtFor(prisma, userId) {
  const agg = await prisma.debt.aggregate({
    where: { userId, resolved: false, source: { not: 'bomb' } },
    _sum: { amountOwed: true },
  });
  return Math.ceil(agg._sum.amountOwed || 0);
}

function lockoutWarning(lockoutDebt) {
  if (lockoutDebt < LOCKOUT_THRESHOLD) return undefined;
  return `You owe ${lockoutDebt} pts of debt. Pay some off before piling on more quests.`;
}

module.exports = {
  DAY_MS,
  safeTz,
  dayDiff,
  addDays,
  daysOverdueAt,
  chargeableDays,
  isFrozen,
  planDebtUpdate,
  deletePenaltyFor,
  withinFreeEditWindow,
  QUEST_DEBT_INCLUDE,
  applyQuestDebt,
  recalcDebt,
  lockoutDebtFor,
  lockoutWarning,
};
