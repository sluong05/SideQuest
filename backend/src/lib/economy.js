// Pure economy rules (XP, levels, coins, payoff limits) shared by the quest and
// payoff-session routes. No DB access at module load so it can be unit-tested
// without a generated Prisma client.

const XP_BY_DIFFICULTY = { easy: 25, medium: 50, hard: 100 };
const XP_PER_LEVEL = 500;
const ON_TIME_COINS = 2;

// Payoff-session limits (see docs/AUDIT_FIXES.md)
const FITNESS_MAX_REPS_PER_SEC = 1.5;
const FITNESS_RATE_BUFFER = 3; // grace reps so a quick legit set isn't rejected
const WELLNESS_MAX_PER_SESSION = 50; // wellness + chores
const CUSTOM_MAX_PER_SESSION = 25;
const CUSTOM_MAX_PER_DAY = 100;

function xpForDifficulty(difficulty) {
  return XP_BY_DIFFICULTY[difficulty] ?? 50;
}

// Every 500 XP = 1 level (level 1 at 0 XP).
function levelForXp(xp) {
  return Math.floor(Math.max(0, Number(xp) || 0) / XP_PER_LEVEL) + 1;
}

// A completion earns XP/coins/leaderboard credit only if the quest is at least
// `minAgeSeconds` old and fewer than `dailyCap` completions were logged earlier
// that local day. Deterministic, so uncomplete can recompute it exactly.
function isCompletionCredited({ createdAt, completedAt, earlierCompletionsToday, minAgeSeconds, dailyCap }) {
  const age = new Date(completedAt).getTime() - new Date(createdAt).getTime();
  return age >= minAgeSeconds * 1000 && earlierCompletionsToday < dailyCap;
}

function isOnTime(completedAt, dueDate) {
  return new Date(completedAt).getTime() <= new Date(dueDate).getTime();
}

// XP/coins a completion is worth (0/0 when not credited).
function completionRewards({ credited, onTime, xpReward }) {
  if (!credited) return { xp: 0, coins: 0 };
  return { xp: Math.max(0, xpReward ?? 50), coins: onTime ? ON_TIME_COINS : 0 };
}

// Surplus coins after the per-local-day cap. Token-less (legacy) sessions earn none.
function capSurplusCoins({ surplus, surplusToday = 0, cap, tokenless = false }) {
  const raw = Math.max(0, Math.floor(surplus || 0));
  if (tokenless) return { coins: 0, capped: raw > 0 };
  const allowed = Math.max(0, cap - Math.max(0, surplusToday));
  const coins = Math.min(raw, allowed);
  return { coins, capped: coins < raw };
}

/**
 * Validates a payoff submission against the per-activity rules.
 * `token` is the decoded, already signature-verified start token (or null):
 *   { activity, startedAtMs }.
 * Returns { ok: true, tokenless } or { ok: false, error }.
 *
 * Token-less submissions for non-fitness activities are accepted (with the
 * per-session caps, and never earning surplus coins) unless requireToken is
 * set, because the live App Store build logs those activities without a token.
 */
function checkPayoffRules({ activity, amount, token, nowMs, customToday = 0, requireToken = false }) {
  const tokenless = !token;
  if (tokenless && requireToken) {
    return { ok: false, error: 'Session expired or missing — reopen the payoff screen and try again' };
  }
  const elapsedMs = token ? Math.max(0, nowMs - token.startedAtMs) : null;

  if (activity === 'fitness') {
    if (token) {
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const maxReps = elapsedSec * FITNESS_MAX_REPS_PER_SEC + FITNESS_RATE_BUFFER;
      if (amount > maxReps) {
        return { ok: false, error: 'That many reps in this little time is not humanly possible — nice try' };
      }
    }
    return { ok: true, tokenless };
  }

  if (activity === 'focus') {
    if (token) {
      const minutes = Math.floor(elapsedMs / 60000);
      if (amount > minutes) {
        return { ok: false, error: `You can log at most ${minutes} focus minute${minutes === 1 ? '' : 's'} for this session` };
      }
    } else if (amount > WELLNESS_MAX_PER_SESSION) {
      return { ok: false, error: `You can log at most ${WELLNESS_MAX_PER_SESSION} pts per session` };
    }
    return { ok: true, tokenless };
  }

  if (activity === 'wellness' || activity === 'chores') {
    if (amount > WELLNESS_MAX_PER_SESSION) {
      return { ok: false, error: `You can log at most ${WELLNESS_MAX_PER_SESSION} pts per ${activity} session` };
    }
    return { ok: true, tokenless };
  }

  if (activity === 'custom') {
    if (amount > CUSTOM_MAX_PER_SESSION) {
      return { ok: false, error: `You can log at most ${CUSTOM_MAX_PER_SESSION} pts per custom session` };
    }
    if (customToday + amount > CUSTOM_MAX_PER_DAY) {
      const left = Math.max(0, CUSTOM_MAX_PER_DAY - customToday);
      return { ok: false, error: `Custom activities are capped at ${CUSTOM_MAX_PER_DAY} pts per day (${left} left today)` };
    }
    return { ok: true, tokenless };
  }

  return { ok: false, error: 'Invalid activity' };
}

// Recomputes and stores the user's level from their current XP. Pass a
// transaction client or the prisma client.
async function syncLevel(db, userId) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { xp: true, level: true } });
  if (!user) return { level: 1, leveledUp: false };
  const level = levelForXp(user.xp);
  if (level !== user.level) {
    await db.user.update({ where: { id: userId }, data: { level } });
  }
  return { level, leveledUp: level > user.level, xp: user.xp };
}

// Decrement an Int counter on the user without going below zero.
async function decrementClamped(db, userId, field, by) {
  if (!by || by <= 0) return;
  const { count } = await db.user.updateMany({
    where: { id: userId, [field]: { gte: by } },
    data: { [field]: { decrement: by } },
  });
  if (count === 0) {
    await db.user.updateMany({ where: { id: userId, [field]: { lt: by } }, data: { [field]: 0 } });
  }
}

module.exports = {
  XP_BY_DIFFICULTY,
  XP_PER_LEVEL,
  ON_TIME_COINS,
  FITNESS_MAX_REPS_PER_SEC,
  FITNESS_RATE_BUFFER,
  WELLNESS_MAX_PER_SESSION,
  CUSTOM_MAX_PER_SESSION,
  CUSTOM_MAX_PER_DAY,
  xpForDifficulty,
  levelForXp,
  isCompletionCredited,
  isOnTime,
  completionRewards,
  capSurplusCoins,
  checkPayoffRules,
  syncLevel,
  decrementClamped,
};
