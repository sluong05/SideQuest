import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getFriends, getQuests, buyShopItem, getInventory, useItem, getStreak } from '../lib/api';
import { Icon } from '../components/Icons';
import { timeAgo } from '../lib/questMeta';
import { PANEL_STYLE, SELECT_STYLE, PanelHeader } from '../components/Panel';

const SHOP_ITEMS = [
  {
    id: 'debt_bomb',
    name: 'Debt Bomb',
    description: "Add 10 pts to a friend's debt. Evil. Necessary.",
    cost: 50,
    icon: 'bomb',
    iconColor: '#f87171',
    type: 'instant',
    category: 'chaos',
    requiresFriend: true,
    successMsg: (target) => `Debt Bomb dropped on ${target}! They now owe 10 more pts.`,
  },
  {
    id: 'taunt',
    name: 'Taunt',
    description: "Send a push notification to a friend to remind them they owe debt.",
    cost: 10,
    icon: 'megaphone',
    iconColor: '#fb923c',
    type: 'instant',
    category: 'chaos',
    requiresFriend: true,
    successMsg: (target) => `Taunt sent to ${target}!`,
  },
  {
    id: 'streak_shield',
    name: 'Streak Shield',
    description: "Protect your streak from breaking once. Auto-fires when your streak is about to snap.",
    cost: 75,
    icon: 'shield',
    iconColor: '#60a5fa',
    type: 'inventory',
    category: 'powerup',
    featured: true,
  },
  {
    id: 'deadline_ext',
    name: 'Deadline Extension',
    description: "Push a quest's due date forward by 24 hours. No questions asked.",
    cost: 25,
    icon: 'clock',
    iconColor: '#60a5fa',
    type: 'inventory',
    category: 'utility',
    requiresQuest: true,
  },
  {
    id: 'debt_freeze',
    name: 'Debt Freeze',
    description: "Freeze all debt accumulation for 24 hours. Breathe.",
    cost: 40,
    icon: 'snowflake',
    iconColor: '#7dd3fc',
    type: 'inventory',
    category: 'powerup',
  },
  {
    id: 'pushup_multiplier',
    name: 'Payoff Multiplier',
    description: "Your next payoff session drains debt at 2× rate.",
    cost: 35,
    icon: 'bolt',
    iconColor: '#fbbf24',
    type: 'inventory',
    category: 'powerup',
  },
  {
    id: 'debt_discount',
    name: 'Debt Discount',
    description: "Slash all your current debt by 25%. Instant relief.",
    cost: 20,
    icon: 'ticket',
    iconColor: '#c084fc',
    type: 'inventory',
    category: 'utility',
  },
  {
    id: 'profile_flair',
    name: 'Profile Flair',
    description: "Equip a sparkling cosmetic badge on your profile and leaderboard card.",
    cost: 60,
    icon: 'sparkles',
    iconColor: '#fbbf24',
    type: 'inventory',
    category: 'cosmetic',
  },
];

const ITEM_MAP = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i]));
const FEATURED_ITEM = SHOP_ITEMS.find((i) => i.featured);

const CATEGORY_TABS = [
  { key: 'All',      label: 'All' },
  { key: 'powerup',  label: 'Power-Ups', icon: 'bolt' },
  { key: 'chaos',    label: 'Chaos',     icon: 'bomb' },
  { key: 'utility',  label: 'Utilities', icon: 'wrench' },
  { key: 'cosmetic', label: 'Cosmetics', icon: 'gem' },
];

const RECENT_KEY = 'sq_recent_purchases';

function CoinPrice({ amount, size = 'sm' }) {
  const img = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const txt = size === 'sm' ? 'text-sm' : 'text-base';
  return (
    <span className="inline-flex items-center gap-1.5">
      <img src="/Pcoin.svg" alt="coin" className={img} />
      <span className={`${txt} font-bold text-yellow-400 tabular-nums`}>{amount}</span>
    </span>
  );
}

