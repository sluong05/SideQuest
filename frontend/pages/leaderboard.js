import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getLeaderboard, getStreak } from '../lib/api';
import { Icon } from '../components/Icons';

const LEAGUES = [
  { name: 'Bronze',   minXP: 0,     color: '#CD7F32', bg: 'rgba(205,127,50,0.15)',   border: 'rgba(205,127,50,0.4)',  icon: 'medal' },
  { name: 'Silver',   minXP: 500,   color: '#C0C0C0', bg: 'rgba(192,192,192,0.1)',   border: 'rgba(192,192,192,0.3)', icon: 'medal' },
  { name: 'Gold',     minXP: 1500,  color: '#FFD700', bg: 'rgba(255,215,0,0.15)',    border: 'rgba(255,215,0,0.4)',   icon: 'medal' },
  { name: 'Platinum', minXP: 3000,  color: '#60a5fa', bg: 'rgba(59,130,246,0.15)',   border: 'rgba(59,130,246,0.4)',  icon: 'gem' },
  { name: 'Diamond',  minXP: 6000,  color: '#c084fc', bg: 'rgba(168,85,247,0.15)',   border: 'rgba(168,85,247,0.4)',  icon: 'diamond' },
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

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

/* ── shared bits (mirrors progress.js / debt.js visual language) ──────────── */

function IconTile({ name, color = '#60a5fa', bg = 'rgba(37,99,235,0.12)', border = 'rgba(59,130,246,0.25)' }) {
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bg, border: `1px solid ${border}` }}>
      <Icon name={name} color={color} />
    </div>
  );
}

function Hexagon({ size = 48, fill = 'rgba(37,99,235,0.15)', border = '#3b82f6', glow = false, children }) {
  const clip = 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)';
  return (
    <div
      className="relative flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, filter: glow ? 'drop-shadow(0 0 10px rgba(59,130,246,0.55))' : 'none' }}
    >
      <div className="absolute inset-0" style={{ clipPath: clip, background: border }} />
      <div className="absolute" style={{ inset: 2, clipPath: clip, background: '#081525' }} />
      <div className="absolute" style={{ inset: 2, clipPath: clip, background: fill }} />
      <div className="relative flex flex-col items-center justify-center leading-none">{children}</div>
    </div>
  );
}

function StatCard({ icon, iconColor, label, children }) {
  return (
    <div className="stat-card flex flex-col" style={{ padding: '14px' }}>
      <div className="flex items-center gap-2.5 mb-2.5">
        <IconTile name={icon} color={iconColor} />
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-tight">{label}</p>
      </div>
      {children}
    </div>
  );
}

function Avatar({ entry, size = 32, ring = 'rgba(59,130,246,0.4)', glow = false }) {
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white overflow-hidden"
      style={{
        width: size, height: size, fontSize: size * 0.38,
        background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
        border: `2px solid ${ring}`,
        boxShadow: glow ? `0 0 16px ${ring}` : 'none',
      }}
    >
      {entry.avatar ? (
        <img src={entry.avatar} alt={entry.username || 'avatar'} className="w-full h-full object-cover" />
      ) : (
        (entry.username || '?')[0].toUpperCase()
      )}
    </div>
  );
}

/* ── podium ───────────────────────────────────────────────────────────────── */

