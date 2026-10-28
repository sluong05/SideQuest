const test = require('node:test');
const assert = require('node:assert/strict');
require('./platform-stub');
const { parseChallengeParam, validatePassword } = require('../src/routes/auth');
const { decodeAvatarDataUrl } = require('../src/routes/users');
const { isValidEventName, sanitizeProps, sanitizeAnonId } = require('../src/lib/analytics');

test('parseChallengeParam accepts existing types/durations only', () => {
  assert.deepEqual(parseChallengeParam('pushups-7'), { type: 'pushups', durationDays: 7 });
  assert.deepEqual(parseChallengeParam('quests-14'), { type: 'quests', durationDays: 14 });
  assert.deepEqual(parseChallengeParam(' Quests-30 '), { type: 'quests', durationDays: 30 });
  for (const bad of ['pushups-5', 'running-7', 'pushups', '-7', 'pushups-7-1', '', null, 7, 'quests-0300']) {
    assert.equal(parseChallengeParam(bad), null, String(bad));
  }
});

test('validatePassword: length >= 8 is the only rule', () => {
  assert.equal(validatePassword('abcdefgh'), null);
  assert.equal(validatePassword('12345678'), null);
  assert.ok(validatePassword('short'));
  assert.ok(validatePassword(undefined));
});

test('decodeAvatarDataUrl decodes raster images and refuses svg/junk', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const d = decodeAvatarDataUrl(`data:image/png;base64,${png.toString('base64')}`);
  assert.equal(d.contentType, 'image/png');
  assert.deepEqual(d.buffer, png);
  assert.equal(decodeAvatarDataUrl('data:image/jpg;base64,AAAA').contentType, 'image/jpeg');
  assert.equal(decodeAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(decodeAvatarDataUrl('not a data url'), null);
  assert.equal(decodeAvatarDataUrl(null), null);
});

test('event validation', () => {
  assert.equal(isValidEventName('signup_complete'), true);
  assert.equal(isValidEventName('hack'), false);
  assert.deepEqual(sanitizeProps({ a: 1 }), { a: 1 });
  assert.deepEqual(sanitizeProps([1]), {});
  assert.deepEqual(sanitizeProps({ big: 'x'.repeat(5000) }), {});
  assert.equal(sanitizeAnonId(' abc-123 '), 'abc-123');
  assert.equal(sanitizeAnonId('<script>'), null);
});
