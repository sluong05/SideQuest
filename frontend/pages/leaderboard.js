import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getLeaderboard, getStreak } from '../lib/api';

export default function Leaderboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/welcome');
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    Promise.all([getLeaderboard(), getStreak()])
      .then(([lbRes, streakRes]) => {
        setLeaderboard(lbRes.data.leaderboard);
        setStreak(streakRes.data.streak);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <Layout streak={streak}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy-50">Leaderboard</h1>
          <p className="text-navy-200 text-sm mt-1">
            Ranked by tasks completed · tiebreaker: clean slate, then lowest debt, then most pushups done
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-4xl mb-3">👻</p>
            <p className="text-navy-200">No users yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leaderboard.map((entry, i) => {
              const isCurrentUser = entry.id === user?.id;
              const isTop3 = i < 3;

              return (
                <div
                  key={entry.id}
                  className={`card flex items-center gap-4 transition-all ${
                    isCurrentUser
                      ? 'border-amber-500/50 bg-amber-900/10'
                      : isTop3
                      ? 'border-navy-300'
                      : ''
                  }`}
                >
                  {/* Rank */}
                  <div className="w-8 text-center flex-shrink-0">
                    {i < 3 ? (
                      <span className="text-xl">{medals[i]}</span>
                    ) : (
                      <span className="text-sm font-bold text-navy-300">#{i + 1}</span>
                    )}
                  </div>

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-navy-50 truncate">
                        {entry.username}
                      </p>
                      {isCurrentUser && (
                        <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                          you
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-navy-200 mt-0.5">
                      {entry.tasksCompleted} tasks completed · {entry.totalPushups} pushups done · member since{' '}
                      {new Date(entry.memberSince).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  {/* Debt */}
                  <div className="text-right flex-shrink-0">
                    {entry.totalDebt === 0 ? (
                      <div className="flex items-center gap-1.5 text-green-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm font-bold">Clean</span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-lg font-bold text-red-400 tabular-nums">
                          {entry.totalDebt}
                        </span>
                        <p className="text-xs text-navy-300">owed</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="card mt-6 text-center bg-navy-700/50">
          <p className="text-sm text-navy-200">
            Complete more tasks to climb the ranks. Ties broken by debt, then pushups done.
          </p>
        </div>
      </div>
    </Layout>
  );
}