export default function Shop() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const router = useRouter();

  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [quests, setQuests] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [streak, setStreak] = useState(0);
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('featured');
  const [recentPurchases, setRecentPurchases] = useState([]);

  // Buy modal state
  const [buyItem, setBuyItem] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [buying, setBuying] = useState(false);
  const [buyResult, setBuyResult] = useState(null);

  // Use modal state
  const [useItemEntry, setUseItemEntry] = useState(null); // { itemId, quantity }
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [using, setUsing] = useState(false);
  const [useResult, setUseResult] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  useEffect(() => {
    try {
      setRecentPurchases(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'));
    } catch { /* ignore corrupt storage */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getFriends(),
      getInventory(),
      getQuests({ upToDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })() }),
      getStreak(),
    ])
      .then(([fr, inv, tk, sr]) => {
        setFriends(fr.data.friends);
        setInventory(inv.data.inventory);
        setQuests((tk.data.quests || []).filter((t) => !t.completed));
        setStreak(sr.data.streak);
      })
      .catch(() => {})
      .finally(() => setFriendsLoading(false));
  }, [user]);

  function recordPurchase(item) {
    setRecentPurchases((prev) => {
      const next = [{ itemId: item.id, cost: item.cost, at: Date.now() }, ...prev].slice(0, 6);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage full */ }
      return next;
    });
  }

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
      recordPurchase(buyItem);

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
    setSelectedQuest(null);
    setUseResult(null);
  }

  function closeUse() {
    setUseItemEntry(null);
    setSelectedQuest(null);
    setUseResult(null);
  }

  async function handleUse() {
    if (!useItemEntry || using) return;
    const itemDef = ITEM_MAP[useItemEntry.itemId];
    if (itemDef?.requiresQuest && !selectedQuest) return;
    setUsing(true);
    setUseResult(null);
    try {
      const resp = await useItem(useItemEntry.itemId, selectedQuest?.id);
      setInventory((prev) => {
        if (useItemEntry.quantity <= 1) return prev.filter((e) => e.itemId !== useItemEntry.itemId);
        return prev.map((e) =>
          e.itemId === useItemEntry.itemId ? { ...e, quantity: e.quantity - 1 } : e
        );
      });
      // Update quest list if deadline was extended
      if (useItemEntry.itemId === 'deadline_ext' && selectedQuest) {
        setQuests((prev) => prev.map((t) =>
          t.id === selectedQuest.id
            ? { ...t, dueDate: new Date(new Date(t.dueDate).getTime() + 24 * 60 * 60 * 1000).toISOString() }
            : t
        ));
      }
      setUseResult({ type: 'success', message: resp.data.message });
      setSelectedQuest(null);
    } catch (err) {
      setUseResult({ type: 'error', message: err.response?.data?.error || 'Failed to use item' });
    } finally {
      setUsing(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050A14' }}>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const coins = user?.coins ?? 0;
  const hasFriends = friends.length > 0;
  const itemsOwned = inventory.reduce((s, e) => s + e.quantity, 0);

  // Next unlock = cheapest item you can't afford yet
  const nextUnlock = SHOP_ITEMS
    .filter((i) => i.cost > coins)
    .sort((a, b) => a.cost - b.cost)[0] ?? null;

  // Recommended = cheapest items not already in inventory
  const ownedIds = new Set(inventory.map((e) => e.itemId));
  const recommended = SHOP_ITEMS
    .filter((i) => !ownedIds.has(i.id) && !i.requiresFriend)
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 3);

  const visibleItems = SHOP_ITEMS
    .filter((i) => category === 'All' || i.category === category)
    .sort((a, b) => {
      if (sortBy === 'priceLow')  return a.cost - b.cost;
      if (sortBy === 'priceHigh') return b.cost - a.cost;
      return 0;
    });

  const statCards = [
    {
      label: 'Available Coins',
      icon: <img src="/Pcoin.svg" alt="coin" className="w-5 h-5" />,
      iconBg: 'rgba(234,179,8,0.12)', iconBorder: 'rgba(234,179,8,0.3)',
      value: <span className="text-lg font-bold text-yellow-400 tabular-nums">{coins} <span className="text-xs font-semibold">coins</span></span>,
      sub: <Link href="/quests" className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 transition-colors">Earn more →</Link>,
    },
    {
      label: 'Items Owned',
      icon: <Icon name="backpack" className="w-4 h-4" color="#4ade80" />,
      iconBg: 'rgba(34,197,94,0.1)', iconBorder: 'rgba(34,197,94,0.28)',
      value: <span className="text-lg font-bold tabular-nums" style={{ color: '#4ade80' }}>{itemsOwned}</span>,
      sub: <span className="text-[10px]" style={{ color: '#475569' }}>{inventory.length} unique item{inventory.length !== 1 ? 's' : ''}</span>,
    },
    {
      label: 'Featured Item',
      icon: <Icon name="gift" className="w-4 h-4" color="#c084fc" />,
      iconBg: 'rgba(168,85,247,0.1)', iconBorder: 'rgba(168,85,247,0.3)',
      value: <span className="text-sm font-bold" style={{ color: '#c084fc' }}>{FEATURED_ITEM.name}</span>,
      sub: <span className="text-[10px] inline-flex items-center gap-1" style={{ color: '#475569' }}><Icon name={FEATURED_ITEM.icon} className="w-3 h-3" color="currentColor" /> {FEATURED_ITEM.cost} coins</span>,
    },
    {
      label: 'Next Unlock',
      icon: <Icon name="unlock" className="w-4 h-4" color="#fb923c" />,
      iconBg: 'rgba(249,115,22,0.1)', iconBorder: 'rgba(249,115,22,0.3)',
      value: nextUnlock
        ? <span className="text-sm font-bold" style={{ color: '#fb923c' }}>{nextUnlock.name}</span>
        : <span className="text-sm font-bold" style={{ color: '#4ade80' }}>All unlocked!</span>,
      sub: nextUnlock ? (
        <div className="w-full">
          <div className="w-full h-1 rounded-full overflow-hidden mt-1" style={{ background: 'rgba(249,115,22,0.12)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min((coins / nextUnlock.cost) * 100, 100)}%`, background: 'linear-gradient(90deg,#ea580c,#fb923c)' }} />
          </div>
          <span className="text-[10px]" style={{ color: '#475569' }}>{coins} / {nextUnlock.cost} coins</span>
        </div>
      ) : <span className="text-[10px]" style={{ color: '#475569' }}>You can afford everything</span>,
    },
  ];

  return (
    <Layout streak={streak}>

      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#f8fafc' }}>Shop</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>
          Spend your coins to unlock powerful boosts, chaos items, and useful upgrades.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {statCards.map(({ label, icon, iconBg, iconBorder, value, sub }) => (
          <div key={label} className="rounded-2xl p-3.5 flex items-start gap-3" style={PANEL_STYLE}>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: iconBg, border: `1px solid ${iconBorder}` }}
            >
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: '#475569' }}>{label}</p>
              <div className="leading-tight">{value}</div>
              <div className="mt-0.5">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-6 items-start">

        {/* ── Main column ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Category tabs + sort */}
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div
              className="flex gap-1 p-1 rounded-xl overflow-x-auto flex-shrink-0"
              style={{ background: 'rgba(8,21,37,0.7)', border: '1px solid rgba(59,130,246,0.1)' }}
            >
              {CATEGORY_TABS.map(({ key, label, icon }) => {
                const active = category === key;
                return (
                  <button
                    key={key}
                    onClick={() => setCategory(key)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150"
                    style={{
                      background: active ? 'rgba(37,99,235,0.85)' : 'transparent',
                      color: active ? '#ffffff' : '#475569',
                      border: active ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent',
                      boxShadow: active ? '0 0 12px rgba(37,99,235,0.35)' : 'none',
                    }}
                  >
                    {icon && <Icon name={icon} className="w-3 h-3" color="currentColor" />}
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="relative flex-shrink-0">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={SELECT_STYLE}>
                <option value="featured">Sort: Featured</option>
                <option value="priceLow">Price: Low to High</option>
                <option value="priceHigh">Price: High to Low</option>
              </select>
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: '#475569' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Featured banner */}
          {(category === 'All' || FEATURED_ITEM.category === category) && (
            <div
              className="relative rounded-2xl overflow-hidden mb-4 px-5 py-4"
              style={{
                background: 'linear-gradient(90deg, rgba(30,58,138,0.45) 0%, rgba(8,21,37,0.92) 60%)',
                border: '1px solid rgba(59,130,246,0.28)',
              }}
            >
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: [
                    'radial-gradient(ellipse 300px 90px at 8% 50%, rgba(249,115,22,0.18), transparent 70%)',
                    'radial-gradient(ellipse 420px 120px at 60% 100%, rgba(37,99,235,0.3), transparent 70%)',
                  ].join(', '),
                }}
              />
              <div className="relative flex items-center gap-4 flex-wrap">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(249,115,22,0.12)',
                    border: '1px solid rgba(249,115,22,0.35)',
                    boxShadow: '0 0 22px rgba(249,115,22,0.25)',
                  }}
                >
                  <Icon name={FEATURED_ITEM.icon} className="w-7 h-7" color="#fb923c" />
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className="inline-block text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-1"
                    style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.35)' }}
                  >
                    ✦ Featured Item
                  </span>
                  <p className="text-base font-bold" style={{ color: '#f8fafc' }}>{FEATURED_ITEM.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{FEATURED_ITEM.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <CoinPrice amount={FEATURED_ITEM.cost} size="lg" />
                  <button
                    onClick={() => coins >= FEATURED_ITEM.cost && openBuy(FEATURED_ITEM)}
                    disabled={coins < FEATURED_ITEM.cost}
                    className="text-xs font-bold px-5 py-2 rounded-lg text-white transition-all duration-150"
                    style={coins >= FEATURED_ITEM.cost
                      ? { background: 'linear-gradient(90deg,#ea580c,#f97316)', border: '1px solid rgba(249,115,22,0.6)', boxShadow: '0 0 14px rgba(249,115,22,0.35)' }
                      : { background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.2)', color: '#9a5b2e', cursor: 'not-allowed' }
                    }
                  >
                    {coins >= FEATURED_ITEM.cost ? 'Buy Now' : `${FEATURED_ITEM.cost - coins} more needed`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Items grid */}
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#475569' }}>All Items</p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleItems.map((item) => {
              const canAfford = coins >= item.cost;
              const needsFriendsAndHasNone = item.requiresFriend && !hasFriends;
              const disabled = !canAfford || needsFriendsAndHasNone;
              return (
                <div
                  key={item.id}
                  className="rounded-2xl p-4 flex flex-col items-center text-center transition-all duration-150"
                  style={{
                    background: 'rgba(8,21,37,0.75)',
                    border: `1px solid ${disabled ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.16)'}`,
                    opacity: disabled ? 0.65 : 1,
                  }}
                  onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; e.currentTarget.style.boxShadow = '0 0 18px rgba(37,99,235,0.12)'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = disabled ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.16)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-2.5"
                    style={{
                      background: 'rgba(37,99,235,0.12)',
                      border: '1px solid rgba(59,130,246,0.25)',
                      boxShadow: disabled ? 'none' : '0 0 16px rgba(37,99,235,0.2)',
                    }}
                  >
                    <Icon name={item.icon} className="w-6 h-6" color={item.iconColor} />
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-sm font-bold leading-tight" style={{ color: '#f8fafc' }}>{item.name}</p>
                    {item.type === 'inventory' && (
                      <span
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                        style={{ background: 'rgba(59,130,246,0.08)', color: '#64748b', border: '1px solid rgba(59,130,246,0.12)' }}
                      >
                        Stored
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-snug mb-3 flex-1" style={{ color: '#64748b' }}>{item.description}</p>
                  <div className="mb-2.5">
                    <CoinPrice amount={item.cost} />
                  </div>
                  <button
                    onClick={() => !disabled && openBuy(item)}
                    disabled={disabled}
                    className="w-full text-xs py-2 rounded-lg font-semibold transition-all duration-150"
                    style={disabled
                      ? { background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.08)', color: '#334155', cursor: 'not-allowed' }
                      : { background: 'rgba(37,99,235,0.88)', border: '1px solid rgba(59,130,246,0.5)', color: '#fff', boxShadow: '0 0 10px rgba(37,99,235,0.3)' }
                    }
                    onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 18px rgba(37,99,235,0.55)'; } }}
                    onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = 'rgba(37,99,235,0.88)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(37,99,235,0.3)'; } }}
                  >
                    {!canAfford ? `${item.cost - coins} more needed` : needsFriendsAndHasNone ? 'Requires friends' : 'Purchase'}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs font-medium py-4" style={{ color: '#334155' }}>
            More items coming soon ✦
          </p>

          {!friendsLoading && !hasFriends && (
            <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(8,21,37,0.5)', border: '1px solid rgba(59,130,246,0.1)' }}>
              <div className="flex justify-center mb-2"><Icon name="users" className="w-6 h-6" color="#475569" /></div>
              <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>No friends to target yet</p>
              <p className="text-xs mt-1 mb-4" style={{ color: '#475569' }}>Add friends first to use chaos items on them.</p>
              <Link href="/friends" className="btn-primary text-sm py-2 px-5">Find Friends</Link>
            </div>
          )}
        </div>

        {/* ── Right sidebar (fixed width) ────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-4 flex-shrink-0" style={{ width: 288 }}>

          {/* Your Inventory */}
          <div className="rounded-2xl p-4" style={PANEL_STYLE}>
            <PanelHeader icon={<Icon name="backpack" className="w-3 h-3" color="#60a5fa" />}>Your Inventory</PanelHeader>
            {inventory.length === 0 ? (
              <p className="text-xs" style={{ color: '#334155' }}>No items yet. Buy something below!</p>
            ) : (
              <div className="space-y-2">
                {inventory.map((entry) => {
                  const def = ITEM_MAP[entry.itemId];
                  if (!def) return null;
                  return (
                    <div
                      key={entry.itemId}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                      style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.1)' }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(59,130,246,0.18)' }}
                      >
                        <Icon name={def.icon} className="w-4 h-4" color={def.iconColor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: '#f8fafc' }}>{def.name}</p>
                        <p className="text-[10px]" style={{ color: '#475569' }}>×{entry.quantity} owned</p>
                      </div>
                      <button
                        onClick={() => openUse(entry)}
                        className="text-[11px] py-1 px-3 rounded-lg font-semibold flex-shrink-0 transition-colors"
                        style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.28)', color: '#60a5fa' }}
                      >
                        Use
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recommended for You */}
          {recommended.length > 0 && (
            <div className="rounded-2xl p-4" style={PANEL_STYLE}>
              <PanelHeader icon={<Icon name="sparkle" className="w-3 h-3" color="#60a5fa" />}>Recommended for You</PanelHeader>
              <div className="space-y-2">
                {recommended.map((item) => {
                  const canAfford = coins >= item.cost;
                  return (
                    <div key={item.id} className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(59,130,246,0.18)' }}
                      >
                        <Icon name={item.icon} className="w-4 h-4" color={item.iconColor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: '#f8fafc' }}>{item.name}</p>
                        <p className="text-[10px] flex items-center gap-1" style={{ color: '#475569' }}>
                          <img src="/Pcoin.svg" alt="" className="w-2.5 h-2.5" />
                          <span className="font-bold text-yellow-400">{item.cost}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => canAfford && openBuy(item)}
                        disabled={!canAfford}
                        className="text-[11px] py-1 px-3 rounded-lg font-semibold flex-shrink-0 transition-colors"
                        style={canAfford
                          ? { background: 'rgba(37,99,235,0.85)', border: '1px solid rgba(59,130,246,0.5)', color: '#fff' }
                          : { background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.08)', color: '#334155', cursor: 'not-allowed' }
                        }
                      >
                        Buy
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Purchases */}
          {recentPurchases.length > 0 && (
            <div className="rounded-2xl p-4" style={PANEL_STYLE}>
              <PanelHeader icon={<Icon name="clock" className="w-3 h-3" color="#60a5fa" />}>Recent Purchases</PanelHeader>
              <div className="space-y-2">
                {recentPurchases.map((p, idx) => {
                  const def = ITEM_MAP[p.itemId];
                  if (!def) return null;
                  return (
                    <div key={`${p.itemId}-${p.at}-${idx}`} className="flex items-center gap-2.5">
                      <Icon name={def.icon} className="w-4 h-4 flex-shrink-0" color={def.iconColor} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: '#94a3b8' }}>{def.name}</p>
                        <p className="text-[10px]" style={{ color: '#334155' }}>{timeAgo(p.at)}</p>
                      </div>
                      <span className="text-[11px] font-bold flex-shrink-0" style={{ color: '#fbbf24' }}>−{p.cost}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Earn more coins */}
          <div
            className="rounded-2xl p-4"
            style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(59,130,246,0.22)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', boxShadow: '0 0 14px rgba(234,179,8,0.15)' }}
              >
                <img src="/Pcoin.svg" alt="coin" className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold" style={{ color: '#f8fafc' }}>Earn more coins</p>
            </div>
            <p className="text-xs leading-relaxed mb-3" style={{ color: '#64748b' }}>
              Complete quests while you have <span className="font-bold" style={{ color: '#fbbf24' }}>zero active debt</span>. Debt? No coins until it's paid.
            </p>
            <Link
              href="/quests"
              className="flex items-center justify-center w-full py-2 rounded-lg text-xs font-bold text-white transition-all duration-150"
              style={{ background: 'rgba(37,99,235,0.88)', border: '1px solid rgba(59,130,246,0.5)', boxShadow: '0 0 10px rgba(37,99,235,0.3)' }}
            >
              View Quests →
            </Link>
          </div>
        </div>
      </div>

      {/* Buy modal */}
      {buyItem && (
        <Modal onClose={closeBuy}>
          <div className="flex items-center gap-3 mb-4">
            <Icon name={buyItem.icon} className="w-8 h-8" color={buyItem.iconColor} />
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
              <Icon name={def.icon} className="w-8 h-8" color={def.iconColor} />
              <div>
                <h2 className="text-lg font-bold text-navy-50">Use {def.name}</h2>
                <p className="text-xs text-slate-400">×{useItemEntry.quantity} in inventory</p>
              </div>
            </div>
            <p className="text-sm text-navy-300 mb-5">{def.description}</p>

            {def.requiresQuest && (
              <div className="mb-5">
                <label className="label mb-2 block">Choose a quest to extend</label>
                {quests.length === 0 ? (
                  <p className="text-sm text-slate-400 py-2">No incomplete quests.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {quests.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedQuest(t)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border transition-colors"
                        style={{
                          background: selectedQuest?.id === t.id ? 'rgba(37,99,235,0.1)' : 'rgba(8,21,37,0.6)',
                          borderColor: selectedQuest?.id === t.id ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.12)',
                        }}
                      >
                        <p className="text-sm font-semibold text-navy-100">{t.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
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
                disabled={using || (def.requiresQuest && !selectedQuest) || useResult?.type === 'success'}
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        style={{ background: 'var(--bg-card-alt)', border: '1px solid rgba(59,130,246,0.2)' }}
      >
        {children}
      </div>
    </div>
  );
}

function FriendOption({ friend, selected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors duration-150"
      style={{
        background: selected ? 'rgba(37,99,235,0.1)' : 'rgba(8,21,37,0.6)',
        borderColor: selected ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.12)',
      }}
    >
      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ border: '1px solid rgba(59,130,246,0.2)' }}>
        {friend.avatar ? (
          <img src={friend.avatar} alt={friend.username} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.15)' }}>
            <span className="text-sm font-bold" style={{ color: '#60a5fa' }}>{friend.username[0].toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-navy-100">{friend.username}</p>
        <p className="text-xs text-slate-400">
          {friend.totalDebt > 0 ? `${friend.totalDebt} pts owed` : 'Debt free'}
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
