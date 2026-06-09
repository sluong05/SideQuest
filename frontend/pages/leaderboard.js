import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getLeaderboard, getStreak } from '../lib/api';

const LEAGUES = [
  { name: 'Bronze',   minXP: 0,     color: '#CD7F32', bg: 'rgba(205,127,50,0.15)',   border: 'rgba(205,127,50,0.4)',  icon: '🥉' },
  { name: 'Silver',   minXP: 500,   color: '#C0C0C0', bg: 'rgba(192,192,192,0.1)',   border: 'rgba(192,192,192,0.3)', icon: '🥈' },
  { name: 'Gold',     minXP: 1500,  color: '#FFD700', bg: 'rgba(255,215,0,0.15)',    border: 'rgba(255,215,0,0.4)',   icon: '🥇' },
  { name: 'Platinum', minXP: 3000,  color: '#60a5fa', bg: 'rgba(59,130,246,0.15)',   border: 'rgba(59,130,246,0.4)',  icon: '💎' },
  { name: 'Diamond',  minXP: 6000,  color: '#c084fc', bg: 'rgba(168,85,247,0.15)',   border: 'rgba(168,85,247,0.4)',  icon: '💠' },
];

function getLeague(xp) {
  let league = LEAGUES[0];
  for (const l of LEAGUES) { if ((xp ?? 0) >= l.minXP) league = l; }
  return league;
}

function getNextLeague(xp) {
  const idx = LEAGUES.findIndex((l) => l.name === getLeague(xp).name);
  return idx < LEAGUES.length - 1 ? LEAGUES[idx + 1] : null;
}

