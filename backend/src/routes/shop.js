const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { getFriendIds } = require('./friends');
const { sendPushToUser } = require('../jobs/pushNotifications');

const router = express.Router();

const SHOP_ITEMS = [
  {
    id: 'debt_bomb',
    name: 'Debt Bomb',
    description: "Add 10 pts to a friend's debt. Evil. Necessary.",
    cost: 50,
    icon: '💣',
    type: 'instant',
    requiresFriend: true,
  },
  {
    id: 'taunt',
    name: 'Taunt',
    description: "Send a friend a message of your choosing to remind them they owe debt.",
    cost: 10,
    icon: '📣',
    type: 'instant',
    requiresFriend: true,
  },
  {
    id: 'streak_shield',
    name: 'Streak Shield',
    description: "Protect your streak from breaking once. Auto-fires when your streak is about to snap.",
    cost: 75,
    icon: '🛡️',
    type: 'inventory',
  },
  {
    id: 'deadline_ext',
    name: 'Deadline Extension',
    description: "Push a quest's due date forward by 24 hours. No questions asked.",
    cost: 25,
    icon: '⏰',
    type: 'inventory',
  },
  {
    id: 'debt_freeze',
    name: 'Debt Freeze',
    description: "Freeze all debt accumulation for 24 hours. Breathe.",
    cost: 40,
    icon: '🧊',
    type: 'inventory',
  },
  {
    id: 'pushup_multiplier',
    name: 'Payoff Multiplier',
    description: "Your next payoff session drains debt at 2× rate.",
    cost: 35,
    icon: '⚡',
    type: 'inventory',
  },
  {
    id: 'debt_discount',
    name: 'Debt Discount',
    description: "Slash all your current debt by 25%. Instant relief.",
    cost: 20,
    icon: '🎟️',
    type: 'inventory',
  },
  {
    id: 'profile_flair',
    name: 'Profile Flair',
    description: "Equip a ✨ cosmetic badge on your profile and leaderboard card.",
    cost: 60,
    icon: '✨',
    type: 'inventory',
  },
];

// GET /api/shop/items
router.get('/items', auth, (req, res) => {
  return res.json({ items: SHOP_ITEMS });
});

