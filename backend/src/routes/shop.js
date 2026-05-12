const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { getFriendIds } = require('./friends');

const router = express.Router();

const SHOP_ITEMS = [
  {
    id: 'debt_bomb',
    name: 'Debt Bomb',
    description: "Add 10 pushups to a friend's debt. Evil. Necessary.",
    cost: 50,
    icon: '💣',
  },
];

// GET /api/shop/items
router.get('/items', auth, (req, res) => {
  return res.json({ items: SHOP_ITEMS });
});

// POST /api/shop/buy
router.post('/buy', auth, async (req, res) => {
  const { itemId, targetUsername } = req.body;

  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  try {
    const buyer = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { coins: true },
    });

    if (buyer.coins < item.cost) {
      return res.status(400).json({ error: `Not enough coins. You need ${item.cost} but have ${buyer.coins}.` });
    }

    if (itemId === 'debt_bomb') {
      if (!targetUsername) {
        return res.status(400).json({ error: 'targetUsername is required' });
      }

      const target = await prisma.user.findUnique({
        where: { username: targetUsername },
        select: { id: true },
      });

      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.id === req.userId) return res.status(400).json({ error: 'Cannot target yourself' });

      const friendIds = await getFriendIds(req.userId);
      if (!friendIds.includes(target.id)) {
        return res.status(403).json({ error: 'You can only target friends' });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: req.userId },
          data: { coins: { decrement: item.cost } },
        }),
        prisma.pushupDebt.create({
          data: {
            userId: target.id,
            taskId: null,
            pushupsOwed: 10,
            daysOverdue: 1,
            resolved: false,
          },
        }),
      ]);

      return res.json({ message: `Debt bomb dropped on ${targetUsername}!`, coinsSpent: item.cost });
    }

    return res.status(400).json({ error: 'Unknown item' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
