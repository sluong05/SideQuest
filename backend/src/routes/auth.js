const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { signAuthToken } = require('../middleware/auth');
const { isValidTimeZone } = require('../lib/timezone');
const { avatarUrl, REFERRAL_COINS } = require('../lib/siteConfig');
const { sendEmail, layout, button, siteLink, verifyUnsubscribeToken } = require('../lib/email');
const { escapeHtml } = require('../lib/escapeHtml');
const { track } = require('../lib/analytics');
const oauth = require('../lib/oauth');

const router = express.Router();

const USER_SELECT = {
  id: true, email: true, username: true, createdAt: true,
  timezone: true, totalQuestsCompleted: true, maxStreak: true,
  emailReminders: true, bio: true, avatar: true, coins: true,
  streakShieldActive: true, debtFreezeUntil: true,
  payoffMultiplierActive: true, profileFlair: true,
  emailVerified: true, xp: true, level: true,
  // audit fixes (2026-10)
  pushReminders: true, allowChaos: true, pausedUntil: true,
  currentStreak: true, invitedById: true,
};

// Adds the cacheable avatar URL. `avatar` (base64 data URL) is kept for the
// live iOS build, which still reads it.
function withAvatarUrl(user) {
  if (!user) return user;
  return { ...user, avatarUrl: avatarUrl(user.id, !!user.avatar) };
}

// Challenge types / durations accepted by POST /api/challenges.
const CHALLENGE_TYPES = ['quests', 'pushups'];
const CHALLENGE_DURATIONS = [3, 7, 14, 30];

// Parses an invite `challenge` param like "pushups-7" → { type, durationDays },
// or null when absent/invalid.
function parseChallengeParam(value) {
  if (typeof value !== 'string') return null;
  const m = /^([a-z]+)-(\d{1,3})$/.exec(value.trim().toLowerCase());
  if (!m) return null;
  const type = m[1];
  const durationDays = Number(m[2]);
  if (!CHALLENGE_TYPES.includes(type) || !CHALLENGE_DURATIONS.includes(durationDays)) return null;
  return { type, durationDays };
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

// Basic email shape check — rejects obviously invalid addresses and most markup.
// (Escaping is still applied wherever email-derived text reaches HTML.)
const EMAIL_REGEX = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
function validateEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_REGEX.test(email);
}

// Store only a hash of email-verification / password-reset tokens. The plaintext
// goes in the email; a DB leak then yields no usable tokens.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Length is the only rule (composition rules mostly produce "Password1!").
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

// Email links must not contain a literal '=': quoted-printable transport uses
// '=' as its escape character, and an unescaped one gets decoded together with
// the first two token chars, corrupting the link (e.g. '=45' → 'E'). Web links
// carry the token in the path; app links keep the ?token= form the shipped iOS
// app parses, but with '=' written as the HTML entity '&#61;'.
async function sendVerificationEmail(email, token) {
  const webUrl = siteLink(`/verify-email/${token}`);
  const appUrl = `pushupdebt://verify-email?token&#61;${token}`;
  await sendEmail({
    to: email,
    subject: 'Verify your SideQuest email',
    html: layout(`
        <h2 style="color: #1a1a2e;">Verify your email</h2>
        <p>Thanks for signing up! Click the button below to verify your email address.</p>
        ${button(webUrl, 'Verify Email')}
        <p style="color:#666; font-size:13px;">Using the iOS app? <a href="${appUrl}" style="color:#f59e0b;">Open in App</a></p>
        <p style="color:#666; font-size:13px;">If you didn't create an account, you can safely ignore this email.</p>
    `),
  });
}

