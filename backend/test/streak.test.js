const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStreak, buildDayStats, dayQualifies } = require('../src/lib/streak');

const TODAY = '2026-10-28';
const map = (obj) => new Map(Object.entries(obj));

test('80% rule', () => {
  assert.equal(dayQualifies({ due: 5, done: 4 }), true);
  assert.equal(dayQualifies({ due: 5, done: 3 }), false);
  assert.equal(dayQualifies({ due: 1, done: 1 }), true);
  assert.equal(dayQualifies({ due: 0, done: 0 }), false);
});

test('counts consecutive clean days, skips empty days, today only if it qualifies', () => {
  const days = map({
    '2026-10-28': { due: 2, done: 1 }, // today, not yet qualifying — doesn't break
    '2026-10-27': { due: 1, done: 1 },
    '2026-10-25': { due: 5, done: 4 }, // 26th empty → neutral
    '2026-10-24': { due: 2, done: 2 },
  });
  assert.equal(computeStreak({ today: TODAY, days }).streak, 3);
  days.set('2026-10-28', { due: 2, done: 2 });
  assert.equal(computeStreak({ today: TODAY, days }).streak, 4);
});

test('one grace day per rolling 7 days', () => {
  const days = map({
    '2026-10-27': { due: 1, done: 1 },
    '2026-10-26': { due: 1, done: 0 }, // grace
    '2026-10-25': { due: 1, done: 1 },
    '2026-10-24': { due: 1, done: 0 }, // second miss within 7 days → break
    '2026-10-23': { due: 1, done: 1 },
  });
  const r = computeStreak({ today: TODAY, days });
  assert.equal(r.streak, 2);
  assert.equal(r.graceUsedThisWeek, true);
  assert.deepEqual(r.graceDays, ['2026-10-26']);
});

test('grace refreshes after 7 days', () => {
  const days = map({
    '2026-10-27': { due: 1, done: 1 },
    '2026-10-26': { due: 1, done: 0 }, // grace #1
    '2026-10-25': { due: 1, done: 1 },
    '2026-10-24': { due: 1, done: 1 },
    '2026-10-23': { due: 1, done: 1 },
    '2026-10-22': { due: 1, done: 1 },
    '2026-10-21': { due: 1, done: 1 },
    '2026-10-19': { due: 1, done: 0 }, // 7 days before the 26th → new grace
    '2026-10-18': { due: 1, done: 1 },
  });
  const r = computeStreak({ today: TODAY, days });
  assert.equal(r.streak, 7);
  assert.deepEqual(r.graceDays, ['2026-10-26', '2026-10-19']);
});

test('no grace used this week when the grace day is older than 7 days', () => {
  const days = map({
    '2026-10-27': { due: 1, done: 1 },
    '2026-10-20': { due: 1, done: 0 },
    '2026-10-19': { due: 1, done: 1 },
  });
  const r = computeStreak({ today: TODAY, days });
  assert.equal(r.streak, 2);
  assert.equal(r.graceUsedThisWeek, false);
});

test('active shield is consumed on a miss after grace and reported', () => {
  const days = map({
    '2026-10-27': { due: 1, done: 0 }, // grace
    '2026-10-26': { due: 1, done: 0 }, // shield
    '2026-10-25': { due: 1, done: 1 },
    '2026-10-24': { due: 1, done: 0 }, // break
  });
  const r = computeStreak({ today: TODAY, days, shieldActive: true });
  assert.equal(r.shieldConsumedDate, '2026-10-26');
  assert.equal(r.streak, 2);
  const noShield = computeStreak({ today: TODAY, days });
  assert.equal(noShield.streak, 0);
});

test('persisted shield date stays clean on later computations without re-consuming', () => {
  const days = map({
    '2026-10-27': { due: 1, done: 0 },
    '2026-10-26': { due: 1, done: 0 },
    '2026-10-25': { due: 1, done: 1 },
  });
  const r = computeStreak({ today: TODAY, days, shieldDate: '2026-10-26', shieldActive: false });
  assert.equal(r.shieldConsumedDate, null);
  assert.equal(r.streak, 2);
  const r2 = computeStreak({ today: TODAY, days, shieldDates: ['2026-10-26'] });
  assert.equal(r2.streak, 2);
});

test('buildDayStats: completions count as due+done, missed quests count as due', () => {
  const tz = 'America/Los_Angeles';
  const days = buildDayStats({
    tz,
    today: TODAY,
    completions: [
      { id: 1, questId: 10, localDate: '2026-10-27' },
      { id: 2, questId: 11, localDate: '2026-10-26' }, // recurring quest, earlier day
    ],
    quests: [
      { id: 10, dueDate: new Date('2026-10-27T20:00:00-07:00'), completed: true, completedAt: new Date('2026-10-27T10:00:00-07:00') }, // on time → not double-counted
      { id: 11, dueDate: new Date('2026-10-27T23:59:00-07:00'), completed: false, completedAt: null }, // recurring, next instance missed
      { id: 12, dueDate: new Date('2026-10-27T09:00:00-07:00'), completed: false, completedAt: null }, // missed
      { id: 13, dueDate: new Date('2026-10-25T09:00:00-07:00'), completed: true, completedAt: new Date('2026-10-26T09:00:00-07:00') }, // late
    ],
  });
  assert.deepEqual(days.get('2026-10-27'), { due: 3, done: 1 });
  assert.deepEqual(days.get('2026-10-26'), { due: 1, done: 1 });
  assert.deepEqual(days.get('2026-10-25'), { due: 1, done: 0 });
});
