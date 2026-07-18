const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

const ACTIVITIES = ['fitness', 'focus', 'wellness', 'chores', 'custom'];

// Upper bound on a single logged session. The rep counter is client-side, so the
// server can't trust the reported amount — cap it to stop a tampered client from
// wiping all debt, minting unlimited coins, or cheating pushup challenges.
const MAX_SESSION_AMOUNT = 1000;

// Fitness sessions must also pass a pace check: the client fetches a signed
// start token (below) when the rep counter opens, and the server measures
// elapsed time from the token's own `iat` — so the start time can't be spoofed.
// A tampered client can still lie about reps, but only at a human pace over
// real wall-clock time.
const FITNESS_MAX_REPS_PER_SEC = 1.5;
const FITNESS_RATE_BUFFER = 3; // grace reps so a quick legit set isn't rejected

// POST /api/sessions/start — issue a signed token marking when a workout began
router.post('/start', auth, (req, res) => {
  const sessionToken = jwt.sign(
    { userId: req.userId, type: 'payoff-start' },
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

  if (activityType === 'fitness') {
    let start;
    try {
      start = jwt.verify(req.body.sessionToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Workout session expired or invalid — reload the pushup page and try again' });
    }
    if (start.type !== 'payoff-start' || start.userId !== req.userId) {
      return res.status(400).json({ error: 'Invalid workout session token' });
    }
    const elapsedSec = Math.floor(Date.now() / 1000) - start.iat;
    const maxReps = elapsedSec * FITNESS_MAX_REPS_PER_SEC + FITNESS_RATE_BUFFER;
    if (amount > maxReps) {
      return res.status(400).json({ error: 'That many reps in this little time is not humanly possible — nice try' });
    }
  }

  try {
    const floored = Math.floor(amount);

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { payoffMultiplierActive: true },
    });

    const session = await prisma.payoffSession.create({
      data: {
        amount: floored,
        activity: activityType,
        userId: req.userId,
      },
    });

    // If multiplier is active, each point counts as 2 for debt draining
    const drainPower = user.payoffMultiplierActive ? floored * 2 : floored;
    let remaining = drainPower;

    if (user.payoffMultiplierActive) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { payoffMultiplierActive: false },
      });
    }

    const debts = await prisma.debt.findMany({
      where: { resolved: false, userId: req.userId },
      orderBy: { createdAt: 'asc' },
    });

    for (const debt of debts) {
      if (remaining <= 0) break;

      if (remaining >= debt.amountOwed) {
        remaining -= debt.amountOwed;
        debt.amountOwed = 0;
        await prisma.debt.update({
          where: { id: debt.id },
          data: { amountOwed: 0, resolved: true },
        });
      } else {
        debt.amountOwed -= remaining;
        await prisma.debt.update({
          where: { id: debt.id },
          data: { amountOwed: debt.amountOwed },
        });
        remaining = 0;
      }
    }

    // How many debt points were actually wiped out this session.
    const debtRepaid = drainPower - remaining;

    // Coins are earned two ways:
    //   1. Debt repayment — 1 coin per 5 points of debt cleared.
    //   2. Surplus — when there's no (or not enough) debt to pay, the
    //      leftover effort converts to coins 1:1, capped at the amount logged.
    const debtCoins = Math.floor(debtRepaid / 5);
    const surplusCoins = remaining > 0 ? Math.min(remaining, floored) : 0;
    const coinsEarned = debtCoins + surplusCoins;

    if (coinsEarned > 0) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { coins: { increment: coinsEarned } },
      });
    }

    const totalOwed = Math.ceil(debts.reduce((sum, d) => sum + d.amountOwed, 0));
    const multiplierUsed = user.payoffMultiplierActive;

    return res.status(201).json({
      session,
      totalOwed,
      coinsEarned,
      debtCoins,
      surplusCoins,
      amountApplied: floored,
      multiplierUsed,
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
