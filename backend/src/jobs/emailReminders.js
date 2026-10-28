const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { sendReminderPush } = require('./pushNotifications');
const { escapeHtml } = require('../lib/escapeHtml');
const { withJobLock, claimOnce } = require('../lib/jobLock');
const { localDateString, localMidnightUTC, localEndOfDayUTC, isValidTimeZone } = require('../lib/timezone');
const { sendEmail, layout, button, siteLink, isEmailConfigured } = require('../lib/email');

// ── Schedule (all in the user's local time) ─────────────────────────────────
const HOURS = {
  morning: 8,     // plan for the day: quests due today
  onboarding: 10, // day-1 / day-3 nudges for users with no quests yet
  winback: 17,    // 7 / 14 days since last activity
  streak: 19,     // "keep your streak going" when streak >= 3 and quests are open
  digest: 20,     // evening recap
};
const QUIET_START = 23; // no due-soon reminders 23:00–06:59 local
const QUIET_END = 7;
const DUE_SOON_MAX_MS = 3 * 60 * 60 * 1000; // remind ~3h before due…
const DUE_SOON_MIN_MS = 15 * 60 * 1000;     // …but not in the last 15 minutes
const STREAK_MIN = 3;
const PAGE_SIZE = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Pure helpers (unit-tested in test/platform-reminders.test.js) ───────────
const hourFormatters = new Map();
function safeTz(tz) {
  return isValidTimeZone(tz) ? tz : 'UTC';
}
function localHour(date, timezone) {
  const tz = safeTz(timezone);
  if (!hourFormatters.has(tz)) {
    hourFormatters.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }));
  }
  return parseInt(hourFormatters.get(tz).format(date), 10) % 24;
}

function isQuietHour(hour) {
  return hour >= QUIET_START || hour < QUIET_END;
}

function isInDueSoonWindow(dueDate, now) {
  const diff = new Date(dueDate).getTime() - now.getTime();
  return diff > DUE_SOON_MIN_MS && diff <= DUE_SOON_MAX_MS;
}

function wholeDaysBetween(from, to) {
  return Math.floor((to.getTime() - new Date(from).getTime()) / DAY_MS);
}

/**
 * Decides which per-user, hour-of-day reminders apply right now.
 * @param {object} s
 *   localHour, paused (bool), currentStreak, dueTotal, duePending, debtOwed,
 *   questCount (all-time, incl. deleted), daysSinceSignup, daysInactive (null = unknown)
 * @returns {string[]} subset of morning|streak|digest|onboard1|onboard3|winback7|winback14
 */
function reminderKindsForUser(s) {
  const kinds = [];
  if (!s.paused) {
    if (s.localHour === HOURS.morning && s.duePending > 0) kinds.push('morning');
    if (s.localHour === HOURS.streak && s.currentStreak >= STREAK_MIN && s.duePending > 0) kinds.push('streak');
    if (s.localHour === HOURS.digest && (s.duePending > 0 || s.debtOwed > 0)) kinds.push('digest');
  }
  if (s.localHour === HOURS.onboarding && s.questCount === 0) {
    if (s.daysSinceSignup === 1) kinds.push('onboard1');
    if (s.daysSinceSignup === 3) kinds.push('onboard3');
  }
  if (s.localHour === HOURS.winback && s.daysInactive !== null && s.daysInactive !== undefined) {
    if (s.daysInactive >= 7 && s.daysInactive < 14) kinds.push('winback7');
    else if (s.daysInactive >= 14 && s.daysInactive < 30) kinds.push('winback14');
  }
  return kinds;
}

// Idempotency key for a kind (JobRun name + runKey). Daily kinds are per local
// date; onboarding once per user; win-back once per inactivity stretch.
function claimKeyFor(kind, user, { localDate }) {
  if (kind === 'onboard1' || kind === 'onboard3') return [kind, `${user.id}`];
  if (kind === 'winback7' || kind === 'winback14') {
    return [kind, `${user.id}:${new Date(user.lastActiveAt).toISOString().slice(0, 10)}`];
  }
  return [kind, `${user.id}:${localDate}`];
}

