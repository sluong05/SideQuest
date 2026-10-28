const test = require('node:test');
const assert = require('node:assert/strict');
const {
  xpForDifficulty, levelForXp, isCompletionCredited, isOnTime, completionRewards, capSurplusCoins, checkPayoffRules,
} = require('../src/lib/economy');

test('xp and levels', () => {
  assert.equal(xpForDifficulty('easy'), 25);
  assert.equal(xpForDifficulty('hard'), 100);
  assert.equal(xpForDifficulty('weird'), 50);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(499), 1);
  assert.equal(levelForXp(500), 2);
  assert.equal(levelForXp(-20), 1);
});

test('completion credit: min age and daily cap', () => {
  const created = new Date('2026-10-28T10:00:00Z');
  const base = { createdAt: created, minAgeSeconds: 60, dailyCap: 30 };
  assert.equal(isCompletionCredited({ ...base, completedAt: new Date('2026-10-28T10:00:30Z'), earlierCompletionsToday: 0 }), false);
  assert.equal(isCompletionCredited({ ...base, completedAt: new Date('2026-10-28T10:01:00Z'), earlierCompletionsToday: 0 }), true);
  assert.equal(isCompletionCredited({ ...base, completedAt: new Date('2026-10-28T12:00:00Z'), earlierCompletionsToday: 29 }), true);
  assert.equal(isCompletionCredited({ ...base, completedAt: new Date('2026-10-28T12:00:00Z'), earlierCompletionsToday: 30 }), false);
});

test('rewards: 2 coins on time, none late or uncredited', () => {
  assert.equal(isOnTime('2026-10-28T10:00:00Z', '2026-10-28T10:00:00Z'), true);
  assert.equal(isOnTime('2026-10-28T10:00:01Z', '2026-10-28T10:00:00Z'), false);
  assert.deepEqual(completionRewards({ credited: true, onTime: true, xpReward: 50 }), { xp: 50, coins: 2 });
  assert.deepEqual(completionRewards({ credited: true, onTime: false, xpReward: 100 }), { xp: 100, coins: 0 });
  assert.deepEqual(completionRewards({ credited: false, onTime: true, xpReward: 100 }), { xp: 0, coins: 0 });
});

test('surplus coin daily cap', () => {
  assert.deepEqual(capSurplusCoins({ surplus: 20, surplusToday: 0, cap: 50 }), { coins: 20, capped: false });
  assert.deepEqual(capSurplusCoins({ surplus: 20, surplusToday: 40, cap: 50 }), { coins: 10, capped: true });
  assert.deepEqual(capSurplusCoins({ surplus: 20, surplusToday: 60, cap: 50 }), { coins: 0, capped: true });
  assert.deepEqual(capSurplusCoins({ surplus: 0, surplusToday: 60, cap: 50 }), { coins: 0, capped: false });
  assert.deepEqual(capSurplusCoins({ surplus: 20, surplusToday: 0, cap: 50, tokenless: true }), { coins: 0, capped: true });
});

test('payoff rules per activity', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const tok = (activity, secsAgo) => ({ activity, startedAtMs: now - secsAgo * 1000 });
  // fitness pace: 1.5/s + 3
  assert.equal(checkPayoffRules({ activity: 'fitness', amount: 18, token: tok('fitness', 10), nowMs: now }).ok, true);
  assert.equal(checkPayoffRules({ activity: 'fitness', amount: 19, token: tok('fitness', 10), nowMs: now }).ok, false);
  const legacy = checkPayoffRules({ activity: 'fitness', amount: 50, token: null, nowMs: now });
  assert.deepEqual(legacy, { ok: true, tokenless: true });
  assert.equal(checkPayoffRules({ activity: 'fitness', amount: 5, token: null, nowMs: now, requireToken: true }).ok, false);
  // focus ≤ elapsed minutes
  assert.equal(checkPayoffRules({ activity: 'focus', amount: 25, token: tok('focus', 25 * 60 + 5), nowMs: now }).ok, true);
  assert.equal(checkPayoffRules({ activity: 'focus', amount: 26, token: tok('focus', 25 * 60 + 5), nowMs: now }).ok, false);
  // wellness/chores ≤ 50
  assert.equal(checkPayoffRules({ activity: 'chores', amount: 50, token: tok('chores', 5), nowMs: now }).ok, true);
  assert.equal(checkPayoffRules({ activity: 'wellness', amount: 51, token: tok('wellness', 5), nowMs: now }).ok, false);
  // custom ≤ 25/session, ≤ 100/day
  assert.equal(checkPayoffRules({ activity: 'custom', amount: 25, token: tok('custom', 5), nowMs: now, customToday: 75 }).ok, true);
  assert.equal(checkPayoffRules({ activity: 'custom', amount: 26, token: tok('custom', 5), nowMs: now }).ok, false);
  assert.equal(checkPayoffRules({ activity: 'custom', amount: 10, token: tok('custom', 5), nowMs: now, customToday: 95 }).ok, false);
});
