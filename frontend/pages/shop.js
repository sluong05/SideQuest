import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getFriends, buyShopItem, getStreak } from '../lib/api';

const SHOP_ITEMS = [
  {
    id: 'debt_bomb',
    name: 'Debt Bomb',
    description: "Add 10 pushups to a friend's debt. They'll thank you later.",
    cost: 50,
    icon: '💣',
    requiresFriend: true,
  },
];

export default function Shop() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const router = useRouter();

  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [streak, setStreak] = useState(0);

  // Purchase flow state
  const [activeItem, setActiveItem] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [buying, setBuying] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success'|'error', message }

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    Promise.all([getFriends(), getStreak()])
      .then(([fr, sr]) => {
        setFriends(fr.data.friends);
        setStreak(sr.data.streak);
      })
      .catch(() => {})
      .finally(() => setFriendsLoading(false));
  }, [user]);

  function openModal(item) {
    setActiveItem(item);
    setSelectedFriend(null);
    setResult(null);
  }

  function closeModal() {
    setActiveItem(null);
    setSelectedFriend(null);
    setResult(null);
  }

  async function handleBuy() {
    if (!activeItem || !selectedFriend || buying) return;
    setBuying(true);
    setResult(null);
    try {
      await buyShopItem(activeItem.id, selectedFriend.username);
      updateUser({ ...user, coins: (user.coins ?? 0) - activeItem.cost });
      setResult({
        type: 'success',
        message: `💣 Debt Bomb dropped on ${selectedFriend.username}! They now owe 10 more pushups.`,
      });
      setSelectedFriend(null);
    } catch (err) {
      setResult({
        type: 'error',
        message: err.response?.data?.error || 'Purchase failed',
      });
    } finally {
      setBuying(false);
    }
  }

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const coins = user?.coins ?? 0;

  return (
    <Layout streak={streak}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy-50">Shop</h1>
          <p className="text-navy-300 text-sm mt-1">
            Spend your hard-earned coins on chaos.
          </p>
        </div>

        {/* Coin balance card */}
        <div className="card mb-6 flex items-center gap-4 border-yellow-600/20 bg-yellow-950/10">
          <div className="w-12 h-12 rounded-full bg-yellow-500/15 border border-yellow-600/30 flex items-center justify-center flex-shrink-0">
            <img src="/Pcoin.svg" alt="coin" className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-navy-300 uppercase tracking-widest font-semibold mb-0.5">Your Balance</p>
            <p className="text-3xl font-bold text-yellow-400 tabular-nums">{coins}</p>
            <p className="text-xs text-navy-400 mt-0.5">
              Earn coins by doing pushups when you have no debt — 1 pushup = 1 coin.
            </p>
          </div>
          <Link href="/verify-pushups" className="btn-secondary text-xs py-2 px-3 flex-shrink-0">
            <span className="flex items-center gap-1.5"><img src="/Bicep.svg" className="w-4 h-4" />Earn More</span>
          </Link>
        </div>

        {/* Items */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">Available Items</p>

          {SHOP_ITEMS.map((item) => {
            const canAfford = coins >= item.cost;
            return (
              <div
                key={item.id}
                className={`card flex items-center gap-5 transition-colors duration-150 ${
                  canAfford ? 'border-navy-600' : 'border-navy-700 opacity-60'
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
                  </div>
                  <p className="text-sm text-navy-300">{item.description}</p>
                  {!canAfford && (
                    <p className="text-xs text-red-400 mt-1">
                      Need {item.cost - coins} more coin{item.cost - coins !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => canAfford && openModal(item)}
                  disabled={!canAfford}
                  className={`flex-shrink-0 text-sm py-2 px-4 font-semibold rounded-lg transition-colors duration-150 ${
                    canAfford
                      ? 'btn-primary'
                      : 'bg-navy-700 text-navy-400 cursor-not-allowed'
                  }`}
                >
                  Buy
                </button>
              </div>
            );
          })}
        </div>

        {/* Empty state if no friends */}
        {!friendsLoading && friends.length === 0 && (
          <div className="card mt-6 text-center py-8 bg-navy-700/30">
            <p className="text-2xl mb-2">👥</p>
            <p className="text-navy-200 text-sm font-medium">No friends to target yet</p>
            <p className="text-navy-400 text-xs mt-1 mb-4">
              Add friends first so you can use shop items on them.
            </p>
            <Link href="/friends" className="btn-primary text-sm py-2 px-5">
              Find Friends
            </Link>
          </div>
        )}
      </div>

      {/* Purchase modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl">

            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{activeItem.icon}</span>
              <div>
                <h2 className="text-lg font-bold text-navy-50">{activeItem.name}</h2>
                <p className="flex items-center gap-1 text-xs text-yellow-400 font-semibold">
                  <img src="/Pcoin.svg" alt="coin" className="w-3.5 h-3.5" />
                  {activeItem.cost} coins
                </p>
              </div>
            </div>

            <p className="text-sm text-navy-300 mb-5">{activeItem.description}</p>

            {/* Friend picker */}
            <div className="mb-5">
              <label className="label mb-2 block">Choose your target</label>
              {friendsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : friends.length === 0 ? (
                <p className="text-sm text-navy-400 py-2">No friends to target.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {friends.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFriend(f)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors duration-150 ${
                        selectedFriend?.id === f.id
                          ? 'border-amber-500/60 bg-amber-500/10'
                          : 'border-navy-600 bg-navy-700/50 hover:border-navy-500'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-navy-500 flex-shrink-0">
                        {f.avatar ? (
                          <img src={f.avatar} alt={f.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-navy-600 flex items-center justify-center">
                            <span className="text-sm font-bold text-navy-300">{f.username[0].toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy-100">{f.username}</p>
                        <p className="text-xs text-navy-400">
                          {f.totalDebt > 0
                            ? `${f.totalDebt} pushups owed`
                            : 'Debt free'}
                        </p>
                      </div>
                      {selectedFriend?.id === f.id && (
                        <span className="text-amber-400 text-sm flex-shrink-0">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {result && (
              <div className={`text-sm px-3 py-2.5 rounded-lg border mb-4 ${
                result.type === 'success'
                  ? 'text-green-400 bg-green-900/20 border-green-800'
                  : 'text-red-400 bg-red-900/20 border-red-800'
              }`}>
                {result.message}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={closeModal} className="btn-secondary flex-1 py-2.5 text-sm">
                Cancel
              </button>
              <button
                onClick={handleBuy}
                disabled={!selectedFriend || buying || !!result?.type === 'success'}
                className="btn-primary flex-1 py-2.5 text-sm"
              >
                {buying ? 'Sending…' : (
                  <span className="flex items-center justify-center gap-1.5">
                    Confirm — <img src="/Pcoin.svg" alt="coin" className="w-4 h-4" /> {activeItem.cost}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
