const express = require('express');
const { Resend } = require('resend');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper: get all accepted friendships for a user (returns array of the OTHER user's id)
async function getFriendIds(userId) {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ requesterId: userId }, { receiverId: userId }],
    },
    select: { requesterId: true, receiverId: true },
  });
  return friendships.map((f) => (f.requesterId === userId ? f.receiverId : f.requesterId));
}

// GET /api/friends — list accepted friends with basic stats
router.get('/', auth, async (req, res) => {
  try {
    const friendIds = await getFriendIds(req.userId);
    if (friendIds.length === 0) return res.json({ friends: [] });

    const friends = await prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: {
        id: true,
        username: true,
        email: true,
        maxStreak: true,
        totalTasksCompleted: true,
        pushupDebts: { where: { resolved: false }, select: { pushupsOwed: true } },
        pushupSessions: { select: { pushupsCompleted: true } },
      },
    });

    const result = friends.map((f) => ({
      id: f.id,
      username: f.username || f.email.split('@')[0],
      totalDebt: Math.ceil(f.pushupDebts.reduce((s, d) => s + d.pushupsOwed, 0)),
      totalPushups: f.pushupSessions.reduce((s, s2) => s + s2.pushupsCompleted, 0),
      maxStreak: f.maxStreak,
      totalTasksCompleted: f.totalTasksCompleted,
    }));

    return res.json({ friends: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/requests — pending incoming requests
router.get('/requests', auth, async (req, res) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: { receiverId: req.userId, status: 'pending' },
      include: { requester: { select: { id: true, username: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      requests: requests.map((r) => ({
        id: r.id,
        from: {
          id: r.requester.id,
          username: r.requester.username || r.requester.email.split('@')[0],
        },
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/feed — activity feed of accepted friends (last 7 days)
router.get('/feed', auth, async (req, res) => {
  try {
    const friendIds = await getFriendIds(req.userId);
    if (friendIds.length === 0) return res.json({ feed: [] });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [completedTasks, sessions] = await Promise.all([
      prisma.task.findMany({
        where: {
          userId: { in: friendIds },
          completed: true,
          completedAt: { gte: sevenDaysAgo },
        },
        select: { title: true, completedAt: true, userId: true, user: { select: { username: true, email: true } } },
        orderBy: { completedAt: 'desc' },
        take: 50,
      }),
      prisma.pushupSession.findMany({
        where: {
          userId: { in: friendIds },
          date: { gte: sevenDaysAgo },
        },
        select: { pushupsCompleted: true, date: true, userId: true, user: { select: { username: true, email: true } } },
        orderBy: { date: 'desc' },
        take: 50,
      }),
    ]);

    const taskEvents = completedTasks.map((t) => ({
      type: 'task_completed',
      userId: t.userId,
      username: t.user.username || t.user.email.split('@')[0],
      data: { taskTitle: t.title },
      timestamp: t.completedAt,
    }));

    const sessionEvents = sessions.map((s) => ({
      type: 'pushups_logged',
      userId: s.userId,
      username: s.user.username || s.user.email.split('@')[0],
      data: { pushupsCompleted: s.pushupsCompleted },
      timestamp: s.date,
    }));

    const feed = [...taskEvents, ...sessionEvents]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50);

    return res.json({ feed });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/search?q= — search users by username
router.get('/search', auth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });

  try {
    const existingRelations = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: req.userId }, { receiverId: req.userId }],
      },
      select: { requesterId: true, receiverId: true, status: true },
    });

    const relatedIds = existingRelations.flatMap((f) => [f.requesterId, f.receiverId]);

    const users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        id: { notIn: [...new Set([...relatedIds, req.userId])] },
        NOT: { username: null },
      },
      select: { id: true, username: true },
      take: 10,
    });

    return res.json({ results: users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/friends/request — send a friend request
router.post('/request', auth, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    const [target, requester] = await Promise.all([
      prisma.user.findUnique({ where: { username }, select: { id: true, email: true, username: true, emailReminders: true } }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, email: true } }),
    ]);

    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.userId) return res.status(400).json({ error: 'Cannot add yourself' });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.userId, receiverId: target.id },
          { requesterId: target.id, receiverId: req.userId },
        ],
      },
    });
    if (existing) return res.status(409).json({ error: 'Request already exists' });

    const friendship = await prisma.friendship.create({
      data: { requesterId: req.userId, receiverId: target.id },
    });

    if (target.emailReminders && process.env.RESEND_API_KEY) {
      const senderName = requester.username || requester.email.split('@')[0];
      resend.emails.send({
        from: 'noreply@pushupdebt.com',
        to: target.email,
        subject: `${senderName} sent you a friend request on PushupDebt`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a2e;">
            <h2 style="color: #1a1a2e;">You have a new friend request 👋</h2>
            <p><strong>${senderName}</strong> wants to be friends on PushupDebt.</p>
            <p>Accept their request to see each other on the leaderboard, view their stats, and challenge each other.</p>
            <a href="${process.env.FRONTEND_URL}/friends" style="display:inline-block; background:#f59e0b; color:#1a1a2e; font-weight:bold; padding:12px 24px; border-radius:8px; text-decoration:none; margin:16px 0;">
              View Request
            </a>
            <p style="color:#666; font-size:13px;">You can manage notifications in your profile settings.</p>
          </div>
        `,
      }).catch(() => {}); // fire-and-forget, don't block the response
    }

    return res.status(201).json({ friendship });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/friends/:id/accept
router.patch('/:id/accept', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship || friendship.receiverId !== req.userId) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (friendship.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }
    const updated = await prisma.friendship.update({ where: { id }, data: { status: 'accepted' } });
    return res.json({ friendship: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/friends/:id/decline
router.patch('/:id/decline', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship || friendship.receiverId !== req.userId) {
      return res.status(404).json({ error: 'Request not found' });
    }
    await prisma.friendship.delete({ where: { id } });
    return res.json({ message: 'Request declined' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/friends/:id — remove a friend (by friendship id OR friend's user id)
router.delete('/:id', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const friendship = await prisma.friendship.findFirst({
      where: {
        id,
        status: 'accepted',
        OR: [{ requesterId: req.userId }, { receiverId: req.userId }],
      },
    });
    if (!friendship) return res.status(404).json({ error: 'Friendship not found' });
    await prisma.friendship.delete({ where: { id: friendship.id } });
    return res.json({ message: 'Friend removed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, getFriendIds };
