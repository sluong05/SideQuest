// Streak rules (docs/AUDIT_FIXES.md "Streak"):
//  - A local day counts if >= 80% of the quests due that day were completed.
//    "Due that day" = quests completed that day (QuestCompletion) plus quests
//    whose dueDate falls on that day and that weren't completed by then.
//    Days with nothing due are neutral (skipped).
//  - One free grace day per rolling 7 days bridges a missed day (not counted).
//  - A purchased Streak Shield protects one specific day, persisted in
//    User.streakShieldDate (stored as UTC midnight of the local "YYYY-MM-DD");
//    that day is treated as clean from then on. Every consumed date is also
//    recorded in the JobRun ledger ("streak-shield", "<userId>:<date>") so an
//    earlier protected day stays protected after a later shield overwrites
//    streakShieldDate.
//  - Today only adds to the streak once it already qualifies; an unfinished
//    today never breaks it.
const { localDateString, localMidnightUTC, localEndOfDayUTC } = require('./timezone');
const { safeTz, dayDiff, addDays } = require('./debt');
// Lazy: jobLock loads the Prisma client, which the pure-function tests avoid.
const claimOnce = (...args) => require('./jobLock').claimOnce(...args);

const SHIELD_JOB = 'streak-shield';

const STREAK_RATIO = 0.8;
const GRACE_WINDOW_DAYS = 7;
const LOOKBACK_DAYS = 365;

function dayQualifies(stat) {
  return Boolean(stat && stat.due > 0 && stat.done / stat.due >= STREAK_RATIO - 1e-9);
}

/**
 * Pure streak walk.
 *   today: "YYYY-MM-DD" (user's local date)
 *   days:  Map<"YYYY-MM-DD", { due, done }>
 *   shieldDates: Set<"YYYY-MM-DD"> | array — days already protected by consumed shields
 *   shieldDate: "YYYY-MM-DD" | null — (legacy single-date form, merged into shieldDates)
 *   shieldActive: boolean — an unconsumed shield is available
 * Returns { streak, shieldConsumedDate, graceDays, graceUsedThisWeek }.
 */
function computeStreak({ today, days, shieldDate = null, shieldDates = [], shieldActive = false, lookback = LOOKBACK_DAYS }) {
  const protectedDays = new Set(shieldDates);
  if (shieldDate) protectedDays.add(shieldDate);
  let streak = 0;
  let shieldConsumedDate = null;
  let shieldAvailable = Boolean(shieldActive);
  const graceDays = [];

  if (dayQualifies(days.get(today))) streak++;

  for (let i = 1; i <= lookback; i++) {
    const day = addDays(today, -i);
    const stat = days.get(day);
    if (!stat || stat.due === 0) continue; // neutral day

    if (dayQualifies(stat) || protectedDays.has(day)) {
      streak++;
      continue;
    }
    const lastGrace = graceDays[graceDays.length - 1];
    if (!lastGrace || dayDiff(day, lastGrace) >= GRACE_WINDOW_DAYS) {
      graceDays.push(day); // bridges the gap, doesn't add to the count
      continue;
    }
    if (shieldAvailable) {
      shieldAvailable = false;
      shieldConsumedDate = day;
      streak++;
      continue;
    }
    break;
  }

  const graceUsedThisWeek = graceDays.some((d) => dayDiff(d, today) < GRACE_WINDOW_DAYS);
  return { streak, shieldConsumedDate, graceDays, graceUsedThisWeek };
}

/**
 * Builds the per-day { due, done } map.
 *   completions: [{ id, questId, localDate }]
 *   quests:      [{ id, dueDate, completed, completedAt }] (non-deleted quests
 *                due inside the window; for recurring quests dueDate is the
 *                current instance)
 * A quest adds a "due, not done" entry on its due day if it is still not
 * completed, or was completed only after its due day. Completions themselves
 * count as due+done on the day they happened.
 */
function buildDayStats({ completions, quests, tz, today }) {
  const days = new Map();
  const bump = (day, field) => {
    if (day > today) return;
    const s = days.get(day) || { due: 0, done: 0 };
    s[field]++;
    if (field === 'done') s.due++;
    days.set(day, s);
  };

  for (const c of completions) bump(c.localDate, 'done');
  for (const q of quests) {
    const dueDay = localDateString(new Date(q.dueDate), tz);
    if (q.completed && q.completedAt && localDateString(new Date(q.completedAt), tz) <= dueDay) continue;
    bump(dueDay, 'due');
  }
  return days;
}

