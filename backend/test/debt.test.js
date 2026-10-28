const test = require('node:test');
const assert = require('node:assert/strict');
const {
  daysOverdueAt, chargeableDays, isFrozen, planDebtUpdate, deletePenaltyFor, withinFreeEditWindow,
} = require('../src/lib/debt');

const TZ = 'America/Los_Angeles';

test('daysOverdueAt: 0 before due, 1 right after, +1 per local midnight', () => {
  const due = new Date('2026-10-20T20:00:00-07:00');
  assert.equal(daysOverdueAt(due, new Date('2026-10-20T19:59:00-07:00'), TZ), 0);
  assert.equal(daysOverdueAt(due, new Date('2026-10-20T20:01:00-07:00'), TZ), 1);
  assert.equal(daysOverdueAt(due, new Date('2026-10-20T23:59:00-07:00'), TZ), 1);
  assert.equal(daysOverdueAt(due, new Date('2026-10-21T00:01:00-07:00'), TZ), 2);
  assert.equal(daysOverdueAt(due, new Date('2026-10-25T12:00:00-07:00'), TZ), 6);
});

test('daysOverdueAt uses the user timezone, not UTC', () => {
  // 23:00 Seattle = 06:00 UTC next day; still day 1 locally.
  const due = new Date('2026-10-20T22:00:00-07:00');
  assert.equal(daysOverdueAt(due, new Date('2026-10-20T23:00:00-07:00'), TZ), 1);
  assert.equal(daysOverdueAt(due, new Date('2026-10-20T23:00:00-07:00'), 'UTC'), 1);
  assert.equal(daysOverdueAt(due, new Date('2026-10-20T23:00:00-07:00'), 'Bad/Zone'), 1);
});

test('chargeableDays caps at DEBT_MAX_DAYS and subtracts frozen days', () => {
  assert.equal(chargeableDays(3, 0, 7), 3);
  assert.equal(chargeableDays(30, 0, 7), 7);
  assert.equal(chargeableDays(10, 5, 7), 5);
  assert.equal(chargeableDays(4, 6, 7), 0);
});

test('isFrozen for debt freeze or pause', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  assert.equal(isFrozen({}, now), false);
  assert.equal(isFrozen({ debtFreezeUntil: new Date('2026-10-21T00:00:00Z') }, now), true);
  assert.equal(isFrozen({ pausedUntil: new Date('2026-10-19T00:00:00Z') }, now), false);
  assert.equal(isFrozen({ pausedUntil: new Date('2026-10-22T00:00:00Z') }, now), true);
});

test('planDebtUpdate: create charges debtAmount per day', () => {
  assert.deepEqual(planDebtUpdate({ existing: null, daysOverdue: 1, frozen: false, debtAmount: 10, maxDays: 7 }),
    { action: 'create', daysOverdue: 1, frozenDays: 0, amount: 10 });
  assert.equal(planDebtUpdate({ existing: null, daysOverdue: 12, frozen: false, debtAmount: 5, maxDays: 7 }).amount, 35);
  assert.equal(planDebtUpdate({ existing: null, daysOverdue: 0, frozen: false, debtAmount: 5 }).action, 'none');
});

test('planDebtUpdate: frozen create records frozen days and charges nothing', () => {
  assert.deepEqual(planDebtUpdate({ existing: null, daysOverdue: 2, frozen: true, debtAmount: 5, maxDays: 7 }),
    { action: 'create', daysOverdue: 2, frozenDays: 2, amount: 0 });
});

test('planDebtUpdate: increments only new days', () => {
  const p = planDebtUpdate({ existing: { daysOverdue: 2, frozenDays: 0, resolved: false }, daysOverdue: 4, frozen: false, debtAmount: 5, maxDays: 7 });
  assert.deepEqual(p, { action: 'update', prevDaysOverdue: 2, daysOverdue: 4, frozenIncrement: 0, chargeIncrement: 10 });
  assert.equal(planDebtUpdate({ existing: { daysOverdue: 4, frozenDays: 0, resolved: false }, daysOverdue: 4, frozen: false, debtAmount: 5 }).action, 'none');
});

test('planDebtUpdate: days during a freeze are never back-charged', () => {
  // Days 1-2 charged, 3-5 frozen, then unfrozen on day 6.
  let debt = { daysOverdue: 2, frozenDays: 0, resolved: false };
  const frozenStep = planDebtUpdate({ existing: debt, daysOverdue: 5, frozen: true, debtAmount: 5, maxDays: 7 });
  assert.equal(frozenStep.frozenIncrement, 3);
  assert.equal(frozenStep.chargeIncrement, 0);
  debt = { daysOverdue: 5, frozenDays: 3, resolved: false };
  const after = planDebtUpdate({ existing: debt, daysOverdue: 6, frozen: false, debtAmount: 5, maxDays: 7 });
  assert.equal(after.chargeIncrement, 5); // only day 6
});

test('planDebtUpdate: stops charging at the cap', () => {
  const p = planDebtUpdate({ existing: { daysOverdue: 7, frozenDays: 0, resolved: false }, daysOverdue: 9, frozen: false, debtAmount: 5, maxDays: 7 });
  assert.equal(p.action, 'update'); // daysOverdue still advances
  assert.equal(p.chargeIncrement, 0);
  const q = planDebtUpdate({ existing: { daysOverdue: 6, frozenDays: 0, resolved: false }, daysOverdue: 9, frozen: false, debtAmount: 5, maxDays: 7 });
  assert.equal(q.chargeIncrement, 5);
});

test('planDebtUpdate: resolved debts never accrue', () => {
  assert.equal(planDebtUpdate({ existing: { daysOverdue: 1, frozenDays: 0, resolved: true }, daysOverdue: 3, frozen: false, debtAmount: 5 }).action, 'none');
});

test('delete penalty: free when completed or inside free window, else debtAmount', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const old = new Date('2026-10-20T11:00:00Z');
  const fresh = new Date('2026-10-20T11:50:00Z');
  assert.equal(deletePenaltyFor({ completed: false, createdAt: old, debtAmount: 12 }, now, 15), 12);
  assert.equal(deletePenaltyFor({ completed: true, createdAt: old, debtAmount: 12 }, now, 15), 0);
  assert.equal(deletePenaltyFor({ completed: false, createdAt: fresh, debtAmount: 12 }, now, 15), 0);
  assert.equal(withinFreeEditWindow({ createdAt: fresh }, now, 15), true);
  assert.equal(withinFreeEditWindow({ createdAt: old }, now, 15), false);
});
