const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { calculateAndUpdateDebt } = require('../jobs/dailyDebt');
const { recalcDebt, lockoutDebtFor, lockoutWarning } = require('../lib/debt');
const { DEBT_MAX_DAYS, LOCKOUT_THRESHOLD } = require('../lib/siteConfig');
const { comebackActive } = require('../lib/comeback');
const { track } = require('../lib/analytics');

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const PAUSE_COOLDOWN_DAYS = 90;
const FRESH_START_COOLDOWN_DAYS = 30;
const MAX_PAUSE_DAYS = 14;

function nextAvailable(last, cooldownDays) {
  if (!last) return null;
  const next = new Date(new Date(last).getTime() + cooldownDays * DAY_MS);
  return next > new Date() ? next : null;
}

// GET /api/debt — get all unresolved debt for the user (recalculated first)
router.get('/', auth, async (req, res) => {
  try {
    try {
      await recalcDebt(prisma, req.userId);
    } catch (err) {
      // A recalculation failure must not hide the user's current debt.
      console.error('[Debt] On-demand recalculation failed:', err.message);
    }

    const [debts, user, lockoutDebt] = await Promise.all([
      prisma.debt.findMany({
        where: { resolved: false, userId: req.userId },
        include: { quest: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.findUnique({
        where: { id: req.userId },
        select: { pausedUntil: true, lastPauseAt: true, lastFreshStartAt: true, comebackUntil: true },
      }),
      lockoutDebtFor(prisma, req.userId),
    ]);

    const totalOwed = debts.reduce((sum, d) => sum + d.amountOwed, 0);

    // Null out the quest reference for soft-deleted quests so the frontend
    // groups them under "Deleted quests" rather than showing a stale quest name.
    const sanitised = debts.map((d) => ({
      ...d,
      quest: d.quest?.deletedAt ? null : d.quest,
    }));

    const now = new Date();
    const pausedUntil = user?.pausedUntil && user.pausedUntil > now ? user.pausedUntil : null;
    const nextPauseAvailableAt = nextAvailable(user?.lastPauseAt, PAUSE_COOLDOWN_DAYS);
    const nextFreshStartAt = nextAvailable(user?.lastFreshStartAt, FRESH_START_COOLDOWN_DAYS);
    const warning = lockoutWarning(lockoutDebt);
    // Only offer the comeback wipe when there's something to wipe.
    const comebackUntil = comebackActive(user?.comebackUntil, now) && debts.length > 0 ? user.comebackUntil : null;

    return res.json({
      debts: sanitised,
      totalOwed: Math.ceil(totalOwed),
      lockoutThreshold: LOCKOUT_THRESHOLD,
      lockoutDebt,
      ...(warning ? { warning } : {}),
      pausedUntil,
      canPause: !pausedUntil && !nextPauseAvailableAt,
      nextPauseAvailableAt,
      canFreshStart: !nextFreshStartAt || !!comebackUntil,
      nextFreshStartAt: comebackUntil ? null : nextFreshStartAt,
      comebackUntil,
      maxDaysCharged: DEBT_MAX_DAYS,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/debt/calculate — kept for old clients
router.post('/calculate', auth, async (req, res) => {
  try {
    await calculateAndUpdateDebt(req.userId);
    return res.json({ message: 'Debt recalculated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/debt/pause { days } — pause debt accrual for 1–14 days, once per 90 days
router.post('/pause', auth, async (req, res) => {
  const days = Number(req.body?.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_PAUSE_DAYS) {
    return res.status(400).json({ error: `days must be a whole number between 1 and ${MAX_PAUSE_DAYS}` });
  }
  try {
    // Settle everything owed up to now before the pause starts.
    await recalcDebt(prisma, req.userId);

    const now = new Date();
    const pausedUntil = new Date(now.getTime() + days * DAY_MS);
    const cutoff = new Date(now.getTime() - PAUSE_COOLDOWN_DAYS * DAY_MS);
    const { count } = await prisma.user.updateMany({
      where: {
        id: req.userId,
        OR: [{ lastPauseAt: null }, { lastPauseAt: { lt: cutoff } }],
      },
      data: { pausedUntil, lastPauseAt: now },
    });
    if (count === 0) {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { lastPauseAt: true } });
      return res.status(400).json({
        error: 'You can pause once every 90 days',
        code: 'PAUSE_COOLDOWN',
        nextPauseAvailableAt: nextAvailable(user?.lastPauseAt, PAUSE_COOLDOWN_DAYS),
      });
    }
    return res.json({ pausedUntil });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/debt/resume — end a pause early (the 90-day quota stays used)
router.post('/resume', auth, async (req, res) => {
  try {
    // Record the paused days as frozen before un-pausing so they're never charged.
    await recalcDebt(prisma, req.userId);
    await prisma.user.update({ where: { id: req.userId }, data: { pausedUntil: null } });
    return res.json({ pausedUntil: null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Clears every unresolved debt inside a transaction; returns the amount cleared.
async function clearAllDebt(tx, userId) {
  const agg = await tx.debt.aggregate({
    where: { userId, resolved: false },
    _sum: { amountOwed: true },
  });
  await tx.debt.updateMany({
    where: { userId, resolved: false },
    data: { resolved: true, amountOwed: 0 },
  });
  return Math.ceil(agg._sum.amountOwed || 0);
}

// POST /api/debt/fresh-start — clear all unresolved debt.
//   Comeback (returned after a long absence, window open): free — no cooldown
//   used and the streak is left alone. The window closes once used.
//   Otherwise: resets the streak; once per 30 days.
router.post('/fresh-start', auth, async (req, res) => {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - FRESH_START_COOLDOWN_DAYS * DAY_MS);

    const result = await prisma.$transaction(async (tx) => {
      const comeback = await tx.user.updateMany({
        where: { id: req.userId, comebackUntil: { gt: now } },
        data: { comebackUntil: null },
      });
      if (comeback.count > 0) {
        return { cleared: await clearAllDebt(tx, req.userId), comeback: true };
      }

      const { count } = await tx.user.updateMany({
        where: {
          id: req.userId,
          OR: [{ lastFreshStartAt: null }, { lastFreshStartAt: { lt: cutoff } }],
        },
        data: { lastFreshStartAt: now, currentStreak: 0 },
      });
      if (count === 0) return null;
      return { cleared: await clearAllDebt(tx, req.userId), comeback: false };
    });

    if (result === null) {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { lastFreshStartAt: true } });
      return res.status(400).json({
        error: 'Fresh Start is available once every 30 days',
        code: 'FRESH_START_COOLDOWN',
        nextFreshStartAt: nextAvailable(user?.lastFreshStartAt, FRESH_START_COOLDOWN_DAYS),
      });
    }
    track('fresh_start', String(req.userId), { comeback: result.comeback, cleared: result.cleared, source: 'server' });
    if (result.comeback) {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { lastFreshStartAt: true } });
      return res.json({
        cleared: result.cleared,
        comeback: true,
        nextFreshStartAt: nextAvailable(user?.lastFreshStartAt, FRESH_START_COOLDOWN_DAYS),
      });
    }
    return res.json({
      cleared: result.cleared,
      comeback: false,
      nextFreshStartAt: new Date(now.getTime() + FRESH_START_COOLDOWN_DAYS * DAY_MS),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
