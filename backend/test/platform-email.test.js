const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
require('./platform-stub');
const email = require('../src/lib/email');
const { signAuthToken } = require('../src/middleware/auth');

test('unsubscribe token round-trips and never expires', () => {
  const t = email.signUnsubscribeToken(12);
  assert.equal(email.verifyUnsubscribeToken(t), 12);
  assert.equal(jwt.decode(t).exp, undefined);
  assert.equal(jwt.decode(t).purpose, 'unsub');
});

test('unsubscribe rejects session tokens, tampering and junk', () => {
  assert.equal(email.verifyUnsubscribeToken(signAuthToken({ id: 12, tokenVersion: 0 })), null);
  const t = email.signUnsubscribeToken(12);
  assert.equal(email.verifyUnsubscribeToken(t.slice(0, -2) + 'xx'), null);
  assert.equal(email.verifyUnsubscribeToken(jwt.sign({ userId: 12, purpose: 'unsub' }, 'other-secret')), null);
  assert.equal(email.verifyUnsubscribeToken(''), null);
  assert.equal(email.verifyUnsubscribeToken(undefined), null);
});

test('unsubscribe URLs: header form uses ?token=, body link has no literal =', () => {
  assert.match(email.unsubscribeHeaderUrl(3), /\/api\/auth\/unsubscribe\?token=/);
  const link = email.unsubscribeLinkUrl(3);
  assert.match(link, /\/api\/auth\/unsubscribe\/[^/?]+$/);
  assert.equal(link.includes('='), false);
});

test('layout adds unsubscribe footer only for reminder mail', () => {
  assert.match(email.layout('<p>x</p>', { unsubscribeUserId: 1 }), /Unsubscribe/);
  assert.doesNotMatch(email.layout('<p>x</p>'), /Unsubscribe/);
});