function shieldDateToString(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : null;
}
function shieldStringToDate(s) {
  return s ? new Date(`${s}T00:00:00.000Z`) : null;
}

// Computes the streak for a user, persists shield consumption and caches
// currentStreak / maxStreak. Returns { streak, graceUsedThisWeek, maxStreak }.
async function refreshStreak(prisma, userId, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true, streakShieldActive: true, streakShieldDate: true, maxStreak: true, currentStreak: true,
      lastFreshStartAt: true,
    },
  });
  if (!user) return { streak: 0, graceUsedThisWeek: false, maxStreak: 0 };
  const tz = safeTz(user.timezone);
  const today = localDateString(now, tz);
  const startDay = addDays(today, -LOOKBACK_DAYS);
  let windowStart = localMidnightUTC(startDay, tz);
  // A Fresh Start resets the streak: history before it no longer counts.
  if (user.lastFreshStartAt && user.lastFreshStartAt > windowStart) windowStart = user.lastFreshStartAt;
  const endOfToday = localEndOfDayUTC(today, tz);

  const [completions, quests, shieldRuns] = await Promise.all([
    prisma.questCompletion.findMany({
      where: {
        userId,
        localDate: { gte: startDay },
        completedAt: { gte: windowStart },
        // Completions are history and always count (incl. quests deleted later —
        // the cleanup job nulls questId, so filtering on the quest would be
        // inconsistent). Deleted quests are excluded from the *due* set below.
      },
      select: { id: true, questId: true, localDate: true },
    }),
    prisma.quest.findMany({
      // Today's quests are included so "today" only counts once >= 80% are done
      // (an unfinished today never breaks the streak).
      where: { userId, deletedAt: null, dueDate: { gte: windowStart, lte: endOfToday } },
      select: { id: true, dueDate: true, completed: true, completedAt: true },
    }),
    prisma.jobRun.findMany({
      where: { name: SHIELD_JOB, runKey: { startsWith: `${userId}:` } },
      select: { runKey: true },
    }),
  ]);
  const shieldDates = shieldRuns.map((r) => r.runKey.slice(String(userId).length + 1));

  const days = buildDayStats({ completions, quests, tz, today });
  const result = computeStreak({
    today,
    days,
    shieldDate: shieldDateToString(user.streakShieldDate),
    shieldDates,
    shieldActive: user.streakShieldActive,
  });

  const updates = {};
  if (result.shieldConsumedDate) {
    updates.streakShieldActive = false;
    updates.streakShieldDate = shieldStringToDate(result.shieldConsumedDate);
  }
  if (result.streak !== user.currentStreak) updates.currentStreak = result.streak;
  const maxStreak = Math.max(user.maxStreak ?? 0, result.streak);
  if (maxStreak !== user.maxStreak) updates.maxStreak = maxStreak;
  if (Object.keys(updates).length > 0) {
    if (result.shieldConsumedDate) {
      // Consume the shield only if it's still active (no double-consume races).
      const { count } = await prisma.user.updateMany({ where: { id: userId, streakShieldActive: true }, data: updates });
      if (count === 1) {
        await claimOnce(SHIELD_JOB, `${userId}:${result.shieldConsumedDate}`).catch((err) =>
          console.error('[Streak] shield ledger write failed:', err.message));
      } else {
        // Shield was consumed elsewhere meanwhile — still cache the streak.
        delete updates.streakShieldActive;
        delete updates.streakShieldDate;
        if (Object.keys(updates).length > 0) await prisma.user.update({ where: { id: userId }, data: updates });
      }
    } else {
      await prisma.user.update({ where: { id: userId }, data: updates });
    }
  }
  return { streak: result.streak, graceUsedThisWeek: result.graceUsedThisWeek, maxStreak };
}

module.exports = {
  STREAK_RATIO,
  GRACE_WINDOW_DAYS,
  LOOKBACK_DAYS,
  dayQualifies,
  computeStreak,
  buildDayStats,
  shieldDateToString,
  shieldStringToDate,
  refreshStreak,
};
