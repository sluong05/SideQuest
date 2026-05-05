const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const prisma = require('../lib/prisma');

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

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

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, username, password: hashedPassword, timezone: timezone || 'UTC' },
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt, timezone: user.timezone },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login — accepts email or username as identifier
router.post('/login', async (req, res) => {
  const { identifier, password, timezone } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username/email and password are required' });
  }

  try {
    // Try email first, then username
    const isEmail = identifier.includes('@');
    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: identifier } })
      : await prisma.user.findUnique({ where: { username: identifier } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (timezone && timezone !== user.timezone) {
      await prisma.user.update({ where: { id: user.id }, data: { timezone } });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt, timezone: user.timezone },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/password — change password (requires old password)
router.patch('/password', require('../middleware/auth'), async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.userId }, data: { password: hashed } });

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/username — set or update username for existing accounts
router.patch('/username', require('../middleware/auth'), async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

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
      select: { id: true, email: true, username: true, createdAt: true },
    });

    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/account — permanently delete the authenticated user and all their data
router.delete('/account', require('../middleware/auth'), async (req, res) => {
  try {
    const userId = req.userId;
    // Delete dependent records before the user row
    await prisma.pushupDebt.deleteMany({ where: { userId } });
    await prisma.pushupSession.deleteMany({ where: { userId } });
    await prisma.task.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    return res.json({ message: 'Account deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, username: true, createdAt: true, timezone: true, totalTasksCompleted: true, maxStreak: true, emailReminders: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/auth/notifications — toggle email reminder preference
router.patch('/notifications', require('../middleware/auth'), async (req, res) => {
  const { emailReminders } = req.body;
  if (typeof emailReminders !== 'boolean') {
    return res.status(400).json({ error: 'emailReminders must be a boolean' });
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { emailReminders },
      select: { id: true, email: true, username: true, createdAt: true, timezone: true, totalTasksCompleted: true, maxStreak: true, emailReminders: true },
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

    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await prisma.user.update({
      where: { email },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await resend.emails.send({
      from: 'noreply@pushupdebt.com',
      to: email,
      subject: 'Reset your Pushup Debt password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1a1a2e;">Reset your password</h2>
          <p>Click the button below to reset your Pushup Debt password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block; background:#f59e0b; color:#1a1a2e; font-weight:bold; padding:12px 24px; border-radius:8px; text-decoration:none; margin:16px 0;">
            Reset Password
          </a>
          <p style="color:#666; font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
          <p style="color:#666; font-size:13px;">Or copy this link: ${resetUrl}</p>
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
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired' });
    }

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
