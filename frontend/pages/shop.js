import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getFriends, getTasks, buyShopItem, getInventory, useItem, getStreak } from '../lib/api';

const SHOP_ITEMS = [
  {
    id: 'debt_bomb',
    name: 'Debt Bomb',
    description: "Add 10 pushups to a friend's debt. Evil. Necessary.",
    cost: 50,
    icon: '💣',
    type: 'instant',
    requiresFriend: true,
    successMsg: (target) => `💣 Debt Bomb dropped on ${target}! They now owe 10 more pushups.`,
  },
  {
    id: 'taunt',
    name: 'Taunt',
    description: "Send a push notification to a friend to remind them they owe pushups.",
    cost: 10,
    icon: '📣',
    type: 'instant',
    requiresFriend: true,
    successMsg: (target) => `📣 Taunt sent to ${target}!`,
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
    description: "Push a task's due date forward by 24 hours. No questions asked.",
    cost: 25,
    icon: '⏰',
    type: 'inventory',
    requiresTask: true,
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
    name: 'Pushup Multiplier',
    description: "Your next pushup session drains debt at 2× rate.",
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

const ITEM_MAP = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i]));

export default function Shop() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const router = useRouter();

  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [streak, setStreak] = useState(0);

  // Buy modal state
  const [buyItem, setBuyItem] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [buying, setBuying] = useState(false);
  const [buyResult, setBuyResult] = useState(null);

  // Use modal state
  const [useItemEntry, setUseItemEntry] = useState(null); // { itemId, quantity }
  const [selectedTask, setSelectedTask] = useState(null);
  const [using, setUsing] = useState(false);
  const [useResult, setUseResult] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getFriends(),
      getInventory(),
      getTasks({ upToDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })() }),
      getStreak(),
    ])
      .then(([fr, inv, tk, sr]) => {
        setFriends(fr.data.friends);
        setInventory(inv.data.inventory);
        setTasks((tk.data.tasks || []).filter((t) => !t.completed));
        setStreak(sr.data.streak);
      })
      .catch(() => {})
      .finally(() => setFriendsLoading(false));
  }, [user]);

  function openBuy(item) {
    setBuyItem(item);
    setSelectedFriend(null);
    setBuyResult(null);
  }

  function closeBuy() {
    setBuyItem(null);
    setSelectedFriend(null);
    setBuyResult(null);
  }

  async function handleBuy() {
    if (!buyItem || buying) return;
    if (buyItem.requiresFriend && !selectedFriend) return;
    setBuying(true);
    setBuyResult(null);
    try {
      await buyShopItem(buyItem.id, selectedFriend?.username);
      updateUser({ ...user, coins: (user.coins ?? 0) - buyItem.cost });

      if (buyItem.type === 'inventory') {
        setInventory((prev) => {
          const existing = prev.find((e) => e.itemId === buyItem.id);
          if (existing) {
            return prev.map((e) => e.itemId === buyItem.id ? { ...e, quantity: e.quantity + 1 } : e);
          }
          return [...prev, { itemId: buyItem.id, quantity: 1 }];
        });
      }

      const msg = buyItem.requiresFriend && buyItem.successMsg
        ? buyItem.successMsg(selectedFriend.username)
        : `${buyItem.name} purchased!`;
      setBuyResult({ type: 'success', message: msg });
      setSelectedFriend(null);
    } catch (err) {
      setBuyResult({ type: 'error', message: err.response?.data?.error || 'Purchase failed' });
    } finally {
      setBuying(false);
    }
  }

  function openUse(entry) {
    setUseItemEntry(entry);
    setSelectedTask(null);
    setUseResult(null);
  }

  function closeUse() {
    setUseItemEntry(null);
    setSelectedTask(null);
    setUseResult(null);
  }

  async function handleUse() {
    if (!useItemEntry || using) return;
    const itemDef = ITEM_MAP[useItemEntry.itemId];
    if (itemDef?.requiresTask && !selectedTask) return;
    setUsing(true);
    setUseResult(null);
    try {
      const resp = await useItem(useItemEntry.itemId, selectedTask?.id);
      setInventory((prev) => {
        if (useItemEntry.quantity <= 1) return prev.filter((e) => e.itemId !== useItemEntry.itemId);
        return prev.map((e) =>
          e.itemId === useItemEntry.itemId ? { ...e, quantity: e.quantity - 1 } : e
        );
      });
      // Update task list if deadline was extended
      if (useItemEntry.itemId === 'deadline_ext' && selectedTask) {
        setTasks((prev) => prev.map((t) =>
          t.id === selectedTask.id
            ? { ...t, dueDate: new Date(new Date(t.dueDate).getTime() + 24 * 60 * 60 * 1000).toISOString() }
            : t
        ));
      }
      setUseResult({ type: 'success', message: resp.data.message });
      setSelectedTask(null);
    } catch (err) {
      setUseResult({ type: 'error', message: err.response?.data?.error || 'Failed to use item' });
    } finally {
      setUsing(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const coins = user?.coins ?? 0;
  const hasFriends = friends.length > 0;

  return (
    <Layout streak={streak}>
      <div className="max-w-2xl mx-auto">

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy-50">Shop</h1>
          <p className="text-navy-300 text-sm mt-1">Spend your hard-earned coins on power-ups and chaos.</p>
        </div>

        {/* Coin balance */}
        <div className="card mb-6 flex items-center gap-4 border-yellow-600/20 bg-yellow-950/10">
          <div className="w-12 h-12 rounded-full bg-yellow-500/15 border border-yellow-600/30 flex items-center justify-center flex-shrink-0">
            <img src="/Pcoin.svg" alt="coin" className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-navy-300 uppercase tracking-widest font-semibold mb-0.5">Your Balance</p>
            <p className="text-3xl font-bold text-yellow-400 tabular-nums">{coins}</p>
            <p className="text-xs text-navy-400 mt-0.5">Earn coins by doing pushups when you have no debt — 1 pushup = 1 coin.</p>
          </div>
          <Link href="/verify-pushups" className="btn-secondary text-xs py-2 px-3 flex-shrink-0">
            <span className="flex items-center gap-1.5"><img src="/Bicep.svg" className="w-4 h-4" />Earn More</span>
          </Link>
        </div>

        {/* Inventory */}
        {inventory.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest mb-3">Your Inventory</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {inventory.map((entry) => {
                const def = ITEM_MAP[entry.itemId];
                if (!def) return null;
                return (
                  <div
                    key={entry.itemId}
                    className="card flex flex-col items-center gap-2 py-4 text-center border-navy-500"
                  >
                    <span className="text-3xl">{def.icon}</span>
                    <p className="text-xs font-bold text-navy-100">{def.name}</p>
                    <span className="text-xs bg-navy-700 text-navy-300 px-2 py-0.5 rounded-full">×{entry.quantity}</span>
                    <button
                      onClick={() => openUse(entry)}
                      className="mt-1 text-xs py-1.5 px-4 bg-blue-500/15 border border-blue-500/40 text-blue-400 rounded-lg font-semibold hover:bg-blue-600/25 transition-colors"
                    >
                      Use
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Items for sale */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">Available Items</p>

          {SHOP_ITEMS.map((item) => {
            const canAfford = coins >= item.cost;
            const needsFriendsAndHasNone = item.requiresFriend && !hasFriends;
            const disabled = !canAfford || needsFriendsAndHasNone;
            return (
              <div
                key={item.id}
                className={`card flex items-center gap-5 transition-colors duration-150 ${
                  disabled ? 'border-navy-700 opacity-60' : 'border-navy-600'
                }`}
              >
                <div className="w-14 h-14 rounded-xl bg-navy-700 border border-navy-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-3xl">{item.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-bold text-navy-50">{item.name}</p>
                    <span className="flex items-center gap-1 text-xs bg-yellow-500/15 border border-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded-full font-semibold">
                      <img src="/Pcoin.svg" alt="coin" className="w-3.5 h-3.5" />
                      {item.cost}
                    </span>
                    {item.type === 'inventory' && (
                      <span className="text-xs bg-navy-700 text-navy-400 px-2 py-0.5 rounded-full">Stored</span>
                    )}
                  </div>
                  <p className="text-sm text-navy-300">{item.description}</p>
                  {!canAfford && (
                    <p className="text-xs text-red-400 mt-1">
                      Need {item.cost - coins} more coin{item.cost - coins !== 1 ? 's' : ''}
                    </p>
                  )}
                  {canAfford && needsFriendsAndHasNone && (
                    <p className="text-xs text-navy-400 mt-1">Add friends to use this item</p>
                  )}
                </div>
                <button
                  onClick={() => !disabled && openBuy(item)}
                  disabled={disabled}
                  className={`flex-shrink-0 text-sm py-2 px-4 font-semibold rounded-lg transition-colors duration-150 ${
                    disabled ? 'bg-navy-700 text-navy-400 cursor-not-allowed' : 'btn-primary'
                  }`}
                >
                  Buy
                </button>
              </div>
            );
          })}
        </div>

        {!friendsLoading && !hasFriends && (
          <div className="card mt-6 text-center py-8 bg-navy-700/30">
            <p className="text-2xl mb-2">👥</p>
            <p className="text-navy-200 text-sm font-medium">No friends to target yet</p>
            <p className="text-navy-400 text-xs mt-1 mb-4">Add friends first to use instant items on them.</p>
            <Link href="/friends" className="btn-primary text-sm py-2 px-5">Find Friends</Link>
          </div>
        )}
      </div>

      {/* Buy modal */}
      {buyItem && (
        <Modal onClose={closeBuy}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">{buyItem.icon}</span>
            <div>
              <h2 className="text-lg font-bold text-navy-50">{buyItem.name}</h2>
              <p className="flex items-center gap-1 text-xs text-yellow-400 font-semibold">
                <img src="/Pcoin.svg" alt="coin" className="w-3.5 h-3.5" />
                {buyItem.cost} coins
              </p>
            </div>
          </div>
          <p className="text-sm text-navy-300 mb-5">{buyItem.description}</p>

          {buyItem.requiresFriend && (
            <div className="mb-5">
              <label className="label mb-2 block">Choose your target</label>
              {friendsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {friends.map((f) => (
                    <FriendOption
                      key={f.id}
                      friend={f}
                      selected={selectedFriend?.id === f.id}
                      onSelect={() => setSelectedFriend(f)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <ResultBanner result={buyResult} />

          <div className="flex gap-3">
            <button onClick={closeBuy} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
            <button
              onClick={handleBuy}
              disabled={buying || (buyItem.requiresFriend && !selectedFriend) || buyResult?.type === 'success'}
              className="btn-primary flex-1 py-2.5 text-sm"
            >
              {buying ? 'Processing…' : (
                <span className="flex items-center justify-center gap-1.5">
                  Confirm — <img src="/Pcoin.svg" alt="coin" className="w-4 h-4" /> {buyItem.cost}
                </span>
              )}
            </button>
          </div>
        </Modal>
      )}

      {/* Use modal */}
      {useItemEntry && (() => {
        const def = ITEM_MAP[useItemEntry.itemId];
        if (!def) return null;
        return (
          <Modal onClose={closeUse}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{def.icon}</span>
              <div>
                <h2 className="text-lg font-bold text-navy-50">Use {def.name}</h2>
                <p className="text-xs text-navy-400">×{useItemEntry.quantity} in inventory</p>
              </div>
            </div>
            <p className="text-sm text-navy-300 mb-5">{def.description}</p>

            {def.requiresTask && (
              <div className="mb-5">
                <label className="label mb-2 block">Choose a task to extend</label>
                {tasks.length === 0 ? (
                  <p className="text-sm text-navy-400 py-2">No incomplete tasks.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {tasks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTask(t)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                          selectedTask?.id === t.id
                            ? 'border-blue-500/60 bg-blue-600/10'
                            : 'border-navy-600 bg-navy-700/50 hover:border-navy-500'
                        }`}
                      >
                        <p className="text-sm font-semibold text-navy-100">{t.title}</p>
                        <p className="text-xs text-navy-400 mt-0.5">
                          Due {new Date(t.dueDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <ResultBanner result={useResult} />

            <div className="flex gap-3">
              <button onClick={closeUse} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
              <button
                onClick={handleUse}
                disabled={using || (def.requiresTask && !selectedTask) || useResult?.type === 'success'}
                className="btn-primary flex-1 py-2.5 text-sm"
              >
                {using ? 'Applying…' : 'Use Item'}
              </button>
            </div>
          </Modal>
        );
      })()}
    </Layout>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function FriendOption({ friend, selected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors duration-150 ${
        selected ? 'border-blue-500/60 bg-blue-600/10' : 'border-navy-600 bg-navy-700/50 hover:border-navy-500'
      }`}
    >
      <div className="w-8 h-8 rounded-full overflow-hidden border border-navy-500 flex-shrink-0">
        {friend.avatar ? (
          <img src={friend.avatar} alt={friend.username} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-navy-600 flex items-center justify-center">
            <span className="text-sm font-bold text-navy-300">{friend.username[0].toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-navy-100">{friend.username}</p>
        <p className="text-xs text-navy-400">
          {friend.totalDebt > 0 ? `${friend.totalDebt} pushups owed` : 'Debt free'}
        </p>
      </div>
      {selected && <span className="text-blue-400 text-sm flex-shrink-0">✓</span>}
    </button>
  );
}

function ResultBanner({ result }) {
  if (!result) return null;
  return (
    <div className={`text-sm px-3 py-2.5 rounded-lg border mb-4 ${
      result.type === 'success'
        ? 'text-green-400 bg-green-900/20 border-green-800'
        : 'text-red-400 bg-red-900/20 border-red-800'
    }`}>
      {result.message}
    </div>
  );
}
