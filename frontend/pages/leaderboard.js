import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getLeaderboard, getStreak } from '../lib/api';

export default function Leaderboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('Global');
  const [leaderboard, setLeaderboard] = useState([]);
  const [friendsLeaderboard, setFriendsLeaderboard] = useState([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [friendsLoading, setFriendsLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/welcome');
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    Promise.all([getLeaderboard(false), getStreak()])
      .then(([lbRes, streakRes]) => {
        setLeaderboard(lbRes.data.leaderboard);
        setStreak(streakRes.data.streak);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user || tab !== 'Friends') return;
    setFriendsLoading(true);
    getLeaderboard(true)
      .then((r) => setFriendsLeaderboard(r.data.leaderboard))
      .catch(console.error)
      .finally(() => setFriendsLoading(false));
  }, [user, tab]);

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const medals = ['🥇', '🥈', '🥉'];

  function LeaderboardList({ entries, isLoading }) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (entries.length === 0) {
      return (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-navy-200 font-medium mb-1">No friends yet</p>
          <p className="text-navy-400 text-sm mb-4">Add friends to see how you stack up.</p>
          <Link href="/friends" className="btn-primary text-sm py-2 px-5 inline-block">Find Friends</Link>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {entries.map((entry, i) => {
          const isCurrentUser = entry.id === user?.id;
          return (
            <div
              key={entry.id}
              className={`card flex items-center gap-4 transition-all ${
                isCurrentUser ? 'border-amber-500/50 bg-amber-900/10' : i < 3 ? 'border-navy-300' : ''
              }`}
            >
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-navy-600">
                  {entry.avatar ? (
                    <img src={entry.avatar} alt={entry.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-amber-500/20 flex items-center justify-center">
                      <span className="text-sm font-bold text-amber-400">
                        {(entry.username || '?')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                {i < 3 ? (
                  <span className="absolute -bottom-1 -right-1 text-sm leading-none">{medals[i]}</span>
                ) : (
                  <span className="absolute -bottom-1 -right-1 text-xs font-bold text-navy-300 bg-navy-800 rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {i + 1}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {!isCurrentUser && entry.username && !entry.username.includes('***') ? (
                    <Link href={`/u/${entry.username}`} className="font-semibold text-navy-50 truncate hover:text-amber-400 transition-colors">
                      {entry.username}
                    </Link>
                  ) : (
                    <p className="font-semibold text-navy-50 truncate">{entry.username}</p>
                  )}
                  {isCurrentUser && (
                    <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                      you
                    </span>
                  )}
                </div>
                <p className="text-xs text-navy-200 mt-0.5">
                  {entry.totalDebt === 0
                    ? <span className="text-green-400 font-medium">Clean</span>
                    : <span className="text-red-400 font-medium">{entry.totalDebt} owed</span>
                  }
                  {' · '}{entry.totalPushups} pushups
                  {' · '}<span className="text-amber-400 font-medium">{entry.totalTasksCompleted} tasks all-time</span>
                  {' · '}since {new Date(entry.memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-lg font-bold text-amber-400 tabular-nums">{entry.tasksCompleted7d}</span>
                <p className="text-xs text-navy-300">tasks (7d)</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Layout streak={streak}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-navy-50">Leaderboard</h1>
          <p className="text-navy-200 text-sm mt-1">
            Ranked by tasks completed in the last 7 days
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-navy-800/60 rounded-xl p-1 mb-6">
          {['Global', 'Friends'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors duration-150 ${
                tab === t ? 'bg-navy-600 text-navy-50' : 'text-navy-300 hover:text-navy-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Global' && (
          <LeaderboardList entries={loading ? [] : leaderboard} isLoading={loading} />
        )}
        {tab === 'Friends' && (
          <LeaderboardList entries={friendsLoading ? [] : friendsLeaderboard} isLoading={friendsLoading} />
        )}

        <div className="card mt-6 text-center bg-navy-700/50">
          <p className="text-sm text-navy-200">
            {tab === 'Friends'
              ? 'Only your accepted friends are shown here.'
              : 'Complete more tasks this week to climb the ranks. Resets every 7 days.'}
          </p>
        </div>
      </div>
    </Layout>
  );
}
