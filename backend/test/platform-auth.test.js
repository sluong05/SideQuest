const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { prismaStub } = require('./platform-stub');
const auth = require('../src/middleware/auth');

const { signAuthToken, tokenVersionMatches, isAuthTokenPayload, shouldTouchLastActive } = auth;

function run(token) {
  return new Promise((resolve) => {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ req, status: this.statusCode, body: b, next: false }); return this; },
    };
    auth(req, res, () => resolve({ req, status: 200, next: true }));
  });
}

test('signAuthToken embeds tv', () => {
  const d = jwt.verify(signAuthToken({ id: 7, tokenVersion: 3 }), process.env.JWT_SECRET);
  assert.equal(d.userId, 7);
  assert.equal(d.tv, 3);
});

test('tokenVersionMatches treats missing tv as 0', () => {
  assert.equal(tokenVersionMatches({ userId: 1 }, { tokenVersion: 0 }), true);
  assert.equal(tokenVersionMatches({ userId: 1 }, { tokenVersion: 1 }), false);
  assert.equal(tokenVersionMatches({ userId: 1, tv: 2 }, { tokenVersion: 2 }), true);
  assert.equal(tokenVersionMatches({ userId: 1, tv: 1 }, { tokenVersion: 2 }), false);
});

test('isAuthTokenPayload rejects payoff-start and unsubscribe tokens', () => {
  assert.equal(isAuthTokenPayload({ userId: 1, tv: 0 }), true);
  assert.equal(isAuthTokenPayload({ userId: 1, type: 'payoff-start' }), false);
  assert.equal(isAuthTokenPayload({ userId: 1, purpose: 'unsub' }), false);
  assert.equal(isAuthTokenPayload({ userId: '1' }), false);
});

test('shouldTouchLastActive at most hourly', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  assert.equal(shouldTouchLastActive(null, now), true);
  assert.equal(shouldTouchLastActive(new Date('2026-10-28T11:30:00Z'), now), false);
  assert.equal(shouldTouchLastActive(new Date('2026-10-28T10:59:00Z'), now), true);
});

test('middleware accepts matching tv, rejects bumped tv, and updates lastActiveAt', async () => {
  prismaStub.users.set(42, { id: 42, tokenVersion: 1, lastActiveAt: null });
  prismaStub.updates.length = 0;
  const ok = await run(signAuthToken({ id: 42, tokenVersion: 1 }));
  assert.equal(ok.next, true);
  assert.equal(ok.req.userId, 42);
  assert.equal(prismaStub.updates.length, 1);

  const stale = await run(signAuthToken({ id: 42, tokenVersion: 0 }));
  assert.equal(stale.status, 401);

  const legacy = await run(jwt.sign({ userId: 42 }, process.env.JWT_SECRET)); // no tv → 0
  assert.equal(legacy.status, 401);
});

test('middleware rejects unknown user, non-auth tokens, missing header', async () => {
  assert.equal((await run(signAuthToken({ id: 999, tokenVersion: 0 }))).status, 401);
  prismaStub.users.set(5, { id: 5, tokenVersion: 0, lastActiveAt: new Date() });
  const payoff = jwt.sign({ userId: 5, type: 'payoff-start' }, process.env.JWT_SECRET);
  assert.equal((await run(payoff)).status, 401);
  assert.equal((await run(null)).status, 401);
  const legacyOk = await run(jwt.sign({ userId: 5 }, process.env.JWT_SECRET));
  assert.equal(legacyOk.next, true);
});
