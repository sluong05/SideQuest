const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { localDateString, localMidnightUTC } = require('../lib/timezone');
const { safeTz } = require('../lib/debt');
const { DAILY_SURPLUS_COIN_CAP, REQUIRE_SESSION_TOKEN } = require('../lib/siteConfig');
const { checkPayoffRules, capSurplusCoins, syncLevel } = require('../lib/economy');

const router = express.Router();

const ACTIVITIES = ['fitness', 'focus', 'wellness', 'chores', 'custom'];

// Upper bound on a single logged session. The rep counter is client-side, so the
// server can't trust the reported amount — cap it to stop a tampered client from
// wiping all debt, minting unlimited coins, or cheating pushup challenges.
const MAX_SESSION_AMOUNT = 1000;

// Payoff sessions get a signed start token (below) when the activity screen
// opens. It encodes the activity and the start time; the server measures
// elapsed time from it so the start can't be spoofed. Fitness additionally
// passes a pace check (see lib/economy.js checkPayoffRules).

// POST /api/sessions/start { activity? } — issue a signed token marking when a session began
router.post('/start', auth, (req, res) => {
  const activity = ACTIVITIES.includes(req.body?.activity) ? req.body.activity : 'fitness';
  const sessionToken = jwt.sign(
    { userId: req.userId, type: 'payoff-start', activity, startedAt: Date.now() },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  return res.status(201).json({ sessionToken });
});

// POST /api/sessions — log a debt payoff activity and reduce debt
router.post('/', auth, async (req, res) => {
  // `pushupsCompleted` accepted as a legacy alias until all clients send `amount`
  const { activity } = req.body;
  const amount = req.body.amount ?? req.body.pushupsCompleted;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (amount > MAX_SESSION_AMOUNT) {
    return res.status(400).json({ error: `amount cannot exceed ${MAX_SESSION_AMOUNT} per session` });
  }
  const activityType = ACTIVITIES.includes(activity) ? activity : 'fitness';
  const floored = Math.floor(amount);
  if (floored <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  // Verify the start token when present.
  let token = null;
  if (req.body.sessionToken !== undefined && req.body.sessionToken !== null) {
    let start;
    try {
      start = jwt.verify(req.body.sessionToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Session expired or invalid — reopen the payoff screen and try again' });
    }
    if (start.type !== 'payoff-start' || start.userId !== req.userId) {
      return res.status(400).json({ error: 'Invalid session token' });
    }
    // Tokens issued before activities were encoded are fitness tokens.
    const tokenActivity = start.activity || 'fitness';
    if (tokenActivity !== activityType) {
      return res.status(400).json({ error: 'Session token was issued for a different activity' });
    }
    token = { activity: tokenActivity, startedAtMs: Number(start.startedAt) || start.iat * 1000 };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { timezone: true },
    });
    const tz = safeTz(user?.timezone);
    const now = new Date();
    const dayStart = localMidnightUTC(localDateString(now, tz), tz);

    let customToday = 0;
    if (activityType === 'custom') {
      const agg = await prisma.payoffSession.aggregate({
        where: { userId: req.userId, activity: 'custom', date: { gte: dayStart } },
        _sum: { amount: true },
      });
      customToday = agg._sum.amount || 0;
    }

    const rule = checkPayoffRules({
      activity: activityType,
      amount: floored,
      token,
      nowMs: now.getTime(),
      customToday,
      requireToken: REQUIRE_SESSION_TOKEN,
    });
    if (!rule.ok) return res.status(400).json({ error: rule.error });

    const result = await prisma.$transaction(async (tx) => {
      // Consume the multiplier atomically — only one session can use it.
      const { count: multCount } = await tx.user.updateMany({
        where: { id: req.userId, payoffMultiplierActive: true },
        data: { payoffMultiplierActive: false },
      });
      const multiplierUsed = multCount === 1;

      // If multiplier is active, each point counts as 2 for debt draining
      const drainPower = multiplierUsed ? floored * 2 : floored;
      let remaining = drainPower;

      const debts = await tx.debt.findMany({
        where: { resolved: false, userId: req.userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, amountOwed: true },
      });

      for (const debt of debts) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, debt.amountOwed);
        if (take <= 0) continue;
        // Conditional decrement: never drives a debt below zero even if it was
        // changed concurrently (e.g. a Debt Discount).
        const { count } = await tx.debt.updateMany({
          where: { id: debt.id, resolved: false, amountOwed: { gte: take } },
          data: { amountOwed: { decrement: take } },
        });
        if (count === 0) continue;
        remaining -= take;
        await tx.debt.updateMany({
          where: { id: debt.id, resolved: false, amountOwed: { lte: 0.0001 } },
          data: { amountOwed: 0, resolved: true },
        });
      }

      // How many debt points were actually wiped out this session.
      const debtRepaid = drainPower - remaining;

      // Coins are earned two ways:
      //   1. Debt repayment — 1 coin per 5 points of debt cleared.
      //   2. Surplus — when there's no (or not enough) debt to pay, the
      //      leftover effort converts to coins 1:1, capped at the amount logged
      //      and at DAILY_SURPLUS_COIN_CAP per local day. Token-less sessions
      //      earn no surplus.
      const debtCoins = Math.floor(debtRepaid / 5);
      const rawSurplus = remaining > 0 ? Math.min(remaining, floored) : 0;

      let surplusToday = 0;
      if (rawSurplus > 0 && !rule.tokenless) {
        // coinsEarned stores the surplus part only (the part the cap applies to).
        const agg = await tx.payoffSession.aggregate({
          where: { userId: req.userId, date: { gte: dayStart } },
          _sum: { coinsEarned: true },
        });
        surplusToday = agg._sum.coinsEarned || 0;
      }
      const { coins: surplusCoins, capped: surplusCapped } = capSurplusCoins({
        surplus: rawSurplus,
        surplusToday,
        cap: DAILY_SURPLUS_COIN_CAP,
        tokenless: rule.tokenless,
      });
      const coinsEarned = debtCoins + surplusCoins;
      const xpEarned = Math.floor(debtRepaid);

      const session = await tx.payoffSession.create({
        data: {
          amount: floored,
          activity: activityType,
          userId: req.userId,
          coinsEarned: surplusCoins,
          date: now,
        },
      });

      if (coinsEarned > 0 || xpEarned > 0) {
        await tx.user.update({
          where: { id: req.userId },
          data: {
            ...(coinsEarned > 0 ? { coins: { increment: coinsEarned } } : {}),
            ...(xpEarned > 0 ? { xp: { increment: xpEarned } } : {}),
          },
        });
      }

      const owedAgg = await tx.debt.aggregate({
        where: { userId: req.userId, resolved: false },
        _sum: { amountOwed: true },
      });

      return {
        session,
        totalOwed: Math.ceil(owedAgg._sum.amountOwed || 0),
        coinsEarned,
        debtCoins,
        surplusCoins,
        multiplierUsed,
        xpEarned,
        surplusCapped,
      };
    });

    const { level, leveledUp } = await syncLevel(prisma, req.userId);

    return res.status(201).json({
      session: result.session,
      totalOwed: result.totalOwed,
      coinsEarned: result.coinsEarned,
      debtCoins: result.debtCoins,
      surplusCoins: result.surplusCoins,
      amountApplied: floored,
      multiplierUsed: result.multiplierUsed,
      xpEarned: result.xpEarned,
      surplusCapped: result.surplusCapped,
      leveledUp,
      newLevel: level,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sessions — get payoff session history for the user
router.get('/', auth, async (req, res) => {
  try {
    const [sessions, aggregate] = await Promise.all([
      prisma.payoffSession.findMany({
        where: { userId: req.userId },
        orderBy: { date: 'desc' },
        take: 30,
      }),
      prisma.payoffSession.aggregate({
        where: { userId: req.userId },
        _sum: { amount: true },
      }),
    ]);

    const totalCompleted = sessions.reduce((sum, s) => sum + s.amount, 0);
    const allTimePaid = aggregate._sum.amount || 0;

    return res.json({ sessions, totalCompleted, allTimePaid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
