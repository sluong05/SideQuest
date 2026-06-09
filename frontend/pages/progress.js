import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getSessions, getStreak, getTasks } from '../lib/api';

const MILESTONES = [3, 7, 14, 30, 60, 100];

const CATEGORY_ICONS = {
  fitness: '💪', learning: '📚', focus: '🎯',
  productivity: '⚡', wellness: '🧘', chores: '🏠', other: '✦',
};

function buildChartData(sessions) {
  const DAYS = 14;
  const buckets = [];
  const now = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    buckets.push({ date: d, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), amount: 0 });
  }
  for (const s of sessions) {
    const sd = new Date(s.date); sd.setHours(0, 0, 0, 0);
    const bucket = buckets.find((b) => b.date.getTime() === sd.getTime());
    if (bucket) bucket.amount += s.pushupsCompleted;
  }
  return buckets;
}

function ActivityChart({ sessions }) {
  const data = buildChartData(sessions);
  const maxVal = Math.max(...data.map((d) => d.amount), 1);
  const W = 560, H = 110, padL = 4, padR = 4, padTop = 8, padBot = 28;
  const chartW = W - padL - padR;
  const chartH = H - padTop - padBot;
  const barW = chartW / data.length;
  const gap = 3;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
      {data.map((d, i) => {
        const barH = d.amount > 0 ? Math.max(4, (d.amount / maxVal) * chartH) : 2;
        const x = padL + i * barW + gap / 2;
        const y = padTop + chartH - barH;
        const w = barW - gap;
        const isToday = i === data.length - 1;
        const showLabel = i % 2 === 0 || isToday;
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={d.amount > 0 ? barH : 2} rx={2} fill={d.amount > 0 ? (isToday ? '#3b82f6' : '#1d4ed8') : 'rgba(59,130,246,0.1)'} />
            {d.amount > 0 && (
              <text x={x + w / 2} y={y - 2} textAnchor="middle" fontSize={8} fill={isToday ? '#60a5fa' : '#3b82f6'}>{d.amount}</text>
            )}
            {showLabel && (
              <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize={8} fill="#475569">{d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function LevelProgression({ xp, level }) {
  const xpIntoLevel = xp % 500;
  const xpForNext = 500;
  const pct = Math.round((xpIntoLevel / xpForNext) * 100);
  const levels = Array.from({ length: 7 }, (_, i) => level - 2 + i).filter((l) => l >= 1);

  return (
    <div>
      {/* Level track */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-2">
        {levels.map((l, i) => {
          const isCurrent = l === level;
          const isPast = l < level;
          return (
            <div key={l} className="flex items-center flex-shrink-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                style={{
                  background: isCurrent ? '#2563eb' : isPast ? 'rgba(59,130,246,0.2)' : 'rgba(13,31,56,0.6)',
                  border: `2px solid ${isCurrent ? '#60a5fa' : isPast ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.15)'}`,
                  color: isCurrent ? '#fff' : isPast ? '#60a5fa' : '#475569',
                  boxShadow: isCurrent ? '0 0 16px rgba(59,130,246,0.5)' : 'none',
                  transform: isCurrent ? 'scale(1.15)' : 'scale(1)',
                }}
              >
                {l}
              </div>
              {i < levels.length - 1 && (
                <div className="w-6 h-0.5 mx-0.5 flex-shrink-0" style={{ background: l < level ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.15)' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* XP bar */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-navy-400">Level {level}</span>
        <span className="text-xs text-navy-400">{xpIntoLevel} / {xpForNext} XP → Level {level + 1}</span>
      </div>
      <div className="w-full h-2.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)' }}>
        <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #2563eb, #60a5fa)', boxShadow: '0 0 8px rgba(59,130,246,0.4)' }} />
      </div>
      <p className="text-xs text-navy-400 mt-1.5">{xpForNext - xpIntoLevel} XP to next level</p>
    </div>
  );
}

function StreakCalendar({ sessions }) {
  const WEEKS = 6;
  const DAYS = 7;
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const activeDays = new Set(
    sessions.map((s) => {
      const d = new Date(s.date);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );

  const cells = [];
  const today = new Date();
  const startDay = new Date(today);
  startDay.setDate(today.getDate() - (WEEKS * DAYS - 1));

  for (let i = 0; i < WEEKS * DAYS; i++) {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const isToday = d.toDateString() === today.toDateString();
    cells.push({ date: d, active: activeDays.has(key), isToday });
  }

  const weeks = [];
  for (let w = 0; w < WEEKS; w++) {
    weeks.push(cells.slice(w * DAYS, w * DAYS + DAYS));
  }

  return (
    <div>
      <div className="flex gap-1.5 mb-1.5">
        {dayLabels.map((d, i) => (
          <div key={i} className="w-7 text-center text-[10px] text-navy-500 font-medium">{d}</div>
        ))}
      </div>
      <div className="space-y-1.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex gap-1.5">
            {week.map((cell, di) => (
              <div
                key={di}
                className="w-7 h-7 rounded-md transition-all"
                style={{
                  background: cell.active
                    ? 'rgba(59,130,246,0.7)'
                    : cell.isToday
                    ? 'rgba(59,130,246,0.15)'
                    : 'rgba(13,31,56,0.5)',
                  border: cell.isToday ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(59,130,246,0.06)',
                  boxShadow: cell.active ? '0 0 6px rgba(59,130,246,0.3)' : 'none',
                }}
                title={cell.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(13,31,56,0.5)', border: '1px solid rgba(59,130,246,0.1)' }} />
          <span className="text-[10px] text-navy-500">No activity</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(59,130,246,0.7)' }} />
          <span className="text-[10px] text-navy-500">Active day</span>
        </div>
      </div>
    </div>
  );
}

function CategoryBreakdown({ tasks }) {
  const cats = ['fitness', 'learning', 'focus', 'productivity', 'wellness', 'chores', 'other'];
  const rows = cats
    .map((cat) => {
      const catTasks = tasks.filter((t) => t.category === cat);
      if (catTasks.length === 0) return null;
      const completed = catTasks.filter((t) => t.completed).length;
      const rate = catTasks.length > 0 ? Math.round((completed / catTasks.length) * 100) : 0;
      const xp = catTasks.filter((t) => t.completed).reduce((s, t) => s + (t.xpReward ?? 50), 0);
      return { cat, total: catTasks.length, completed, rate, xp };
    })
    .filter(Boolean);

  if (rows.length === 0) return <p className="text-xs text-navy-400 py-4 text-center">No quest data yet.</p>;

  return (
    <div className="space-y-2">
      {rows.map(({ cat, total, completed, rate, xp }) => (
        <div key={cat} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(13,31,56,0.4)', border: '1px solid rgba(59,130,246,0.08)' }}>
          <span className="text-base flex-shrink-0">{CATEGORY_ICONS[cat] ?? '✦'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-navy-100 capitalize">{cat}</p>
              <span className="text-xs text-navy-400">{completed}/{total}</span>
            </div>
            <div className="w-full h-1 rounded-full" style={{ background: 'rgba(59,130,246,0.1)' }}>
              <div className="h-1 rounded-full" style={{ width: `${rate}%`, background: rate === 100 ? '#34d399' : '#3b82f6' }} />
            </div>
          </div>
          <span className="text-xs font-bold text-yellow-400 flex-shrink-0">{xp} XP</span>
        </div>
      ))}
    </div>
  );
}

export default function Progress() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [sessions, setSessions] = useState([]);
  const [allTimePaid, setAllTimePaid] = useState(0);
  const [streak, setStreak] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    Promise.all([getSessions(), getStreak(), getTasks()])
      .then(([sRes, stRes, tRes]) => {
        setSessions(sRes.data.sessions);
        setAllTimePaid(sRes.data.allTimePushups ?? 0);
        setStreak(stRes.data.streak);
        setTasks(tRes.data.tasks ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const completedCount = tasks.filter((t) => t.completed).length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const achieved = MILESTONES.filter((m) => m <= streak);
  const next = MILESTONES.find((m) => m > streak) ?? null;
  const xp = user?.xp ?? 0;
  const level = user?.level ?? 1;

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Layout streak={streak}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-50">Your Journey</h1>
        <p className="text-navy-300 text-sm mt-1">Consistent progress, your future self is proud of you.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              { label: 'Level',          value: `Lv ${level}`,     color: '#c084fc' },
              { label: 'Total XP',       value: xp.toLocaleString(), color: '#fbbf24' },
              { label: 'Streak',         value: `${streak}d`,      color: '#fb923c' },
              { label: 'Best Streak',    value: `${user?.maxStreak ?? 0}d`, color: '#f97316' },
              { label: 'Quests Done',    value: user?.totalTasksCompleted ?? 0, color: '#34d399' },
              { label: 'Debt Paid',      value: allTimePaid,        color: '#60a5fa' },
              { label: 'Completion',     value: `${completionRate}%`, color: '#818cf8' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card text-center py-3">
                <p className="text-lg font-bold tabular-nums" style={{ color }}>{value}</p>
                <p className="text-[10px] text-navy-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Level Progression */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-navy-50">Level Progression</h2>
                <span className="text-xs text-purple-400 font-bold">Lv {level}</span>
              </div>
              <LevelProgression xp={xp} level={level} />
            </div>

            {/* Streak Tracker */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-navy-50">Weekly Streak Tracker</h2>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">🔥</span>
                  <span className="text-lg font-bold text-orange-400">{streak}</span>
                </div>
              </div>
              <StreakCalendar sessions={sessions} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Activity chart */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-navy-50">Progress Over Time</h2>
                  <p className="text-xs text-navy-400 mt-0.5">Activity per day — last 14 days</p>
                </div>
                <span className="text-xs text-blue-400">{sessions.length} sessions</span>
              </div>
              {sessions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-3xl mb-2">📊</p>
                  <p className="text-navy-300 text-sm">Pay off some debt to see your chart.</p>
                </div>
              ) : (
                <ActivityChart sessions={sessions} />
              )}
            </div>

            {/* Category breakdown */}
            <div className="card">
              <h2 className="text-sm font-bold text-navy-50 mb-4">Quests by Category</h2>
              <CategoryBreakdown tasks={tasks} />
            </div>
          </div>

          {/* Streak milestones */}
          <div className="card">
            <h2 className="text-sm font-bold text-navy-50 mb-4">🔥 Streak Milestones</h2>
            <div className="flex items-center gap-6 mb-4">
              <div className="text-center">
                <p className="text-4xl font-bold text-orange-400">{streak}</p>
                <p className="text-xs text-navy-400 mt-1">current streak</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-bold text-navy-300">{user?.maxStreak ?? 0}</p>
                <p className="text-xs text-navy-400 mt-1">best streak</p>
              </div>
              {next && (
                <div className="flex-1">
                  <p className="text-xs text-navy-300 mb-2">
                    <span className="text-orange-400 font-bold">{next - streak}</span> days until {next}-day badge
                  </p>
                  <div className="w-full h-2 rounded-full" style={{ background: 'rgba(234,88,12,0.1)' }}>
                    <div className="h-2 rounded-full transition-all" style={{ width: `${(streak / next) * 100}%`, background: 'linear-gradient(90deg,#ea580c,#fb923c)' }} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {MILESTONES.map((m) => {
                const earned = m <= streak;
                return (
                  <div
                    key={m}
                    className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold"
                    style={{
                      background: earned ? 'rgba(234,88,12,0.15)' : 'rgba(13,31,56,0.6)',
                      border: `1px solid ${earned ? 'rgba(234,88,12,0.35)' : 'rgba(59,130,246,0.1)'}`,
                      color: earned ? '#fb923c' : '#475569',
                    }}
                  >
                    <span className="text-lg">{earned ? '🔥' : '🔒'}</span>
                    <span>{m}d</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Member since */}
          <div className="card text-center py-5">
            <p className="text-navy-300 text-sm">
              Member since{' '}
              <span className="text-navy-100 font-semibold">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
              </span>
            </p>
            <p className="text-xs text-navy-500 mt-1">Keep questing. Your future self is watching.</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
