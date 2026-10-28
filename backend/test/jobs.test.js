const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// Stub the Prisma client so the job module loads without a generated engine.
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request.endsWith('/lib/prisma') || request === '../lib/prisma' || request === './prisma') return {};
  return origLoad.call(this, request, parent, ...rest);
};
const { nextRecurringDue } = require('../src/jobs/dailyDebt');
Module._load = origLoad;

const TZ = 'America/Los_Angeles';

test('daily quest completed this morning is NOT reset at 5pm local', () => {
  const quest = { recurrence: 'daily', completedAt: new Date('2026-10-28T08:00:00-07:00'), dueDate: new Date('2026-10-28T23:59:59.999-07:00') };
  // 5pm Seattle = 00:00 UTC next day — the old UTC-midnight bug.
  assert.equal(nextRecurringDue(quest, new Date('2026-10-28T17:05:00-07:00'), TZ), null);
});

test('daily quest resets after local midnight to end of the local day', () => {
  const quest = { recurrence: 'daily', completedAt: new Date('2026-10-28T08:00:00-07:00'), dueDate: new Date('2026-10-28T23:59:59.999-07:00') };
  const next = nextRecurringDue(quest, new Date('2026-10-29T00:05:00-07:00'), TZ);
  assert.equal(next.toISOString(), new Date('2026-10-29T23:59:59.999-07:00').toISOString());
});

test('weekly quest advances exactly 7 days once the local date has passed', () => {
  const due = new Date('2026-10-28T18:00:00-07:00');
  const quest = { recurrence: 'weekly', completedAt: new Date('2026-10-28T12:00:00-07:00'), dueDate: due };
  assert.equal(nextRecurringDue(quest, new Date('2026-10-28T22:00:00-07:00'), TZ), null);
  const next = nextRecurringDue(quest, new Date('2026-10-29T01:05:00-07:00'), TZ);
  assert.equal(next.getTime() - due.getTime(), 7 * 24 * 3600 * 1000);
});