// POST /api/auth/signup
// Body: { email, password, username?, timezone?, ref?, challenge? }
router.post('/signup', async (req, res) => {
  const { email, password, timezone, ref, challenge } = req.body || {};
  const username = typeof req.body?.username === 'string' && req.body.username.trim() !== ''
    ? req.body.username.trim()
    : null;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Normalize so casing can't create duplicate accounts (A@x.com vs a@x.com).
  const normalizedEmail = String(email).trim().toLowerCase();

  if (!validateEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  if (username !== null && !USERNAME_REGEX.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3–20 characters and only contain letters, numbers, or underscores',
    });
  }

  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const existingEmail = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });
    if (existingEmail) return res.status(409).json({ error: 'Email already in use' });

    if (username !== null) {
      const existingUsername = await prisma.user.findUnique({ where: { username } });
      if (existingUsername) return res.status(409).json({ error: 'Username already taken' });
    }

    // Invite attribution: an unknown/invalid ref is ignored, never an error.
    let inviter = null;
    if (typeof ref === 'string' && USERNAME_REGEX.test(ref.trim())) {
      inviter = await prisma.user.findUnique({ where: { username: ref.trim() }, select: { id: true } });
    }
    const invitedChallenge = inviter ? parseChallengeParam(challenge) : null;

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          username,
          password: hashedPassword,
          timezone: isValidTimeZone(timezone) ? timezone : 'UTC',
          emailVerificationToken: hashToken(verificationToken),
          invitedById: inviter ? inviter.id : null,
          coins: inviter ? REFERRAL_COINS : 0,
        },
      });
      if (inviter) {
        // One accepted row is a friendship in both directions (getFriendIds
        // matches either side).
        await tx.friendship.create({
          data: { requesterId: inviter.id, receiverId: created.id, status: 'accepted' },
        });
        if (REFERRAL_COINS > 0) {
          await tx.user.update({ where: { id: inviter.id }, data: { coins: { increment: REFERRAL_COINS } } });
        }
        if (invitedChallenge) {
          await tx.challenge.create({
            data: {
              challengerId: inviter.id,
              challengedId: created.id,
              type: invitedChallenge.type,
              durationDays: invitedChallenge.durationDays,
            },
          });
        }
      }
      return created;
    });

    // Send verification email — don't fail signup if email fails
    sendVerificationEmail(normalizedEmail, verificationToken).catch((err) =>
      console.error('[Auth] Failed to send verification email:', err)
    );
    if (inviter) track('invite_accepted', inviter.id, { inviteeId: user.id, challenge: invitedChallenge ? `${invitedChallenge.type}-${invitedChallenge.durationDays}` : null });

    const token = signAuthToken(user);

    return res.status(201).json({
      token,
      user: {
        id: user.id, email: user.email, username: user.username,
        createdAt: user.createdAt, timezone: user.timezone, emailVerified: false,
        invitedById: user.invitedById, coins: user.coins, avatarUrl: null,
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const target = String(err.meta?.target || '');
      return res.status(409).json({ error: target.includes('username') ? 'Username already taken' : 'Email already in use' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// POST /api/auth/login — accepts email or username as identifier
router.post('/login', async (req, res) => {
  const { identifier, password, timezone } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username/email and password are required' });
  }

  try {
    const isEmail = identifier.includes('@');
    const user = isEmail
      ? await prisma.user.findFirst({ where: { email: { equals: identifier.trim(), mode: 'insensitive' } } })
      : await prisma.user.findUnique({ where: { username: identifier } });

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        error: `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}, or reset your password to regain access immediately.`,
      });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      const attempts = user.loginAttempts + 1;
      const shouldLock = attempts >= MAX_LOGIN_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
        },
      });

      if (shouldLock) {
        return res.status(429).json({
          error: `Too many failed attempts. Account locked for 15 minutes — or reset your password to regain access now.`,
        });
      }

      const remaining = MAX_LOGIN_ATTEMPTS - attempts;
      return res.status(401).json({
        error: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`,
      });
    }

    // Successful login — reset attempt counter
    const updateData = { loginAttempts: 0, lockedUntil: null };
    // Only persist a client-supplied timezone if it's a valid IANA zone.
    if (timezone && timezone !== user.timezone && isValidTimeZone(timezone)) {
      updateData.timezone = timezone;
    }
    await prisma.user.update({ where: { id: user.id }, data: updateData });

    const token = signAuthToken(user);

    return res.json({
      token,
      user: {
        id: user.id, email: user.email, username: user.username,
        createdAt: user.createdAt, timezone: user.timezone, emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: hashToken(token) },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired verification link' });
    if (user.emailVerified) return res.json({ message: 'Email already verified' });

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationToken: null },
    });

    return res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, emailVerified: true },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) return res.json({ message: 'Email already verified' });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: req.userId },
      data: { emailVerificationToken: hashToken(verificationToken) },
    });

    await sendVerificationEmail(user.email, verificationToken);

    return res.json({ message: 'Verification email sent' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/password — change password (requires old password)
router.patch('/password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old and new password are required' });
  }

  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    // Bumping tokenVersion signs out every other session; hand this client a
    // fresh token so it stays logged in (old clients just ignore the field).
    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { password: hashed, tokenVersion: { increment: 1 } },
      select: { id: true, tokenVersion: true },
    });

    return res.json({ message: 'Password updated successfully', token: signAuthToken(updated) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/username
router.patch('/username', auth, async (req, res) => {
  const { username } = req.body;

  if (!username) return res.status(400).json({ error: 'Username is required' });

  if (!USERNAME_REGEX.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3–20 characters and only contain letters, numbers, or underscores',
    });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== req.userId) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { username },
      select: USER_SELECT,
    });

    return res.json({ user: withAvatarUrl(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/account
router.delete('/account', auth, async (req, res) => {
  try {
    const userId = req.userId;
    // Revoke outstanding tokens first, so even a partially failed deletion
    // leaves no usable session behind.
    await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await prisma.debt.deleteMany({ where: { userId } });
    await prisma.payoffSession.deleteMany({ where: { userId } });
    await prisma.userItem.deleteMany({ where: { userId } });
    await prisma.quest.deleteMany({ where: { userId } });
    await prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: userId }, { receiverId: userId }] },
    });
    await prisma.challenge.deleteMany({
      where: { OR: [{ challengerId: userId }, { challengedId: userId }] },
    });
    await prisma.user.delete({ where: { id: userId } });
    return res.json({ message: 'Account deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: USER_SELECT,
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: withAvatarUrl(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/profile
router.patch('/profile', auth, async (req, res) => {
  const { bio, avatar } = req.body;
  const data = {};

  if (bio !== undefined) {
    data.bio = bio ? String(bio).slice(0, 160) : null;
  }
  if (avatar !== undefined) {
    if (avatar !== null && !String(avatar).startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid avatar format' });
    }
    if (avatar && avatar.length > 300000) {
      return res.status(400).json({ error: 'Avatar image is too large' });
    }
    data.avatar = avatar;
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: USER_SELECT,
    });
    return res.json({ user: withAvatarUrl(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/notifications — { emailReminders?, pushReminders? }
router.patch('/notifications', auth, async (req, res) => {
  const { emailReminders, pushReminders } = req.body || {};
  const data = {};
  if (emailReminders !== undefined) {
    if (typeof emailReminders !== 'boolean') return res.status(400).json({ error: 'emailReminders must be a boolean' });
    data.emailReminders = emailReminders;
  }
  if (pushReminders !== undefined) {
    if (typeof pushReminders !== 'boolean') return res.status(400).json({ error: 'pushReminders must be a boolean' });
    data.pushReminders = pushReminders;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'emailReminders or pushReminders must be a boolean' });
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: USER_SELECT,
    });
    return res.json({ user: withAvatarUrl(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/preferences — { allowChaos? }
router.patch('/preferences', auth, async (req, res) => {
  const { allowChaos } = req.body || {};
  if (typeof allowChaos !== 'boolean') {
    return res.status(400).json({ error: 'allowChaos must be a boolean' });
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { allowChaos },
      select: USER_SELECT,
    });
    return res.json({ user: withAvatarUrl(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// One-click unsubscribe from reminder emails. Token = signed { userId, purpose:'unsub' }.
// Accepted as ?token= (List-Unsubscribe header form) or /unsubscribe/:token (the
// in-body link, which avoids a literal '=' in quoted-printable HTML).
// GET shows a small confirmation page; POST is the RFC 8058 one-click form that
// mail providers call (body "List-Unsubscribe=One-Click").
async function applyUnsubscribe(token) {
  const userId = verifyUnsubscribeToken(token);
  if (!userId) return false;
  await prisma.user.updateMany({ where: { id: userId }, data: { emailReminders: false } });
  return true;
}

function unsubscribePage(ok) {
  const title = ok ? "You're unsubscribed" : 'Link not valid';
  const body = ok
    ? "You won't get SideQuest reminder emails anymore. You can turn them back on any time in your profile settings."
    : 'This unsubscribe link is invalid. You can manage email reminders in your profile settings.';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — SideQuest</title></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:48px 16px;color:#1a1a2e;">
<div style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
<h1 style="font-size:20px;margin:0 0 12px;">${title}</h1><p style="line-height:1.5;">${body}</p>
<a href="${escapeHtml(siteLink('/profile'))}" style="display:inline-block;background:#f59e0b;color:#1a1a2e;font-weight:bold;padding:10px 20px;border-radius:8px;text-decoration:none;margin-top:8px;">Open settings</a>
</div></body></html>`;
}

async function unsubscribeHandler(req, res) {
  const token = req.params.token || req.query.token || (req.body && req.body.token);
  try {
    const ok = await applyUnsubscribe(token);
    if (req.method === 'POST') {
      return ok ? res.status(200).json({ ok: true }) : res.status(400).json({ error: 'Invalid unsubscribe token' });
    }
    res.set('Cache-Control', 'no-store');
    return res.status(ok ? 200 : 400).type('html').send(unsubscribePage(ok));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

const formParser = express.urlencoded({ extended: false, limit: '4kb' });
router.get('/unsubscribe', unsubscribeHandler);
router.get('/unsubscribe/:token', unsubscribeHandler);
router.post('/unsubscribe', formParser, unsubscribeHandler);
router.post('/unsubscribe/:token', formParser, unsubscribeHandler);

// Sign in with Apple / Google → same shape as login + isNew. 501 if not configured.
async function oauthSignIn(req, res, provider) {
  const body = req.body || {};
  const enabled = provider === 'apple' ? oauth.isAppleEnabled() : oauth.isGoogleEnabled();
  if (!enabled) return res.status(501).json({ error: `${provider === 'apple' ? 'Sign in with Apple' : 'Google sign-in'} is not configured` });

  try {
    const identity = provider === 'apple'
      ? await oauth.verifyAppleToken(body.identityToken)
      : await oauth.verifyGoogleToken(body.credential);
    const timezone = isValidTimeZone(body.timezone) ? body.timezone : undefined;
    const { user, isNew } = await oauth.findOrCreateOAuthUser(identity, { timezone });
    if (isNew) track('signup_complete', user.id, { method: provider });

    return res.status(isNew ? 201 : 200).json({
      token: signAuthToken(user),
      user: {
        id: user.id, email: user.email, username: user.username,
        createdAt: user.createdAt, timezone: user.timezone, emailVerified: user.emailVerified,
      },
      isNew,
    });
  } catch (err) {
    if (err instanceof oauth.OAuthError) {
      return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    }
    console.error(`[Auth] ${provider} sign-in failed:`, err);
    return res.status(500).json({ error: 'Server error' });
  }
}

router.post('/apple', (req, res) => oauthSignIn(req, res, 'apple'));
router.post('/google', (req, res) => oauthSignIn(req, res, 'google'));

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: String(email).trim(), mode: 'insensitive' } },
    });
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 1000 * 60 * 60);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: hashToken(token), passwordResetExpiry: expiry },
    });

    // Path/entity forms avoid quoted-printable '=' corruption — see
    // sendVerificationEmail above.
    const resetUrl = siteLink(`/reset-password/${token}`);
    const appResetUrl = `pushupdebt://reset-password?token&#61;${token}`;

    await sendEmail({
      to: user.email,
      subject: 'Reset your SideQuest password',
      html: layout(`
          <h2 style="color: #1a1a2e;">Reset your password</h2>
          <p>Click the button below to reset your SideQuest password. This link expires in 1 hour.</p>
          ${button(resetUrl, 'Reset Password')}
          <p style="color:#666; font-size:13px;">Using the iOS app? <a href="${appResetUrl}" style="color:#f59e0b;">Open in App</a></p>
          <p style="color:#666; font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
      `),
    });

    return res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashToken(token),
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetToken: null,
        passwordResetExpiry: null,
        // A successful reset also clears any failed-login lockout.
        loginAttempts: 0,
        lockedUntil: null,
        // ...and signs out every existing session.
        tokenVersion: { increment: 1 },
      },
    });

    return res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.parseChallengeParam = parseChallengeParam;
module.exports.validatePassword = validatePassword;
