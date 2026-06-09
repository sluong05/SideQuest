import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import {
  getFriends, getFriendRequests, searchUsers,
  sendFriendRequest, acceptFriendRequest, declineFriendRequest,
  removeFriend, createChallenge, getChallenges, acceptChallenge, declineChallenge,
  getStreak,
} from '../lib/api';

function Avatar({ username, avatar, size = 10 }) {
  const dim = `w-${size} h-${size}`;
  return (
    <div className={`${dim} rounded-full overflow-hidden border border-navy-600 flex-shrink-0`}>
      {avatar ? (
        <img src={avatar} alt={username} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-navy-700 flex items-center justify-center">
          <span className="text-base font-bold text-navy-300">{username[0].toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}

const TABS = ['Friends', 'Requests', 'Find'];
const CHALLENGE_TYPES = [
  { value: 'tasks', label: 'Tasks completed' },
  { value: 'pushups', label: 'Pushups logged' },
];
const DURATIONS = [3, 7, 14, 30];

function timeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Friends() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('Friends');
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    getStreak().then((r) => setStreak(r.data.streak)).catch(() => {});
  }, [user]);

  // ── Friends tab ────────────────────────────────────────────────────────────
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [challengeModal, setChallengeModal] = useState(null); // { friendId, username }
  const [challengeType, setChallengeType] = useState('tasks');
  const [challengeDuration, setChallengeDuration] = useState(7);
  const [challengeSending, setChallengeSending] = useState(false);
  const [challengeMsg, setChallengeMsg] = useState(null);

  const loadFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const r = await getFriends();
      setFriends(r.data.friends);
    } catch {}
    finally { setFriendsLoading(false); }
  }, []);

  useEffect(() => { if (user) loadFriends(); }, [user]);

  async function handleRemoveFriend(id) {
    try {
      await removeFriend(id);
      setFriends((prev) => prev.filter((f) => f.id !== id));
    } catch {}
  }

  async function handleSendChallenge() {
    if (!challengeModal) return;
    setChallengeSending(true);
    setChallengeMsg(null);
    try {
      await createChallenge(challengeModal.friendId, challengeType, challengeDuration);
      setChallengeMsg({ type: 'success', text: `Challenge sent to ${challengeModal.username}!` });
      setTimeout(() => { setChallengeModal(null); setChallengeMsg(null); }, 1500);
    } catch (err) {
      setChallengeMsg({ type: 'error', text: err.response?.data?.error || 'Failed to send challenge' });
    } finally {
      setChallengeSending(false);
    }
  }

  // ── Requests tab ──────────────────────────────────────────────────────────
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const r = await getFriendRequests();
      setRequests(r.data.requests);
    } catch {}
    finally { setRequestsLoading(false); }
  }, []);

  useEffect(() => { if (user && tab === 'Requests') loadRequests(); }, [user, tab]);

  async function handleAccept(id) {
    try {
      await acceptFriendRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {}
  }

  async function handleDecline(id) {
    try {
      await declineFriendRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {}
  }

  // ── Find tab ──────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const r = await searchUsers(query);
        setSearchResults(r.data.results);
      } catch {}
      finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function handleAddFriend(username) {
    try {
      const res = await sendFriendRequest(username);
      const friendshipId = res.data.friendship.id;
      setSearchResults((prev) =>
        prev.map((u) => u.username === username ? { ...u, pendingStatus: 'sent', friendshipId } : u)
      );
    } catch {}
  }

  async function handleUnsendRequest(friendshipId) {
    try {
      await removeFriend(friendshipId);
      setSearchResults((prev) =>
        prev.map((u) => u.friendshipId === friendshipId ? { ...u, pendingStatus: null, friendshipId: null } : u)
      );
    } catch {}
  }

  // ── Challenges section (shown in Friends tab) ─────────────────────────────
  const [challenges, setChallenges] = useState([]);

  useEffect(() => {
    if (!user) return;
    getChallenges().then((r) => setChallenges(r.data.challenges)).catch(() => {});
  }, [user]);

  async function handleAcceptChallenge(id) {
    try {
      await acceptChallenge(id);
      setChallenges((prev) => prev.map((c) => c.id === id ? { ...c, status: 'active' } : c));
    } catch {}
  }

  async function handleDeclineChallenge(id) {
    try {
      await declineChallenge(id);
      setChallenges((prev) => prev.filter((c) => c.id !== id));
    } catch {}
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pendingChallenges = challenges.filter((c) => c.status === 'pending' && !c.isChallenger);
  const activeChallenges = challenges.filter((c) => c.status === 'active');
  const pastChallenges = challenges.filter((c) => c.winner);

  return (
    <Layout streak={streak}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-navy-50">Friends</h1>
          <p className="text-navy-300 text-sm mt-1">Connect, compete, and keep each other accountable.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-navy-800/60 rounded-xl p-1 mb-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors duration-150 ${
                tab === t ? 'bg-navy-600 text-navy-50' : 'text-navy-300 hover:text-navy-100'
              }`}
            >
              {t}
              {t === 'Requests' && requests.length > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {requests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Friends Tab ── */}
        {tab === 'Friends' && (
          <div className="space-y-4">
            {/* Pending challenges */}
            {pendingChallenges.length > 0 && (
              <div className="card border-blue-700/40 bg-amber-950/10">
                <p className="text-xs font-semibold text-amber-500/80 uppercase tracking-widest mb-3">
                  Challenge Requests
                </p>
                <div className="space-y-3">
                  {pendingChallenges.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-navy-100">
                          <span className="font-semibold">{c.challenger.username}</span> challenged you —{' '}
                          <span className="text-blue-400">{c.type === 'tasks' ? 'most tasks' : 'most pushups'}</span>{' '}
                          in {c.durationDays} days
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => handleAcceptChallenge(c.id)} className="btn-primary text-xs py-1.5 px-3">
                          Accept
                        </button>
                        <button onClick={() => handleDeclineChallenge(c.id)} className="btn-secondary text-xs py-1.5 px-3">
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active challenges */}
            {activeChallenges.length > 0 && (
              <div className="card">
                <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest mb-3">Active Challenges</p>
                <div className="space-y-3">
                  {activeChallenges.map((c) => {
                    const opponent = c.isChallenger ? c.challenged : c.challenger;
                    const daysLeft = c.endDate
                      ? Math.max(0, Math.ceil((new Date(c.endDate) - Date.now()) / 86400000))
                      : null;
                    return (
                      <div key={c.id} className="bg-navy-700/40 rounded-lg px-3 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-navy-100">
                            vs <Link href={`/u/${opponent.username}`} className="hover:text-blue-400 transition-colors">{opponent.username}</Link>
                          </p>
                          <span className="text-xs text-navy-400">
                            {daysLeft !== null ? `${daysLeft}d left` : ''}
                          </span>
                        </div>
                        <p className="text-xs text-navy-300 mb-2">
                          {c.type === 'tasks' ? 'Most tasks completed' : 'Most pushups logged'}
                        </p>
                        <div className="flex gap-4 text-sm">
                          <span className="text-blue-400 font-bold">You: {c.myScore ?? '—'}</span>
                          <span className="text-navy-300">vs</span>
                          <span className="text-navy-200">{opponent.username}: {c.opponentScore ?? '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Past challenges */}
            {pastChallenges.length > 0 && (
              <div className="card bg-navy-700/30">
                <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest mb-3">Completed Challenges</p>
                <div className="space-y-2">
                  {pastChallenges.map((c) => {
                    const opponent = c.isChallenger ? c.challenged : c.challenger;
                    return (
                      <div key={c.id} className="flex items-center justify-between text-sm">
                        <span className="text-navy-300">vs {opponent.username}</span>
                        <span className={
                          c.winner === 'you' ? 'text-green-400 font-semibold' :
                          c.winner === 'tie' ? 'text-blue-400' : 'text-red-400'
                        }>
                          {c.winner === 'you' ? <span className="flex items-center gap-1"><img src="/Ranking.svg" className="w-4 h-4" />Won</span> : c.winner === 'tie' ? '🤝 Tie' : 'Lost'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Friends list */}
            {friendsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : friends.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-3xl mb-3">👥</p>
                <p className="text-navy-200 font-medium">No friends yet</p>
                <p className="text-navy-400 text-sm mt-1 mb-4">Find people by username to get started.</p>
                <button onClick={() => setTab('Find')} className="btn-primary text-sm py-2 px-5">
                  Find Friends
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {friends.map((f) => (
                  <div key={f.id} className="card flex items-center gap-4">
                    <Avatar username={f.username} avatar={f.avatar} />
                    <div className="flex-1 min-w-0">
                      <Link href={`/u/${f.username}`} className="font-semibold text-navy-50 hover:text-blue-400 transition-colors">
                        {f.username}
                      </Link>
                      <p className="text-xs text-navy-300 mt-0.5">
                        {f.totalDebt === 0
                          ? <span className="text-green-400">Clean</span>
                          : <span className="text-red-400">{f.totalDebt} owed</span>
                        }
                        {' · '}{f.totalPushups} pushups · {f.totalTasksCompleted} tasks
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => { setChallengeModal({ friendId: f.id, username: f.username }); setChallengeMsg(null); }}
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        Challenge
                      </button>
                      <button
                        onClick={() => handleRemoveFriend(f.id)}
                        className="text-xs text-navy-400 hover:text-red-400 transition-colors py-1.5 px-2"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Requests Tab ── */}
        {tab === 'Requests' && (
          <div>
            {requestsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-3xl mb-3">📭</p>
                <p className="text-navy-200">No pending requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((r) => (
                  <div key={r.id} className="card flex items-center gap-4">
                    <Avatar username={r.from.username} avatar={r.from.avatar} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy-50">{r.from.username}</p>
                      <p className="text-xs text-navy-400">{timeAgo(r.createdAt)}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => handleAccept(r.id)} className="btn-primary text-xs py-1.5 px-3">
                        Accept
                      </button>
                      <button onClick={() => handleDecline(r.id)} className="btn-secondary text-xs py-1.5 px-3">
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Find Tab ── */}
        {tab === 'Find' && (
          <div>
            <div className="mb-4">
              <input
                type="text"
                className="input"
                placeholder="Search by username…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            {searchLoading && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!searchLoading && query.length >= 2 && searchResults.length === 0 && (
              <div className="card text-center py-8">
                <p className="text-navy-300 text-sm">No users found for "{query}"</p>
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="space-y-3">
                {searchResults.map((u) => (
                  <div key={u.id} className="card flex items-center gap-4">
                    <Avatar username={u.username} avatar={u.avatar} />
                    <p className="flex-1 font-semibold text-navy-50">{u.username}</p>
                    {u.pendingStatus === 'sent' ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-navy-300">Request sent</span>
                        <button
                          onClick={() => handleUnsendRequest(u.friendshipId)}
                          className="text-xs text-navy-400 hover:text-red-400 transition-colors py-1.5 px-2"
                        >
                          Unsend
                        </button>
                      </div>
                    ) : u.pendingStatus === 'received' ? (
                      <button
                        onClick={() => setTab('Requests')}
                        className="text-xs btn-secondary py-1.5 px-3 flex-shrink-0"
                      >
                        Respond
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAddFriend(u.username)}
                        className="btn-primary text-xs py-1.5 px-3 flex-shrink-0"
                      >
                        Add Friend
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {query.length < 2 && (
              <div className="card text-center py-10 bg-navy-700/30">
                <p className="text-navy-400 text-sm">Type at least 2 characters to search</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Challenge modal */}
      {challengeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setChallengeModal(null)} />
          <div className="relative bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-lg font-bold text-navy-50 mb-1">Challenge {challengeModal.username}</h2>
            <p className="text-sm text-navy-300 mb-5">First to win based on the metric you pick.</p>

            <div className="space-y-4">
              <div>
                <label className="label">Challenge type</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {CHALLENGE_TYPES.map((ct) => (
                    <button
                      key={ct.value}
                      onClick={() => setChallengeType(ct.value)}
                      className={`text-sm py-2 px-3 rounded-lg border font-medium transition-colors ${
                        challengeType === ct.value
                          ? 'bg-blue-500/20 border-blue-500/60 text-blue-400'
                          : 'bg-navy-700 border-navy-600 text-navy-300'
                      }`}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Duration</label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setChallengeDuration(d)}
                      className={`text-sm py-2 rounded-lg border font-medium transition-colors ${
                        challengeDuration === d
                          ? 'bg-blue-500/20 border-blue-500/60 text-blue-400'
                          : 'bg-navy-700 border-navy-600 text-navy-300'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              {challengeMsg && (
                <p className={`text-sm px-3 py-2 rounded-lg border ${
                  challengeMsg.type === 'success'
                    ? 'text-green-400 bg-green-900/20 border-green-800'
                    : 'text-red-400 bg-red-900/20 border-red-800'
                }`}>
                  {challengeMsg.text}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setChallengeModal(null)} className="btn-secondary flex-1 py-2.5 text-sm">
                  Cancel
                </button>
                <button onClick={handleSendChallenge} disabled={challengeSending} className="btn-primary flex-1 py-2.5 text-sm">
                  {challengeSending ? 'Sending…' : 'Send Challenge'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