// ── Formatting ──────────────────────────────────────────────────────────────
function formatLocalTime(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(timezone),
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function displayName(user) {
  return escapeHtml(user.username || user.email.split('@')[0]);
}

function questList(quests, timezone) {
  const rows = quests
    .map((q) => `<li style="margin-bottom:6px;"><strong>${escapeHtml(q.title)}</strong> — due ${formatLocalTime(new Date(q.dueDate), timezone)}</li>`)
    .join('');
  return `<ul style="padding-left:20px; margin:12px 0;">${rows}</ul>`;
}

function plainTitles(quests, max = 3) {
  const titles = quests.slice(0, max).map((q) => q.title).join(', ');
  return quests.length > max ? `${titles} +${quests.length - max} more` : titles;
}

// Returns { subject, html, push: { title, body, url } } for a kind.
function buildMessage(kind, user, ctx) {
  const name = displayName(user);
  const tz = user.timezone;
  const pending = ctx.pending || [];
  const footerNote = "You're getting this because reminders are on for your SideQuest account.";

  switch (kind) {
    case 'morning':
      return {
        subject: `Today's plan: ${plural(pending.length, 'quest')}`,
        html: layout(`
          <h2>Good morning, ${name}</h2>
          <p>Here's what's on your list today:</p>
          ${questList(pending, tz)}
          ${button(siteLink('/'), 'Open SideQuest')}
        `, { unsubscribeUserId: user.id, footerNote }),
        push: { title: "☀️ Today's plan", body: `${plural(pending.length, 'quest')} today: ${plainTitles(pending)}`, url: '/' },
      };
    case 'due3h':
      return {
        subject: `Coming up: ${ctx.quest.title.slice(0, 80)}`,
        html: layout(`
          <h2>Heads up, ${name}</h2>
          <p><strong>${escapeHtml(ctx.quest.title)}</strong> is due at ${formatLocalTime(new Date(ctx.quest.dueDate), tz)} — there's still time to get it done.</p>
          ${button(siteLink('/'), 'Open SideQuest')}
        `, { unsubscribeUserId: user.id, footerNote }),
        push: { title: '⏰ Due in about 3 hours', body: `${ctx.quest.title} — due ${formatLocalTime(new Date(ctx.quest.dueDate), tz)}`, url: '/' },
      };
    case 'streak':
      return {
        subject: `Keep your ${user.currentStreak}-day streak going`,
        html: layout(`
          <h2>${user.currentStreak} days and counting, ${name} 🔥</h2>
          <p>You still have ${plural(pending.length, 'quest')} open today. Finish ${pending.length === 1 ? 'it' : 'them'} to keep your streak alive:</p>
          ${questList(pending, tz)}
          ${button(siteLink('/'), 'Keep the streak')}
        `, { unsubscribeUserId: user.id, footerNote }),
        push: { title: `🔥 Keep your ${user.currentStreak}-day streak`, body: `${plural(pending.length, 'quest')} left today: ${plainTitles(pending)}`, url: '/' },
      };
    case 'digest': {
      const owed = Math.ceil(ctx.debtOwed || 0);
      const doneLine = ctx.completedToday > 0
        ? `<p style="color:#16a34a;">Nice work — you've completed ${plural(ctx.completedToday, 'quest')} today.</p>`
        : '';
      const pendingSection = pending.length > 0
        ? `<p>Still open today:</p>${questList(pending, tz)}`
        : '';
      const debtLine = owed > 0
        ? `<p>Your debt balance is <strong>${owed} pts</strong>. Pay it off whenever you're ready — every bit counts.</p>`
        : '';
      return {
        subject: owed > 0 ? `Your evening recap — ${owed} pts to pay off` : 'Your evening recap',
        html: layout(`
          <h2>Evening recap, ${name}</h2>
          ${doneLine}
          ${pendingSection}
          ${debtLine}
          ${button(siteLink(owed > 0 && pending.length === 0 ? '/pay' : '/'), owed > 0 && pending.length === 0 ? 'Pay off debt' : 'Open SideQuest')}
        `, { unsubscribeUserId: user.id, footerNote }),
        push: owed > 0
          ? { title: '💪 Evening recap', body: `${owed} pts of debt to pay off${pending.length ? ` · ${plural(pending.length, 'quest')} still open` : ''}.`, url: '/pay?from=debt' }
          : { title: '📋 Evening recap', body: `${plural(pending.length, 'quest')} still open today.`, url: '/' },
      };
    }
    case 'onboard1':
    case 'onboard3':
      return {
        subject: kind === 'onboard1' ? 'Start with one small quest' : 'Your first quest is waiting',
        html: layout(`
          <h2>Welcome to SideQuest, ${name}</h2>
          <p>${kind === 'onboard1'
            ? 'The easiest way to start is one small quest for today — a walk, a chapter, a tidy desk. Give it a due time and see how it feels.'
            : "Still thinking about your first quest? Pick something you'd do anyway this week, add it, and let SideQuest keep you on track."}</p>
          ${button(siteLink('/'), 'Create a quest')}
        `, { unsubscribeUserId: user.id, footerNote }),
        push: { title: 'Ready for your first quest?', body: 'Add one small goal for today — it takes 10 seconds.', url: '/' },
      };
    case 'winback7':
    case 'winback14':
      return {
        subject: kind === 'winback7' ? 'Pick up where you left off' : 'A fresh start is one tap away',
        html: layout(`
          <h2>We saved your spot, ${name}</h2>
          <p>${kind === 'winback7'
            ? "It's been about a week. Your progress is right where you left it — one quest today is all it takes to get rolling again."
            : "Life gets busy. If things piled up, you can pause or take a Fresh Start and come back to a clean slate."}</p>
          ${button(siteLink('/'), 'Jump back in')}
        `, { unsubscribeUserId: user.id, footerNote }),
        push: { title: kind === 'winback7' ? 'Pick up where you left off' : 'Ready for a fresh start?', body: 'One quest today is all it takes.', url: '/' },
      };
    default:
      throw new Error(`Unknown reminder kind ${kind}`);
  }
}

// ── Delivery ────────────────────────────────────────────────────────────────
function wantsEmail(user) {
  return isEmailConfigured() && user.emailVerified && user.emailReminders;
}

async function deliver(kind, user, ctx, stats) {
  const msg = buildMessage(kind, user, ctx);
  const jobs = [];
  if (wantsEmail(user)) {
    jobs.push(
      sendEmail({ to: user.email, subject: msg.subject, html: msg.html, unsubscribeUserId: user.id })
        .then((sent) => { if (sent) stats.email++; })
        .catch((err) => console.error(`[Reminders] ${kind} email to user ${user.id} failed:`, err.message))
    );
  }
  if (wantsPush(user)) {
    jobs.push(
      sendReminderPush(user, msg.push.title, msg.push.body, msg.push.url)
        .then(() => { stats.push++; })
        .catch((err) => console.error(`[Reminders] ${kind} push to user ${user.id} failed:`, err.message))
    );
  }
  await Promise.all(jobs);
}

const USER_SELECT = {
  id: true, email: true, username: true, timezone: true, createdAt: true,
  emailVerified: true, emailReminders: true, pushReminders: true,
  currentStreak: true, pausedUntil: true, debtFreezeUntil: true, lastActiveAt: true,
  _count: { select: { quests: true, deviceTokens: true, pushSubscriptions: true } },
};

function wantsPush(user) {
  return user.pushReminders && (user._count.deviceTokens > 0 || user._count.pushSubscriptions > 0);
}

// Users reachable on at least one channel.
function reachableUserWhere() {
  const hasPushTarget = { OR: [{ deviceTokens: { some: {} } }, { pushSubscriptions: { some: {} } }] };
  const or = [{ pushReminders: true, ...hasPushTarget }];
  if (isEmailConfigured()) or.push({ emailVerified: true, emailReminders: true });
  return { OR: or };
}

// ~3h-before-due reminder, once per quest occurrence (quest id + due date, so a
// recurring quest is reminded again for its next due date).
async function runDueSoon(now, stats) {
  const where = {
    completed: false,
    deletedAt: null,
    dueDate: { gt: new Date(now.getTime() + DUE_SOON_MIN_MS), lte: new Date(now.getTime() + DUE_SOON_MAX_MS) },
    user: reachableUserWhere(),
  };
  let cursor;
  for (;;) {
    const quests = await prisma.quest.findMany({
      where,
      select: { id: true, title: true, dueDate: true, user: { select: USER_SELECT } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (quests.length === 0) break;
    cursor = quests[quests.length - 1].id;

    for (const q of quests) {
      try {
        const user = q.user;
        if (isPaused(user, now) || !isInDueSoonWindow(q.dueDate, now)) continue;
        if (isQuietHour(localHour(now, user.timezone))) continue; // don't claim; a later run may still fit
        if (!(await claimOnce('due3h', `${q.id}:${new Date(q.dueDate).toISOString()}`))) continue;
        await deliver('due3h', user, { quest: q }, stats);
      } catch (err) {
        console.error(`[Reminders] due3h for quest ${q.id} failed:`, err.message);
      }
    }
    if (quests.length < PAGE_SIZE) break;
  }
}

function isPaused(user, now) {
  return (user.pausedUntil && new Date(user.pausedUntil) > now) ||
    (user.debtFreezeUntil && new Date(user.debtFreezeUntil) > now);
}

const ACTIVE_HOURS = new Set(Object.values(HOURS));

async function runHourOfDay(now, stats) {
  let cursor;
  for (;;) {
    const users = await prisma.user.findMany({
      where: reachableUserWhere(),
      select: USER_SELECT,
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (users.length === 0) break;
    cursor = users[users.length - 1].id;

    // Only users whose local clock is on a scheduled hour need any work.
    const due = users
      .map((u) => ({ user: u, hour: localHour(now, u.timezone) }))
      .filter((x) => ACTIVE_HOURS.has(x.hour));

    if (due.length > 0) {
      const needQuests = due.filter((x) => [HOURS.morning, HOURS.streak, HOURS.digest].includes(x.hour)).map((x) => x.user.id);
      const needDebt = due.filter((x) => x.hour === HOURS.digest).map((x) => x.user.id);

      // One query per page: every quest due within ±1 day of now, bucketed per
      // user's local day below.
      const [quests, debts] = await Promise.all([
        needQuests.length
          ? prisma.quest.findMany({
            where: {
              userId: { in: needQuests },
              deletedAt: null,
              dueDate: { gte: new Date(now.getTime() - 1.5 * DAY_MS), lte: new Date(now.getTime() + 1.5 * DAY_MS) },
            },
            select: { id: true, userId: true, title: true, dueDate: true, completed: true },
            orderBy: { dueDate: 'asc' },
          })
          : [],
        needDebt.length
          ? prisma.debt.groupBy({ by: ['userId'], where: { userId: { in: needDebt }, resolved: false }, _sum: { amountOwed: true } })
          : [],
      ]);
      const debtMap = new Map(debts.map((d) => [d.userId, d._sum.amountOwed || 0]));

      for (const { user, hour } of due) {
        try {
          const tz = safeTz(user.timezone);
          const localDate = localDateString(now, tz);
          const dayStart = localMidnightUTC(localDate, tz);
          const dayEnd = localEndOfDayUTC(localDate, tz);
          const dueToday = quests.filter((q) => q.userId === user.id && q.dueDate >= dayStart && q.dueDate <= dayEnd);
          const pending = dueToday.filter((q) => !q.completed);
          const debtOwed = debtMap.get(user.id) || 0;

          const kinds = reminderKindsForUser({
            localHour: hour,
            paused: !!isPaused(user, now),
            currentStreak: user.currentStreak || 0,
            dueTotal: dueToday.length,
            duePending: pending.length,
            debtOwed,
            questCount: user._count.quests,
            daysSinceSignup: wholeDaysBetween(user.createdAt, now),
            daysInactive: user.lastActiveAt ? wholeDaysBetween(user.lastActiveAt, now) : null,
          });

          for (const kind of kinds) {
            const [name, runKey] = claimKeyFor(kind, user, { localDate });
            if (!(await claimOnce(name, runKey))) continue;
            await deliver(kind, user, {
              pending,
              debtOwed,
              completedToday: dueToday.length - pending.length,
            }, stats);
          }
        } catch (err) {
          console.error(`[Reminders] user ${user.id} failed:`, err.message);
        }
      }
    }
    if (users.length < PAGE_SIZE) break;
  }
}

async function runHourlyReminders(now = new Date()) {
  const result = await withJobLock('reminders-hourly', async () => {
    const stats = { email: 0, push: 0 };
    await runDueSoon(now, stats);
    await runHourOfDay(now, stats);
    return stats;
  });
  if (result && result.skipped) {
    console.log('[Reminders] another instance holds the lock — skipped');
  } else {
    console.log(`[Reminders] done — ${result.email} emails, ${result.push} push batches`);
  }
  return result;
}

function startEmailReminderJobs() {
  // Hourly; every reminder is scheduled in the user's local time inside the run.
  cron.schedule('0 * * * *', async () => {
    try {
      await runHourlyReminders();
    } catch (err) {
      console.error('[Reminders] hourly run error:', err);
    }
  });
  console.log('[Reminders] hourly reminder job scheduled (local-time morning/due-soon/streak/digest/onboarding/win-back)');
}

module.exports = {
  startEmailReminderJobs,
  runHourlyReminders,
  // pure helpers for tests
  localHour,
  isQuietHour,
  isInDueSoonWindow,
  reminderKindsForUser,
  claimKeyFor,
  buildMessage,
  HOURS,
};