const PODIUM_STYLES = [
  { ring: '#FFD700', bg: 'linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,215,0,0.06))', medal: '🥇', label: '1st', height: 'h-28', order: 'order-2' },
  { ring: '#C0C0C0', bg: 'linear-gradient(135deg,rgba(192,192,192,0.12),rgba(192,192,192,0.04))', medal: '🥈', label: '2nd', height: 'h-20', order: 'order-1' },
  { ring: '#CD7F32', bg: 'linear-gradient(135deg,rgba(205,127,50,0.12),rgba(205,127,50,0.04))', medal: '🥉', label: '3rd', height: 'h-16', order: 'order-3' },
];

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
    if (!authLoading && !user) router.push('/welcome');
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

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeEntries = tab === 'Friends' ? friendsLeaderboard : leaderboard;
  const isLoadingActive = tab === 'Friends' ? friendsLoading : loading;
  const userEntry = activeEntries.find((e) => e.id === user?.id);
  const userRank = userEntry ? activeEntries.indexOf(userEntry) + 1 : null;
  const userLeague = getLeague(user?.xp);
  const nextLeague = getNextLeague(user?.xp);
  const xpToNext = nextLeague ? nextLeague.minXP - (user?.xp ?? 0) : 0;
  const leagueProgress = nextLeague ? Math.round(((user?.xp ?? 0) - userLeague.minXP) / (nextLeague.minXP - userLeague.minXP) * 100) : 100;

  function Podium({ entries }) {
    const top3 = entries.slice(0, 3);
    if (top3.length < 1) return null;
    const order = [top3[1], top3[0], top3[2]].filter(Boolean);
    const styleMap = { 0: PODIUM_STYLES[0], 1: PODIUM_STYLES[1], 2: PODIUM_STYLES[2] };

    return (
      <div className="flex items-end justify-center gap-3 mb-6 px-4">
        {order.map((entry) => {
          const rank = entries.indexOf(entry);
          const ps = PODIUM_STYLES[rank];
          if (!ps) return null;
          return (
            <div
              key={entry.id}
              className={`${ps.order} flex-1 max-w-[160px] rounded-2xl p-4 text-center`}
              style={{ background: ps.bg, border: `1px solid ${ps.ring}40` }}
            >
              <div className="text-2xl mb-1">{ps.medal}</div>
              <div
                className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-sm font-bold"
                style={{ background: 'rgba(59,130,246,0.2)', border: `2px solid ${ps.ring}70`, color: ps.ring }}
              >
                {(entry.username || '?')[0].toUpperCase()}
              </div>
              <p className="text-xs font-bold text-navy-100 truncate mb-0.5">{entry.username || 'Anonymous'}</p>
              <p className="text-[10px] text-navy-400 mb-1">{ps.label}</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: ps.ring }}>{entry.tasksCompleted7d}</p>
              <p className="text-[9px] text-navy-500">quests (7d)</p>
            </div>
          );
        })}
      </div>
    );
  }

  function LeaderboardList({ entries, isLoading }) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (entries.length === 0) {
      return (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-navy-200 font-medium mb-1">No entries yet</p>
          <p className="text-navy-400 text-sm mb-4">
            {tab === 'Friends' ? 'Add friends to see how you stack up.' : 'Complete quests to appear here.'}
          </p>
          {tab === 'Friends' && <Link href="/friends" className="btn-primary text-sm py-2 px-5 inline-block">Find Friends</Link>}
        </div>
      );
    }

    return (
      <div className="card p-0 overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-navy-500" style={{ borderBottom: '1px solid rgba(59,130,246,0.1)', background: 'rgba(8,15,32,0.5)' }}>
          <div className="w-8 flex-shrink-0 text-center">#</div>
          <div className="flex-1">Player</div>
          <div className="hidden sm:block w-16 text-center flex-shrink-0">Level</div>
          <div className="hidden md:block w-20 text-center flex-shrink-0">Total XP</div>
          <div className="hidden lg:block w-24 text-center flex-shrink-0">Quests (7d)</div>
          <div className="w-16 text-center flex-shrink-0">Score</div>
        </div>

        {entries.map((entry, i) => {
          const isCurrentUser = entry.id === user?.id;
          const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#60a5fa';
          const entryLeague = getLeague(entry.xp ?? 0);

          return (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-4 py-3 transition-all"
              style={{
                borderBottom: '1px solid rgba(59,130,246,0.06)',
                background: isCurrentUser ? 'rgba(59,130,246,0.08)' : 'transparent',
              }}
            >
              {/* Rank */}
              <div className="w-8 text-center flex-shrink-0">
                {i < 3 ? (
                  <span className="text-lg">{['🥇','🥈','🥉'][i]}</span>
                ) : (
                  <span className="text-sm font-bold" style={{ color: rankColor }}>#{i + 1}</span>
                )}
              </div>

              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{ background: 'rgba(59,130,246,0.15)', border: `1.5px solid ${rankColor}50`, color: rankColor }}
              >
                {(entry.username || '?')[0].toUpperCase()}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {!isCurrentUser && entry.username && !entry.username.includes('***') ? (
                    <Link href={`/u/${entry.username}`} className="text-sm font-semibold text-navy-50 truncate hover:text-blue-400 transition-colors">
                      {entry.username}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-navy-50 truncate">{entry.username || 'Anonymous'}</span>
                  )}
                  {isCurrentUser && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-blue-400 flex-shrink-0" style={{ background: 'rgba(59,130,246,0.15)' }}>you</span>
                  )}
                </div>
                <p className="text-xs text-navy-500 mt-0.5 hidden sm:block">
                  {entry.totalDebt === 0 ? <span className="text-green-400">Debt free</span> : <span className="text-red-400">{entry.totalDebt} debt</span>}
                </p>
              </div>

              <div className="hidden sm:block w-16 text-center flex-shrink-0">
                <span className="text-xs font-medium" style={{ color: entryLeague.color }}>{entryLeague.icon} {entryLeague.name}</span>
              </div>
              <div className="hidden md:block w-20 text-center flex-shrink-0">
                <span className="text-xs font-bold text-yellow-400 tabular-nums">{(entry.xp ?? 0).toLocaleString()}</span>
              </div>
              <div className="hidden lg:block w-24 text-center flex-shrink-0">
                <span className="text-xs text-navy-300 tabular-nums">{entry.totalTasksCompleted}</span>
              </div>

              {/* Score (7d) */}
              <div className="w-16 text-center flex-shrink-0">
                <span className="text-base font-bold tabular-nums" style={{ color: rankColor }}>{entry.tasksCompleted7d}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Layout streak={streak}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2">
          {/* User's own stats banner */}
          {userEntry && (
            <div className="card mb-5 flex items-center gap-4 flex-wrap" style={{ background: 'rgba(59,130,246,0.07)', borderColor: 'rgba(59,130,246,0.3)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-navy-400 mb-0.5">Your Rank</p>
                <p className="text-3xl font-bold text-blue-400">#{userRank}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-navy-400 mb-0.5">XP</p>
                <p className="text-xl font-bold text-yellow-400">{(user?.xp ?? 0).toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-navy-400 mb-0.5">This Week</p>
                <p className="text-xl font-bold text-green-400">{userEntry.tasksCompleted7d}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-navy-400 mb-0.5">League</p>
                <p className="text-sm font-bold" style={{ color: userLeague.color }}>{userLeague.icon} {userLeague.name}</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="mb-5">
            <h1 className="text-2xl font-bold text-navy-50">Leaderboard</h1>
            <p className="text-navy-300 text-sm mt-1">Ranked by quests completed in the last 7 days</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-xl p-1 mb-5" style={{ background: 'rgba(13,31,56,0.6)', border: '1px solid rgba(59,130,246,0.1)' }}>
            {['Global', 'Friends'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2 text-sm font-semibold rounded-lg transition-colors"
                style={{
                  background: tab === t ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: tab === t ? '#60a5fa' : '#475569',
                  border: tab === t ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Podium */}
          {!isLoadingActive && activeEntries.length >= 3 && <Podium entries={activeEntries} />}

          {/* Full list */}
          <LeaderboardList entries={isLoadingActive ? [] : activeEntries} isLoading={isLoadingActive} />
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* League progress */}
          <div className="card">
            <h3 className="text-xs font-semibold text-navy-300 uppercase tracking-wide mb-3">League Progress</h3>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{userLeague.icon}</span>
              <div>
                <p className="text-base font-bold" style={{ color: userLeague.color }}>{userLeague.name}</p>
                <p className="text-xs text-navy-400">{(user?.xp ?? 0).toLocaleString()} XP</p>
              </div>
            </div>
            {nextLeague && (
              <>
                <div className="w-full h-2 rounded-full mb-2" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <div className="h-2 rounded-full transition-all" style={{ width: `${leagueProgress}%`, background: `linear-gradient(90deg, ${userLeague.color}, ${nextLeague.color})` }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-navy-400">{userLeague.name}</span>
                  <span className="text-navy-400">{nextLeague.name} ({xpToNext.toLocaleString()} XP away)</span>
                </div>
              </>
            )}
            {!nextLeague && <p className="text-xs text-yellow-400 font-medium">Max league reached! 🏆</p>}
          </div>

          {/* Upcoming rewards */}
          <div className="card">
            <h3 className="text-xs font-semibold text-navy-300 uppercase tracking-wide mb-3">Upcoming Rewards</h3>
            {nextLeague ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: `${nextLeague.bg}` }}>
                  <span className="text-lg">{nextLeague.icon}</span>
                  <div>
                    <p className="text-xs font-bold" style={{ color: nextLeague.color }}>{nextLeague.name} Tier Unlock</p>
                    <p className="text-[10px] text-navy-400">{xpToNext.toLocaleString()} XP needed</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)' }}>
                  <span className="text-lg">✦</span>
                  <div>
                    <p className="text-xs font-bold text-yellow-400">Exclusive Badge</p>
                    <p className="text-[10px] text-navy-400">Reach {nextLeague.name}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-green-400 font-medium">You've unlocked everything! 🏆</p>
            )}
          </div>

          {/* How ranking works */}
          <div className="card">
            <h3 className="text-xs font-semibold text-navy-300 uppercase tracking-wide mb-3">How Ranking Works</h3>
            <div className="space-y-2 text-xs text-navy-400">
              <div className="flex items-start gap-2">
                <span className="text-blue-400 flex-shrink-0">📅</span>
                <span>Rank is based on quests completed in the <span className="text-navy-200">last 7 days</span></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-yellow-400 flex-shrink-0">✦</span>
                <span>Total XP determines your <span className="text-navy-200">league tier</span></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-400 flex-shrink-0">✅</span>
                <span>Complete more quests each week to climb the ranks</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400 flex-shrink-0">🔥</span>
                <span>Streaks and debt paid are tracked but don't affect rank directly</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
