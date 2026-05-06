import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { useAuth } from '../../contexts/AuthContext';
import { getPublicProfile, sendFriendRequest, getFriends, createChallenge, getStreak } from '../../lib/api';

const CHALLENGE_TYPES = [
  { value: 'tasks', label: 'Most tasks completed' },
  { value: 'pushups', label: 'Most pushups logged' },
];
const DURATIONS = [3, 7, 14, 30];

export default function PublicProfile() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { username } = router.query;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFriend, setIsFriend] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [streak, setStreak] = useState(0);

  // Challenge modal state
  const [showChallenge, setShowChallenge] = useState(false);
  const [challengeType, setChallengeType] = useState('tasks');
  const [challengeDuration, setChallengeDuration] = useState(7);
  const [challengeSending, setChallengeSending] = useState(false);
  const [challengeMsg, setChallengeMsg] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    getStreak().then((r) => setStreak(r.data.streak)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!username || !user) return;

    // Redirect self to own profile
    if (username === user.username) {
      router.replace('/profile');
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      getPublicProfile(username),
      getFriends(),
    ])
      .then(([profileRes, friendsRes]) => {
        setProfile(profileRes.data.user);
        setIsFriend(friendsRes.data.friends.some((f) => f.id === profileRes.data.user.id));
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Could not load profile');
      })
      .finally(() => setLoading(false));
  }, [username, user]);

  async function handleAddFriend() {
    try {
      await sendFriendRequest(username);
      setRequestSent(true);
    } catch {}
  }

  async function handleSendChallenge() {
    if (!profile) return;
    setChallengeSending(true);
    setChallengeMsg(null);
    try {
      await createChallenge(profile.id, challengeType, challengeDuration);
      setChallengeMsg({ type: 'success', text: 'Challenge sent!' });
      setTimeout(() => { setShowChallenge(false); setChallengeMsg(null); }, 1500);
    } catch (err) {
      setChallengeMsg({ type: 'error', text: err.response?.data?.error || 'Failed to send challenge' });
    } finally {
      setChallengeSending(false);
    }
  }

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Layout streak={streak}>
      <div className="max-w-lg mx-auto">
        <Link href="/friends" className="inline-flex items-center gap-1 text-sm text-navy-200 hover:text-navy-100 mb-6 transition-colors">
          ← Friends
        </Link>

        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="card text-center py-12">
            <p className="text-3xl mb-3">🔒</p>
            <p className="text-navy-200 font-medium">{error}</p>
          </div>
        )}

        {profile && !loading && (
          <>
            {/* Header */}
            <div className="card mb-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-navy-600 flex-shrink-0">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt={profile.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-amber-500/20 flex items-center justify-center">
                      <span className="text-2xl font-bold text-amber-400">
                        {profile.username[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h1 className="text-xl font-bold text-navy-50">{profile.username}</h1>
                  {profile.bio && (
                    <p className="text-sm text-navy-300 mt-0.5 leading-relaxed">{profile.bio}</p>
                  )}
                  <p className="text-xs text-navy-400 mt-1">
                    Member since{' '}
                    {new Date(profile.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                  <div className="flex gap-2 mt-3">
                    {isFriend ? (
                      <button onClick={() => { setShowChallenge(true); setChallengeMsg(null); }} className="btn-primary text-sm py-2 px-4">
                        ⚔️ Challenge
                      </button>
                    ) : requestSent ? (
                      <button disabled className="btn-secondary text-sm py-2 px-4 opacity-60 cursor-not-allowed">
                        Request Sent ✓
                      </button>
                    ) : (
                      <button onClick={handleAddFriend} className="btn-primary text-sm py-2 px-4">
                        + Add Friend
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="card py-4 text-center">
                <p className={`text-2xl font-bold tabular-nums ${profile.totalDebt === 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {profile.totalDebt}
                </p>
                <p className="text-xs text-navy-300 mt-1">pushups owed</p>
              </div>
              <div className="card py-4 text-center">
                <p className="text-2xl font-bold text-amber-400 tabular-nums">{profile.maxStreak}</p>
                <p className="text-xs text-navy-300 mt-1">best streak</p>
              </div>
              <div className="card py-4 text-center">
                <p className="text-2xl font-bold text-navy-50 tabular-nums">{profile.totalPushups}</p>
                <p className="text-xs text-navy-300 mt-1">pushups all-time</p>
              </div>
              <div className="card py-4 text-center">
                <p className="text-2xl font-bold text-green-400 tabular-nums">{profile.totalTasksCompleted}</p>
                <p className="text-xs text-navy-300 mt-1">tasks completed</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Challenge modal */}
      {showChallenge && profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowChallenge(false)} />
          <div className="relative bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-lg font-bold text-navy-50 mb-1">Challenge {profile.username}</h2>
            <p className="text-sm text-navy-300 mb-5">Pick a metric and duration.</p>

            <div className="space-y-4">
              <div>
                <label className="label">Type</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {CHALLENGE_TYPES.map((ct) => (
                    <button key={ct.value} onClick={() => setChallengeType(ct.value)}
                      className={`text-sm py-2 px-3 rounded-lg border font-medium transition-colors ${
                        challengeType === ct.value
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-400'
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
                    <button key={d} onClick={() => setChallengeDuration(d)}
                      className={`text-sm py-2 rounded-lg border font-medium transition-colors ${
                        challengeDuration === d
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-400'
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
                <button onClick={() => setShowChallenge(false)} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
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