// GET /api/shop/inventory
router.get('/inventory', auth, async (req, res) => {
  try {
    const items = await prisma.userItem.findMany({
      where: { userId: req.userId, quantity: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ inventory: items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shop/buy
router.post('/buy', auth, async (req, res) => {
  const { itemId, targetUsername } = req.body;

  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  try {
    const buyer = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { coins: true, username: true },
    });
    if (!buyer) return res.status(404).json({ error: 'User not found' });

    // Resolve and validate the target for friend-targeted items BEFORE charging,
    // so a failed validation never spends coins.
    let target = null;
    if (item.requiresFriend) {
      if (!targetUsername) {
        return res.status(400).json({ error: 'targetUsername is required' });
      }
      target = await prisma.user.findUnique({
        where: { username: targetUsername },
        select: { id: true },
      });
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.id === req.userId) {
        return res.status(400).json({ error: 'Cannot target yourself' });
      }
      const friendIds = await getFriendIds(req.userId);
      if (!friendIds.includes(target.id)) {
        return res.status(403).json({ error: 'You can only target friends' });
      }
    }

    // Atomically deduct coins only if the balance still covers the cost. This
    // conditional update prevents concurrent /buy requests from double-spending
    // (a check-then-decrement race could otherwise drive the balance negative).
    const { count } = await prisma.user.updateMany({
      where: { id: req.userId, coins: { gte: item.cost } },
      data: { coins: { decrement: item.cost } },
    });
    if (count === 0) {
      return res.status(400).json({
        error: `Not enough coins. You need ${item.cost} but have ${buyer.coins}.`,
      });
    }

    // Coins are now spent — if applying the purchase effect fails, refund them.
    try {
      if (itemId === 'debt_bomb') {
        await prisma.debt.create({
          data: { userId: target.id, questId: null, amountOwed: 10, daysOverdue: 1, resolved: false },
        });
        // Debt is applied at this point — a push/notification failure must not
        // refund the coins.
        const senderName = buyer.username || 'Someone';
        const body = `${senderName} just dropped +10 debt on you. Pay it off!`;
        await prisma.appNotification
          .create({ data: { userId: target.id, type: 'debt_bomb', message: body, fromUsername: buyer.username } })
          .catch((err) => console.error('[Shop] debt_bomb notification failed:', err.message));
        await sendPushToUser(target.id, '💣 Debt bomb incoming!', body, '/debt')
          .catch((err) => console.error('[Shop] debt_bomb push failed:', err.message));
        return res.json({ message: `Debt bomb dropped on ${targetUsername}!`, coinsSpent: item.cost });
      }

      if (itemId === 'taunt') {
        const senderName = buyer.username || 'Someone';
        // Optional custom message from the buyer, shown in the push and the
        // in-app popup. Collapse whitespace and cap length; fall back to the
        // classic line when blank.
        const custom = typeof req.body.message === 'string'
          ? req.body.message.replace(/\s+/g, ' ').trim().slice(0, 140)
          : '';
        const body = custom
          ? `${senderName} says: "${custom}"`
          : `${senderName} says: go pay off your debt.`;
        await prisma.appNotification.create({
          data: { userId: target.id, type: 'taunt', message: body, fromUsername: buyer.username },
        });
        await sendPushToUser(target.id, '📣 You got taunted!', body, '/verify-pushups')
          .catch((err) => console.error('[Shop] taunt push failed:', err.message));
        return res.json({ message: `Taunt sent to ${targetUsername}!`, coinsSpent: item.cost });
      }

      if (item.type === 'inventory') {
        await prisma.userItem.upsert({
          where: { userId_itemId: { userId: req.userId, itemId } },
          update: { quantity: { increment: 1 } },
          create: { userId: req.userId, itemId, quantity: 1 },
        });
        return res.json({ message: `${item.name} added to your inventory!`, coinsSpent: item.cost });
      }

      // No matching effect — refund and report.
      await prisma.user.update({
        where: { id: req.userId },
        data: { coins: { increment: item.cost } },
      });
      return res.status(400).json({ error: 'Unknown item' });
    } catch (effectErr) {
      // Refund the spent coins, then surface the error to the outer handler.
      await prisma.user
        .update({ where: { id: req.userId }, data: { coins: { increment: item.cost } } })
        .catch(() => {});
      throw effectErr;
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shop/use
router.post('/use', auth, async (req, res) => {
  const { itemId, questId } = req.body;

  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item || item.type !== 'inventory') {
    return res.status(404).json({ error: 'Item not found or not usable' });
  }

  try {
    const inventoryEntry = await prisma.userItem.findUnique({
      where: { userId_itemId: { userId: req.userId, itemId } },
    });

    if (!inventoryEntry || inventoryEntry.quantity < 1) {
      return res.status(400).json({ error: 'You do not have this item' });
    }

    // Validate any required target BEFORE consuming the item, so a failed use
    // (missing/invalid quest) never burns the inventory entry.
    let deadlineQuest = null;
    if (itemId === 'deadline_ext') {
      if (!questId) {
        return res.status(400).json({ error: 'questId is required for Deadline Extension' });
      }
      deadlineQuest = await prisma.quest.findFirst({
        where: { id: questId, userId: req.userId, completed: false, deletedAt: null },
      });
      if (!deadlineQuest) return res.status(404).json({ error: 'Quest not found' });
    }

    // Decrement (or delete) inventory entry
    if (inventoryEntry.quantity === 1) {
      await prisma.userItem.delete({
        where: { userId_itemId: { userId: req.userId, itemId } },
      });
    } else {
      await prisma.userItem.update({
        where: { userId_itemId: { userId: req.userId, itemId } },
        data: { quantity: { decrement: 1 } },
      });
    }

    let message = '';

    if (itemId === 'streak_shield') {
      await prisma.user.update({
        where: { id: req.userId },
        data: { streakShieldActive: true },
      });
      message = 'Streak Shield activated! Your next streak break will be absorbed.';
    } else if (itemId === 'debt_freeze') {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { debtFreezeUntil: true },
      });
      // Extend from current freeze end if already frozen, otherwise from now
      const base = user.debtFreezeUntil && user.debtFreezeUntil > new Date()
        ? user.debtFreezeUntil
        : new Date();
      const until = new Date(base.getTime() + 24 * 60 * 60 * 1000);
      await prisma.user.update({ where: { id: req.userId }, data: { debtFreezeUntil: until } });
      message = 'Debt Freeze activated for 24 hours. No new debt will accumulate.';
    } else if (itemId === 'pushup_multiplier') {
      await prisma.user.update({
        where: { id: req.userId },
        data: { payoffMultiplierActive: true },
      });
      message = 'Payoff Multiplier active! Your next session drains debt at 2× rate.';
    } else if (itemId === 'debt_discount') {
      const debts = await prisma.debt.findMany({
        where: { userId: req.userId, resolved: false },
      });
      for (const debt of debts) {
        const newOwed = debt.amountOwed * 0.75;
        await prisma.debt.update({
          where: { id: debt.id },
          data: { amountOwed: newOwed },
        });
      }
      const saved = debts.reduce((sum, d) => sum + d.amountOwed * 0.25, 0);
      message = `Debt Discount applied! You saved ${Math.ceil(saved)} pts.`;
    } else if (itemId === 'deadline_ext') {
      const newDue = new Date(new Date(deadlineQuest.dueDate).getTime() + 24 * 60 * 60 * 1000);
      await prisma.quest.update({ where: { id: deadlineQuest.id }, data: { dueDate: newDue } });
      message = `Deadline extended by 24 hours for "${deadlineQuest.title}".`;
    } else if (itemId === 'profile_flair') {
      await prisma.user.update({
        where: { id: req.userId },
        data: { profileFlair: 'flair' },
      });
      message = 'Profile Flair equipped! ✨ is now showing on your profile.';
    }

    return res.json({ message });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
