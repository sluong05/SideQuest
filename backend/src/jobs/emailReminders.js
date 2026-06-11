const { Resend } = require('resend');
const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { sendPushToUser } = require('./pushNotifications');

const resend = new Resend(process.env.RESEND_API_KEY);

const BASE_STYLE = `font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a2e;`;
const BTN_STYLE = `display:inline-block; background:#f59e0b; color:#1a1a2e; font-weight:bold; padding:12px 24px; border-radius:8px; text-decoration:none; margin:16px 0;`;

function formatLocalTime(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Runs every hour. Finds tasks due in the next 60 minutes and emails the owner.
 * Uses a slightly offset window (5 min → 65 min) to avoid double-sending on tasks
 * due exactly on the hour boundary.
 */
async function sendAtRiskReminders() {
  if (!process.env.RESEND_API_KEY) return;

  const now = new Date();
  const windowStart = new Date(now.getTime() + 5 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 65 * 60 * 1000);

  const tasks = await prisma.task.findMany({
    where: {
      completed: false,
      deletedAt: null,
      dueDate: { gt: windowStart, lte: windowEnd },
      user: { emailReminders: true },
    },
    include: { user: { select: { id: true, email: true, username: true, timezone: true } } },
  });

  if (tasks.length === 0) return;

  const byUser = {};
  for (const task of tasks) {
    if (!byUser[task.userId]) byUser[task.userId] = { user: task.user, tasks: [] };
    byUser[task.userId].tasks.push(task);
  }

  for (const { user, tasks: userTasks } of Object.values(byUser)) {
    const name = user.username || user.email;
    const taskRows = userTasks
      .map((t) => {
        const time = formatLocalTime(new Date(t.dueDate), user.timezone);
        return `<li style="margin-bottom:6px;"><strong>${t.title}</strong> — due at ${time}</li>`;
      })
      .join('');

    const count = userTasks.length;
    const subject = `⚠️ ${count} task${count > 1 ? 's' : ''} due in the next hour`;

    try {
      await resend.emails.send({
        from: 'noreply@pushupdebt.com',
        to: user.email,
        subject,
        html: `
          <div style="${BASE_STYLE}">
            <h2 style="color:#1a1a2e;">Hey ${name}, don't forget!</h2>
            <p>You have ${count} task${count > 1 ? 's' : ''} due in the next hour. Complete ${count > 1 ? 'them' : 'it'} now to avoid pushup debt:</p>
            <ul style="padding-left:20px; margin:12px 0;">${taskRows}</ul>
            <a href="${process.env.FRONTEND_URL}" style="${BTN_STYLE}">Open Dashboard</a>
            <p style="color:#666; font-size:12px; margin-top:16px;">
              You're receiving this because you have quests due soon on SideQuest.<br>
              Miss the deadline and you'll owe 5 pushups — don't say we didn't warn you.
            </p>
          </div>
        `,
      });
    } catch (err) {
      console.error(`[EmailJob] Failed to send at-risk reminder to ${user.email}:`, err.message);
    }
  }

  // Also push notify each user
  await Promise.all(
    Object.values(byUser).map(({ user, tasks: userTasks }) => {
      const count = userTasks.length;
      return sendPushToUser(
        user.id,
        `⚠️ ${count} task${count > 1 ? 's' : ''} due soon`,
        userTasks.map((t) => t.title).join(', '),
        '/'
      );
    })
  );

  console.log(`[EmailJob] Sent at-risk reminders to ${Object.keys(byUser).length} users`);
}

/**
 * Runs nightly at 20:00 UTC. Sends a digest to users who have outstanding debt or
 * incomplete tasks due today — i.e. users who have something actionable to see.
 */
async function sendDailyDigest() {
  if (!process.env.RESEND_API_KEY) return;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setUTCHours(23, 59, 59, 999);

  const users = await prisma.user.findMany({
    where: { emailReminders: true },
    select: {
      id: true,
      email: true,
      username: true,
      timezone: true,
      tasks: {
        where: { deletedAt: null, dueDate: { gte: todayStart, lte: todayEnd } },
        select: { id: true, title: true, completed: true, dueDate: true },
      },
      pushupDebts: {
        where: { resolved: false },
        select: { pushupsOwed: true },
      },
    },
  });

  let sent = 0;

  for (const user of users) {
    const totalOwed = user.pushupDebts.reduce((sum, d) => sum + d.pushupsOwed, 0);
    const completedToday = user.tasks.filter((t) => t.completed).length;
    const pendingToday = user.tasks.filter((t) => !t.completed);

    // Only email if there's something worth acting on
    if (pendingToday.length === 0 && totalOwed === 0) continue;

    const name = user.username || user.email;

    const pendingRows = pendingToday
      .map((t) => {
        const time = formatLocalTime(new Date(t.dueDate), user.timezone);
        return `<li style="margin-bottom:6px;"><strong>${t.title}</strong> — due at ${time}</li>`;
      })
      .join('');

    const debtLine =
      totalOwed > 0
        ? `<p style="color:#dc2626; font-weight:bold;">You currently owe <strong>${totalOwed} pushups</strong>. Pay them off before midnight to protect your streak.</p>`
        : '';

    const pendingSection =
      pendingToday.length > 0
        ? `<p>You have ${pendingToday.length} task${pendingToday.length > 1 ? 's' : ''} still pending today:</p>
           <ul style="padding-left:20px; margin:12px 0;">${pendingRows}</ul>`
        : '';

    const completedLine =
      completedToday > 0
        ? `<p style="color:#16a34a;">Nice work — you've completed ${completedToday} task${completedToday > 1 ? 's' : ''} today.</p>`
        : '';

    try {
      await resend.emails.send({
        from: 'noreply@pushupdebt.com',
        to: user.email,
        subject: totalOwed > 0 ? `💪 ${totalOwed} pushups owed — end of day recap` : `📋 Daily recap — tasks still pending`,
        html: `
          <div style="${BASE_STYLE}">
            <h2 style="color:#1a1a2e;">Evening recap, ${name}</h2>
            ${completedLine}
            ${pendingSection}
            ${debtLine}
            <a href="${process.env.FRONTEND_URL}" style="${BTN_STYLE}">Go to Dashboard</a>
            <p style="color:#666; font-size:12px; margin-top:16px;">
              Daily recap from SideQuest — keeping you honest, one quest at a time.
            </p>
          </div>
        `,
      });
      sent++;
    } catch (err) {
      console.error(`[EmailJob] Failed to send daily digest to ${user.email}:`, err.message);
    }
  }

  // Push notify users who have debt
  await Promise.all(
    users
      .filter((u) => {
        const owed = u.pushupDebts.reduce((s, d) => s + d.pushupsOwed, 0);
        return owed > 0;
      })
      .map((u) => {
        const owed = Math.ceil(u.pushupDebts.reduce((s, d) => s + d.pushupsOwed, 0));
        return sendPushToUser(u.id, '💪 Pushups owed', `You owe ${owed} pushups — don't let it pile up.`, '/verify-pushups');
      })
  );

  console.log(`[EmailJob] Sent daily digest to ${sent} users`);
}

function startEmailReminderJobs() {
  // At-risk reminder — every hour at :00
  cron.schedule('0 * * * *', async () => {
    console.log('[EmailJob] Running at-risk reminder check...');
    try {
      await sendAtRiskReminders();
    } catch (err) {
      console.error('[EmailJob] At-risk reminder error:', err);
    }
  });

  // Daily digest — 20:00 UTC
  cron.schedule('0 20 * * *', async () => {
    console.log('[EmailJob] Running daily digest...');
    try {
      await sendDailyDigest();
    } catch (err) {
      console.error('[EmailJob] Daily digest error:', err);
    }
  });

  console.log('[EmailJob] Email reminder crons scheduled (hourly at-risk + 20:00 UTC digest)');
}

module.exports = { sendAtRiskReminders, sendDailyDigest, startEmailReminderJobs };
