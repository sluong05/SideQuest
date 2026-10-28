const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { getFriendIds } = require('./friends');
const { SITE_URL } = require('../lib/siteConfig');

const router = express.Router();

async function computeScore(userId, type, startDate, endDate) {
  if (type === 'quests') {
    const count = await prisma.quest.count({
      where: { userId, completed: true, completedAt: { gte: startDate, lte: endDate } },
    });
    return count;
  }
  // pushups — only real fitness sessions count (not focus/chores/custom points)
  const agg = await prisma.payoffSession.aggregate({
    where: { userId, activity: 'fitness', date: { gte: startDate, lte: endDate } },
    _sum: { amount: true },
  });
  return agg._sum.amount || 0;
}

// Freezes both scores once a challenge has ended (first read after endDate),
// so later activity, deleted quests or the cleanup job can't change the result.
async function freezeScores(c) {
  const [challengerScore, challengedScore] = await Promise.all([
    computeScore(c.challengerId, c.type, c.startDate, c.endDate),
    computeScore(c.challengedId, c.type, c.startDate, c.endDate),
  ]);
  await prisma.challenge.updateMany({
    where: { id: c.id, challengerScore: null, challengedScore: null },
    data: { challengerScore, challengedScore },
  });
  return { challengerScore, challengedScore };
}

// GET /api/challenges — all challenges for current user
router.get('/', auth, async (req, res) => {
  try {
    const challenges = await prisma.challenge.findMany({
      where: {
        OR: [{ challengerId: req.userId }, { challengedId: req.userId }],
        status: { not: 'declined' },
      },
      include: {
        challenger: { select: { id: true, username: true, email: true } },
        challenged: { select: { id: true, username: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();

    const result = await Promise.all(
      challenges.map(async (c) => {
        const challengerName = c.challenger.username || c.challenger.email.split('@')[0];
        const challengedName = c.challenged.username || c.challenged.email.split('@')[0];
        let myScore = null;
        let opponentScore = null;
        let winner = null;

        if (c.status === 'active' || (c.status !== 'pending' && c.endDate && new Date(c.endDate) < now)) {
          const opponentId = c.challengerId === req.userId ? c.challengedId : c.challengerId;
          const ended = c.startDate && c.endDate && new Date(c.endDate) < now;
          if (ended) {
            let scores = { challengerScore: c.challengerScore, challengedScore: c.challengedScore };
            if (scores.challengerScore == null || scores.challengedScore == null) scores = await freezeScores(c);
            const iAmChallenger = c.challengerId === req.userId;
            myScore = iAmChallenger ? scores.challengerScore : scores.challengedScore;
            opponentScore = iAmChallenger ? scores.challengedScore : scores.challengerScore;
          } else {
            [myScore, opponentScore] = await Promise.all([
              computeScore(req.userId, c.type, c.startDate, c.endDate || now),
              computeScore(opponentId, c.type, c.startDate, c.endDate || now),
            ]);
          }

          if (c.endDate && new Date(c.endDate) < now && c.status === 'active') {
            winner = myScore > opponentScore ? 'you' : myScore < opponentScore ? 'them' : 'tie';
          }
        }

        return {
          id: c.id,
          type: c.type,
          durationDays: c.durationDays,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
          createdAt: c.createdAt,
          isChallenger: c.challengerId === req.userId,
          challenger: { id: c.challenger.id, username: challengerName },
          challenged: { id: c.challenged.id, username: challengedName },
          myScore,
          opponentScore,
          winner,
        };
      })
    );

    return res.json({ challenges: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/challenges/invite-link { type, durationDays } — shareable link that
// signs a non-user up and creates a pending challenge from the inviter.
router.post('/invite-link', auth, async (req, res) => {
  const { type } = req.body || {};
  const durationDays = Number(req.body?.durationDays);
  if (!['quests', 'pushups'].includes(type)) {
    return res.status(400).json({ error: 'type must be quests or pushups' });
  }
  if (![3, 7, 14, 30].includes(durationDays)) {
    return res.status(400).json({ error: 'durationDays must be 3, 7, 14, or 30' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
    if (!user?.username) {
      return res.status(400).json({ error: 'Set a username before sharing invite links', code: 'USERNAME_REQUIRED' });
    }
    const url = `${SITE_URL}/join?ref=${encodeURIComponent(user.username)}&challenge=${type}-${durationDays}`;
    return res.json({ url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/challenges — create a challenge
router.post('/', auth, async (req, res) => {
  const { friendId, type, durationDays } = req.body;

  if (!friendId || !type || !durationDays) {
    return res.status(400).json({ error: 'friendId, type, and durationDays are required' });
  }
  if (!['quests', 'pushups'].includes(type)) {
    return res.status(400).json({ error: 'type must be quests or pushups' });
  }
  if (![3, 7, 14, 30].includes(Number(durationDays))) {
    return res.status(400).json({ error: 'durationDays must be 3, 7, 14, or 30' });
  }

  try {
    const friendIds = await getFriendIds(req.userId);
    if (!friendIds.includes(Number(friendId))) {
      return res.status(403).json({ error: 'You can only challenge friends' });
    }

    const challenge = await prisma.challenge.create({
      data: {
        challengerId: req.userId,
        challengedId: Number(friendId),
        type,
        durationDays: Number(durationDays),
      },
      include: {
        challenger: { select: { id: true, username: true } },
        challenged: { select: { id: true, username: true } },
      },
    });

    return res.status(201).json({ challenge });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/challenges/:id/accept
router.patch('/:id/accept', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid challenge id' });
    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge || challenge.challengedId !== req.userId) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    if (challenge.status !== 'pending') {
      return res.status(400).json({ error: 'Challenge is not pending' });
    }
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + challenge.durationDays * 24 * 60 * 60 * 1000);
    const updated = await prisma.challenge.update({
      where: { id },
      data: { status: 'active', startDate, endDate },
    });
    return res.json({ challenge: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/challenges/:id/decline
router.patch('/:id/decline', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid challenge id' });
    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge || challenge.challengedId !== req.userId) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    await prisma.challenge.update({ where: { id }, data: { status: 'declined' } });
    return res.json({ message: 'Challenge declined' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