function Podium({ entries }) {
  const top3 = entries.slice(0, 3);
  if (top3.length < 3) return null;
  // display order: #2 left, #1 center, #3 right
  const order = [{ e: top3[1], rank: 2 }, { e: top3[0], rank: 1 }, { e: top3[2], rank: 3 }];

  return (
    <div className="flex items-stretch justify-center gap-3">
      {order.map(({ e, rank }) => {
        const first = rank === 1;
        const ring = RANK_COLORS[rank - 1];
        return (
          <div
            key={e.id}
            className="flex-1 max-w-[200px] rounded-2xl px-3 py-4 flex flex-col items-center text-center justify-end"
            style={{
              background: first ? 'rgba(37,99,235,0.1)' : 'rgba(8,21,37,0.8)',
              border: `1px solid ${first ? 'rgba(59,130,246,0.45)' : 'rgba(59,130,246,0.15)'}`,
              boxShadow: first ? '0 0 24px rgba(37,99,235,0.25)' : 'none',
            }}
          >
            <div className="relative mb-2">
              <Avatar entry={e} size={first ? 56 : 42} ring={first ? '#3b82f6' : `${ring}80`} glow={first} />
              <span
                className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center font-extrabold text-navy-900"
                style={{ width: 18, height: 18, fontSize: 10, background: ring, border: '2px solid #081525' }}
              >
                {rank}
              </span>
            </div>
            <p className={`font-bold text-navy-50 truncate w-full ${first ? 'text-sm' : 'text-xs'}`}>{e.username || 'Anonymous'}</p>
            <p className={`font-extrabold tabular-nums mt-0.5 ${first ? 'text-lg' : 'text-sm'}`} style={{ color: first ? '#60a5fa' : ring }}>
              {(e.xp ?? 0).toLocaleString()} XP
            </p>
            <div className="flex items-center gap-1 mt-1">
              <Icon name="flame" className="w-3 h-3" color="#fb923c" />
              <span className="text-[10px] text-slate-400">{e.maxStreak ?? 0} day streak</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── ranking table ────────────────────────────────────────────────────────── */

function RankTable({ entries, userId, scope }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500" style={{ borderBottom: '1px solid rgba(59,130,246,0.1)', background: 'rgba(8,15,32,0.5)' }}>
        <div className="w-8 flex-shrink-0 text-center">Rank</div>
        <div className="flex-1">Player</div>
        <div className="w-10 text-center flex-shrink-0">Level</div>
        <div className="hidden sm:block w-16 text-right flex-shrink-0">XP</div>
        <div className="hidden md:block w-20 text-center flex-shrink-0">Quest Streak</div>
        <div className="hidden lg:block w-24 text-center flex-shrink-0">Quests Completed</div>
        <div className="hidden sm:block w-20 text-right flex-shrink-0">Debt Cleared</div>
        <div className="w-9 flex-shrink-0" />
      </div>

      {entries.map((entry, i) => {
        const isYou = entry.id === userId;
        const rankColor = RANK_COLORS[i] ?? '#64748b';
        return (
          <div
            key={entry.id}
            className="flex items-center gap-3 px-4 py-2.5"
            style={{
              borderBottom: '1px solid rgba(59,130,246,0.06)',
              background: isYou ? 'rgba(37,99,235,0.12)' : 'transparent',
              borderLeft: isYou ? '2px solid #3b82f6' : '2px solid transparent',
            }}
          >
            <div className="w-8 text-center flex-shrink-0">
              <span className="text-xs font-bold tabular-nums" style={{ color: i < 3 ? rankColor : '#64748b' }}>{i + 1}</span>
            </div>

            <div className="flex-1 min-w-0 flex items-center gap-2.5">
              <Avatar entry={entry} size={28} ring={i < 3 ? `${rankColor}70` : 'rgba(59,130,246,0.3)'} />
              {!isYou && entry.username && !entry.username.includes('***') ? (
                <Link href={`/u/${entry.username}`} className="text-xs font-semibold text-navy-50 truncate hover:text-blue-400 transition-colors">
                  {entry.username}
                </Link>
              ) : (
                <span className={`text-xs font-semibold truncate ${isYou ? 'text-blue-300' : 'text-navy-50'}`}>{entry.username || 'Anonymous'}</span>
              )}
            </div>

            {/* Level ring */}
            <div className="w-10 flex justify-center flex-shrink-0">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-300 tabular-nums"
                style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(59,130,246,0.4)' }}
              >
                {entry.level ?? 1}
              </span>
            </div>

            <div className="hidden sm:block w-16 text-right flex-shrink-0">
              <span className="text-xs font-bold text-white tabular-nums">{(entry.xp ?? 0).toLocaleString()}</span>
            </div>

            <div className="hidden md:flex w-20 items-center justify-center gap-1 flex-shrink-0">
              <Icon name="flame" className="w-3 h-3" color={entry.maxStreak > 0 ? '#fb923c' : '#475569'} />
              <span className="text-[11px] text-slate-400 tabular-nums">{entry.maxStreak ?? 0} days</span>
            </div>

            <div className="hidden lg:block w-24 text-center flex-shrink-0">
              <span className="text-xs text-navy-100 tabular-nums">{scope === 'week' ? entry.tasksCompleted7d : entry.totalTasksCompleted}</span>
            </div>

            <div className="hidden sm:block w-20 text-right flex-shrink-0">
              <span className="text-xs font-semibold tabular-nums" style={{ color: entry.totalPushups > 0 ? '#4ade80' : '#475569' }}>
                {entry.totalPushups > 0 ? `${entry.totalPushups} pts` : '—'}
              </span>
            </div>

            <div className="w-9 flex-shrink-0 flex justify-end">
              {isYou && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md text-white" style={{ background: '#2563eb' }}>You</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function Leaderboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('Global');
  const [scope, setScope] = useState('week'); // 'week' | 'all'
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050A14' }}>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const baseEntries = tab === 'Friends' ? friendsLeaderboard : leaderboard;
  const isLoadingActive = tab === 'Friends' ? friendsLoading : loading;
  const activeEntries = scope === 'all'
    ? [...baseEntries].sort((a, b) => (b.totalTasksCompleted - a.totalTasksCompleted) || (b.totalPushups - a.totalPushups))
    : baseEntries;

  const userEntry = activeEntries.find((e) => e.id === user?.id);
  const userRank = userEntry ? activeEntries.indexOf(userEntry) + 1 : null;
  const topPct = userRank ? Math.max(1, Math.round((userRank / activeEntries.length) * 100)) : null;
  const userLeague = getLeague(user?.xp);
  const nextLeague = getNextLeague(user?.xp);
  const xpToNext = nextLeague ? nextLeague.minXP - (user?.xp ?? 0) : 0;
  const leagueProgress = nextLeague
    ? Math.round(((user?.xp ?? 0) - userLeague.minXP) / (nextLeague.minXP - userLeague.minXP) * 100)
    : 100;

  return (
    <Layout streak={streak}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
        {/* ── Left column ── */}
        <div className="space-y-4 min-w-0">
          {/* Header */}
          <div>
            <p className="text-[11px] text-slate-500 mb-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="text-2xl font-bold" style={{ color: '#93c5fd' }}>Leaderboard</h1>
            <p className="text-navy-300 text-sm mt-1">Climb the ranks by completing quests and paying down debt.</p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard icon="trophy" iconColor="#fbbf24" label="Your Rank">
              <p className="text-xl font-extrabold text-white tabular-nums">{userRank ? `#${userRank}` : '—'}</p>
              <p className="text-[11px] text-slate-500 mt-1">{topPct ? `Top ${topPct}%` : 'Complete a quest to rank'}</p>
            </StatCard>

            <StatCard icon="bolt" iconColor="#60a5fa" label="Total XP">
              <p className="text-xl font-extrabold text-white tabular-nums">{(user?.xp ?? 0).toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-1">Level {user?.level ?? 1}</p>
            </StatCard>

            <StatCard icon="trend" iconColor="#4ade80" label="Quests This Week">
              <p className="text-xl font-extrabold tabular-nums text-emerald-400">+{userEntry?.tasksCompleted7d ?? 0}</p>
              <p className="text-[11px] text-slate-500 mt-1">Counts toward your rank</p>
            </StatCard>

            <StatCard icon="shield" iconColor={userLeague.color} label="Current League">
              <p className="text-xl font-extrabold" style={{ color: userLeague.color }}>{userLeague.name}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {nextLeague ? `${xpToNext.toLocaleString()} XP to ${nextLeague.name}` : 'Max league reached'}
              </p>
            </StatCard>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {['Global', 'Friends'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: tab === t ? '#2563eb' : 'rgba(13,31,56,0.7)',
                  border: `1px solid ${tab === t ? 'rgba(59,130,246,0.6)' : 'rgba(59,130,246,0.15)'}`,
                  color: tab === t ? '#fff' : '#64748b',
                  boxShadow: tab === t ? '0 0 12px rgba(37,99,235,0.3)' : 'none',
                }}
              >
                {t}
              </button>
            ))}
            <div className="w-px h-5 mx-1" style={{ background: 'rgba(59,130,246,0.15)' }} />
            {[{ id: 'week', label: 'This Week' }, { id: 'all', label: 'All Time' }].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setScope(id)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: scope === id ? 'rgba(59,130,246,0.18)' : 'rgba(13,31,56,0.7)',
                  border: `1px solid ${scope === id ? 'rgba(59,130,246,0.45)' : 'rgba(59,130,246,0.15)'}`,
                  color: scope === id ? '#60a5fa' : '#64748b',
                }}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-slate-500 hidden sm:block">
              {scope === 'week' ? 'Ranked by quests · rolling 7-day window' : 'Ranked by all-time quests completed'}
            </span>
          </div>

          {isLoadingActive ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeEntries.length === 0 ? (
            <div className="card text-center py-12">
              <div className="flex justify-center mb-3"><Icon name="users" className="w-9 h-9" color="#475569" /></div>
              <p className="text-navy-200 font-medium mb-1">No entries yet</p>
              <p className="text-slate-400 text-sm mb-4">
                {tab === 'Friends' ? 'Add friends to see how you stack up.' : 'Complete quests to appear here.'}
              </p>
              {tab === 'Friends' && <Link href="/friends" className="btn-primary text-sm py-2 px-5 inline-block">Find Friends</Link>}
            </div>
          ) : (
            <>
              <Podium entries={activeEntries} />
              <RankTable entries={activeEntries} userId={user?.id} scope={scope} />
            </>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-4 lg:pt-[76px]">
          {/* Upcoming rewards */}
          <div className="card" style={{ background: nextLeague ? 'rgba(37,99,235,0.06)' : undefined, borderColor: 'rgba(59,130,246,0.25)' }}>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300 mb-3">Upcoming Rewards</h2>
            {nextLeague ? (
              <>
                <div className="flex flex-col items-center text-center py-3 mb-3 rounded-xl" style={{ background: 'rgba(8,21,37,0.7)', border: `1px solid ${nextLeague.border}` }}>
                  <Hexagon size={56} fill={nextLeague.bg} border={nextLeague.color} glow>
                    <Icon name={nextLeague.icon} className="w-5 h-5" color={nextLeague.color} />
                  </Hexagon>
                  <p className="text-sm font-bold text-white mt-2">{nextLeague.name} Reward</p>
                  <p className="text-[10px] text-slate-500">Earn at {nextLeague.minXP.toLocaleString()} XP</p>
                </div>
                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: nextLeague.bg, border: `1px solid ${nextLeague.border}` }}>
                    <Icon name="shield" className="w-3.5 h-3.5" color={nextLeague.color} />
                    <div className="leading-tight">
                      <p className="text-[11px] font-bold" style={{ color: nextLeague.color }}>{nextLeague.name} Tier Unlock</p>
                      <p className="text-[9px] text-slate-500">{xpToNext.toLocaleString()} XP needed</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.18)' }}>
                    <Icon name="sparkle" className="w-3.5 h-3.5" color="#fbbf24" />
                    <div className="leading-tight">
                      <p className="text-[11px] font-bold text-yellow-400">Exclusive Badge</p>
                      <p className="text-[9px] text-slate-500">Reach {nextLeague.name}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500">Your progress to reward</span>
                  <span className="text-[10px] font-bold text-blue-300 tabular-nums">{leagueProgress}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${leagueProgress}%`, background: 'linear-gradient(90deg,#2563eb,#60a5fa)', boxShadow: '0 0 8px rgba(59,130,246,0.4)' }} />
                </div>
              </>
            ) : (
              <p className="text-xs text-green-400 font-medium flex items-center gap-1">You've unlocked everything! <Icon name="trophy" className="w-3.5 h-3.5" color="#4ade80" /></p>
            )}
          </div>

          {/* League progress */}
          <div className="card">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300 mb-3">League Progress</h2>
            <div className="flex flex-col items-center text-center mb-3">
              <Hexagon size={64} fill={userLeague.bg} border={userLeague.color} glow>
                <Icon name={userLeague.icon} className="w-6 h-6" color={userLeague.color} />
              </Hexagon>
              <p className="text-base font-bold mt-2" style={{ color: userLeague.color }}>{userLeague.name}</p>
              <p className="text-[11px] text-slate-500">{(user?.xp ?? 0).toLocaleString()} XP</p>
            </div>
            {nextLeague ? (
              <>
                <div className="relative w-full h-1.5 rounded-full mb-1.5" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${leagueProgress}%`, background: `linear-gradient(90deg, ${userLeague.color}, ${nextLeague.color})` }} />
                  <div className="absolute -top-[3px] w-3 h-3 rounded-full" style={{ left: `calc(${leagueProgress}% - 6px)`, background: '#fff', border: `2px solid ${nextLeague.color}`, boxShadow: `0 0 8px ${nextLeague.color}` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2">
                  <span style={{ color: userLeague.color }}>{userLeague.name}</span>
                  <span style={{ color: nextLeague.color }}>{nextLeague.name}</span>
                </div>
                <p className="text-[11px] text-slate-400 text-center">Keep climbing to reach {nextLeague.name} — {xpToNext.toLocaleString()} XP away.</p>
              </>
            ) : (
              <p className="text-xs text-yellow-400 font-medium flex items-center justify-center gap-1">Max league reached! <Icon name="trophy" className="w-3.5 h-3.5" color="#fbbf24" /></p>
            )}
          </div>

          {/* How ranking works */}
          <div className="card">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300 mb-3">How Ranking Works</h2>
            <div className="space-y-2.5">
              {[
                { icon: 'check',  color: '#4ade80', title: 'Complete Quests', desc: 'Rank is based on quests completed in the last 7 days.' },
                { icon: 'coins',  color: '#fbbf24', title: 'Stay Debt Free',  desc: 'Ties favor players carrying less debt.' },
                { icon: 'bolt',   color: '#60a5fa', title: 'Climb Leagues',   desc: 'Total XP determines your league tier.' },
              ].map(({ icon, color, title, desc }) => (
                <div key={title} className="flex items-start gap-2.5">
                  <IconTile name={icon} color={color} bg={`${color}1a`} border={`${color}40`} />
                  <div className="leading-tight">
                    <p className="text-xs font-bold text-navy-100">{title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
