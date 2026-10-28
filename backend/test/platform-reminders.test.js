const test = require('node:test');
const assert = require('node:assert/strict');
require('./platform-stub');
const r = require('../src/jobs/emailReminders');

const base = {
  localHour: 0, paused: false, currentStreak: 0, dueTotal: 0, duePending: 0,
  debtOwed: 0, questCount: 5, daysSinceSignup: 30, daysInactive: 0,
};

test('localHour respects timezone and falls back to UTC', () => {
  const t = new Date('2026-10-28T15:00:00Z');
  assert.equal(r.localHour(t, 'UTC'), 15);
  assert.equal(r.localHour(t, 'America/Los_Angeles'), 8);
  assert.equal(r.localHour(t, 'Asia/Tokyo'), 0);
  assert.equal(r.localHour(t, 'Not/AZone'), 15);
});

test('morning plan at 08:00 only with quests due today', () => {
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: 8, duePending: 2 }), ['morning']);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: 8 }), []);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: 9, duePending: 2 }), []);
});

test('streak reminder at 19:00 needs streak >= 3 and open quests', () => {
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: 19, currentStreak: 3, duePending: 1 }), ['streak']);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: 19, currentStreak: 2, duePending: 1 }), []);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: 19, currentStreak: 9, duePending: 0, dueTotal: 3 }), []);
});

test('digest at 20:00 when pending or debt; paused users get none of the daily kinds', () => {
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: 20, debtOwed: 5 }), ['digest']);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: 20 }), []);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: 20, debtOwed: 5, paused: true }), []);
});

test('onboarding day 1 / day 3 only for users with zero quests', () => {
  const h = r.HOURS.onboarding;
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: h, questCount: 0, daysSinceSignup: 1 }), ['onboard1']);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: h, questCount: 0, daysSinceSignup: 3 }), ['onboard3']);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: h, questCount: 0, daysSinceSignup: 2 }), []);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: h, questCount: 1, daysSinceSignup: 1 }), []);
});

test('win-back at 7 and 14 days inactive', () => {
  const h = r.HOURS.winback;
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: h, daysInactive: 7 }), ['winback7']);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: h, daysInactive: 15 }), ['winback14']);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: h, daysInactive: 6 }), []);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: h, daysInactive: null }), []);
  assert.deepEqual(r.reminderKindsForUser({ ...base, localHour: h, daysInactive: 45 }), []);
});

test('claim keys: daily per local date, onboarding once, win-back per inactivity stretch', () => {
  const user = { id: 9, lastActiveAt: new Date('2026-10-01T10:00:00Z') };
  assert.deepEqual(r.claimKeyFor('digest', user, { localDate: '2026-10-28' }), ['digest', '9:2026-10-28']);
  assert.deepEqual(r.claimKeyFor('onboard1', user, { localDate: '2026-10-28' }), ['onboard1', '9']);
  assert.deepEqual(r.claimKeyFor('winback7', user, { localDate: 'x' }), ['winback7', '9:2026-10-01']);
});

test('due-soon window ~3h ahead and quiet hours', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  assert.equal(r.isInDueSoonWindow(new Date('2026-10-28T14:59:00Z'), now), true);
  assert.equal(r.isInDueSoonWindow(new Date('2026-10-28T15:01:00Z'), now), false);
  assert.equal(r.isInDueSoonWindow(new Date('2026-10-28T12:10:00Z'), now), false);
  assert.equal(r.isQuietHour(23), true);
  assert.equal(r.isQuietHour(3), true);
  assert.equal(r.isQuietHour(7), false);
});

test('messages: debt deep-links to /pay, copy is not taunting, unsubscribe footer present', () => {
  const user = { id: 1, email: 'a@b.co', username: 'sam<x>', timezone: 'UTC', currentStreak: 4 };
  const digest = r.buildMessage('digest', user, { pending: [], debtOwed: 12.2, completedToday: 2 });
  assert.equal(digest.push.url, '/pay?from=debt');
  assert.match(digest.subject, /13 pts/);
  assert.match(digest.html, /sam&lt;x&gt;/);
  assert.match(digest.html, /Unsubscribe/);
  for (const kind of ['morning', 'streak', 'digest', 'onboard1', 'onboard3', 'winback7', 'winback14']) {
    const m = r.buildMessage(kind, user, { pending: [{ title: 'Read', dueDate: new Date() }], debtOwed: 0, completedToday: 0 });
    assert.doesNotMatch(m.html + m.subject + m.push.body, /don't say we didn't warn|verify-pushups/i, kind);
  }
});
