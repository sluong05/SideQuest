const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const USER_SELECT = {
  id: true, email: true, username: true, createdAt: true,
  timezone: true, totalQuestsCompleted: true, maxStreak: true,
  emailReminders: true, bio: true, avatar: true, coins: true,
  streakShieldActive: true, debtFreezeUntil: true,
  payoffMultiplierActive: true, profileFlair: true,
  emailVerified: true, xp: true, level: true,
};

function validatePassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must contain at least one special character';
  return null;
}

async function sendVerificationEmail(email, token) {
  const webUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  const appUrl = `pushupdebt://verify-email?token=${token}`;
  await resend.emails.send({
    from: 'noreply@pushupdebt.com',
    to: email,
    subject: 'Verify your SideQuest email',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Verify your email</h2>
        <p>Thanks for signing up! Click the button below to verify your email address.</p>
        <a href="${webUrl}" style="display:inline-block; background:#f59e0b; color:#1a1a2e; font-weight:bold; padding:12px 24px; border-radius:8px; text-decoration:none; margin:16px 0;">
          Verify Email
        </a>
        <p style="color:#666; font-size:13px;">Using the iOS app? <a href="${appUrl}" style="color:#f59e0b;">Open in App</a></p>
        <p style="color:#666; font-size:13px;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
  });
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, username, password, timezone } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username, and password are required' });
  }

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3–20 characters and only contain letters, numbers, or underscores',
    });
  }

  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) return res.status(409).json({ error: 'Email already in use' });

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) return res.status(409).json({ error: 'Username already taken' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        timezone: timezone || 'UTC',
        emailVerificationToken: verificationToken,
      },
    });

    // Send verification email — don't fail signup if email fails
    sendVerificationEmail(email, verificationToken).catch((err) =>
      console.error('[Auth] Failed to send verification email:', err)
    );

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      token,
      user: {
        id: user.id, email: user.email, username: user.username,
        createdAt: user.createdAt, timezone: user.timezone, emailVerified: false,
      },
    });
  } catch (err) {
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
      ? await prisma.user.findUnique({ where: { email: identifier } })
      : await prisma.user.findUnique({ where: { username: identifier } });

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        error: `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
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
          error: `Too many failed attempts. Account locked for 15 minutes.`,
        });
      }

      const remaining = MAX_LOGIN_ATTEMPTS - attempts;
      return res.status(401).json({
        error: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`,
      });
    }

    // Successful login — reset attempt counter
    const updateData = { loginAttempts: 0, lockedUntil: null };
    if (timezone && timezone !== user.timezone) updateData.timezone = timezone;
    await prisma.user.update({ where: { id: user.id }, data: updateData });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

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
      where: { emailVerificationToken: token },
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
      data: { emailVerificationToken: verificationToken },
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
    await prisma.user.update({ where: { id: req.userId }, data: { password: hashed } });

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/username
router.patch('/username', auth, async (req, res) => {
  const { username } = req.body;

  if (!username) return res.status(400).json({ error: 'Username is required' });

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
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

    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/account
router.delete('/account', auth, async (req, res) => {
  try {
    const userId = req.userId;
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
    return res.json({ user });
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
    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/notifications
router.patch('/notifications', auth, async (req, res) => {
  const { emailReminders } = req.body;
  if (typeof emailReminders !== 'boolean') {
    return res.status(400).json({ error: 'emailReminders must be a boolean' });
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { emailReminders },
      select: USER_SELECT,
    });
    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 1000 * 60 * 60);

    await prisma.user.update({
      where: { email },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const appResetUrl = `pushupdebt://reset-password?token=${token}`;

    await resend.emails.send({
      from: 'noreply@pushupdebt.com',
      to: email,
      subject: 'Reset your SideQuest password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1a1a2e;">Reset your password</h2>
          <p>Click the button below to reset your SideQuest password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block; background:#f59e0b; color:#1a1a2e; font-weight:bold; padding:12px 24px; border-radius:8px; text-decoration:none; margin:16px 0;">
            Reset Password
          </a>
          <p style="color:#666; font-size:13px;">Using the iOS app? <a href="${appResetUrl}" style="color:#f59e0b;">Open in App</a></p>
          <p style="color:#666; font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
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
        passwordResetToken: token,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null },
    });

    return res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
