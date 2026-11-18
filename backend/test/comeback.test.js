const test = require('node:test');
const assert = require('node:assert/strict');
const { prismaStub } = require('./platform-stub');
const auth = require('../src/middleware/auth');
const { comebackUntilFor, comebackActive } = require('../src/lib/comeback');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-18T12:00:00Z');

test('comebackUntilFor opens a 3-day window after 5+ days away', () => {
  assert.equal(comebackUntilFor(null, now), null);
  assert.equal(comebackUntilFor(new Date(now - 4 * DAY), now), null);
  assert.equal(comebackUntilFor(new Date(now - 5 * DAY + 1000), now), null);
  const until = comebackUntilFor(new Date(now - 5 * DAY), now);
  assert.equal(until.toISOString(), new Date(now.getTime() + 3 * DAY).toISOString());
  assert.ok(comebackUntilFor(new Date(now - 40 * DAY), now));
});

test('comebackActive only while the window is open', () => {
  assert.equal(comebackActive(null, now), false);
  assert.equal(comebackActive(new Date(now.getTime() + 1000), now), true);
  assert.equal(comebackActive(new Date(now.getTime() - 1000), now), false);
});

function run(token) {
  return new Promise((resolve) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status() { return this; }, json(b) { resolve({ next: false, body: b }); return this; } };
    auth(req, res, () => resolve({ next: true }));
  });
}

test('middleware sets comebackUntil for a returning user, not for a regular one', async () => {
  prismaStub.users.set(71, { id: 71, tokenVersion: 0, lastActiveAt: new Date(Date.now() - 10 * DAY) });
  prismaStub.users.set(72, { id: 72, tokenVersion: 0, lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
  prismaStub.updates.length = 0;

  assert.equal((await run(auth.signAuthToken({ id: 71, tokenVersion: 0 }))).next, true);
  assert.ok(prismaStub.updates[0].data.comebackUntil instanceof Date);

  assert.equal((await run(auth.signAuthToken({ id: 72, tokenVersion: 0 }))).next, true);
  await new Promise((r) => setImmediate(r));
  assert.equal(prismaStub.updates[1].data.comebackUntil, undefined);
  assert.ok(prismaStub.updates[1].data.lastActiveAt instanceof Date);
});

test('deleting a quest whose debt was already settled is free', () => {
  const { deletePenaltyFor } = require('../src/lib/debt');
  const old = { completed: false, debtAmount: 10, createdAt: new Date(now - 5 * DAY) };
  assert.equal(deletePenaltyFor(old, now), 10);
  assert.equal(deletePenaltyFor({ ...old, debt: { resolved: false } }, now), 10);
  assert.equal(deletePenaltyFor({ ...old, debt: { resolved: true } }, now), 0);
});
