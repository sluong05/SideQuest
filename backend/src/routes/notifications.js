const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications/unseen — in-app popup events waiting for this user
router.get('/unseen', auth, async (req, res) => {
  try {
    const notifications = await prisma.appNotification.findMany({
      where: { userId: req.userId, seen: false },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ notifications });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/notifications/seen — mark ids (or all unseen) as seen
router.post('/seen', auth, async (req, res) => {
  const { ids } = req.body;
  try {
    await prisma.appNotification.updateMany({
      where: {
        userId: req.userId,
        seen: false,
        ...(Array.isArray(ids) && ids.length > 0 ? { id: { in: ids.filter((i) => Number.isInteger(i)) } } : {}),
      },
      data: { seen: true },
    });
    return res.json({ message: 'Marked seen' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
