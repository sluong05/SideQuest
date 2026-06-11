import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getSessions, getStreak, getTasks } from '../lib/api';
import { CategoryIcon } from '../components/Icons';

const MILESTONES = [3, 7, 14, 30, 60, 100];
const XP_PER_LEVEL = 500;

const CATEGORY_META = {
  fitness:      { tagline: 'Push your limits' },
  learning:     { tagline: 'Feed your brain' },
  focus:        { tagline: 'Sharpen your mind' },
  productivity: { tagline: 'Get things done' },
  wellness:     { tagline: 'Mind & body balance' },
  chores:       { tagline: 'Keep life in order' },
  other:        { tagline: 'Everything else' },
};

function tierName(level) {
  if (level >= 25) return 'Legend';
  if (level >= 20) return 'Elite';
  if (level >= 15) return 'Master';
  if (level >= 10) return 'High';
  if (level >= 5) return 'Adept';
  return 'Novice';
}

/* ── date helpers ─────────────────────────────────────────────────────────── */

function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); // Monday
  return date;
}

function dayKey(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/* ── small bits ───────────────────────────────────────────────────────────── */

function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">{children}</h2>
      {right}
    </div>
  );
}

function PanelLink({ href, children }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors">
      {children}
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

const ICON_PATHS = {
  bolt:   <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,
  shield: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 2.8v5.4c0 4.4-2.9 7.8-7 9.3-4.1-1.5-7-4.9-7-9.3V5.8L12 3z" />,
  flame:  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c.7 2.4 2 4 3.5 5.6A6.3 6.3 0 0117.5 13a5.5 5.5 0 11-11 0c0-1.2.4-2.4 1.1-3.4.5 1 1.1 1.6 1.9 2.1C9.5 8.6 10.6 5.6 12 3z" />,
  trophy: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8v4a4 4 0 11-8 0V4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H5.5A.5.5 0 005 5.5 3.5 3.5 0 008.5 9M16 5h2.5a.5.5 0 01.5.5A3.5 3.5 0 0115.5 9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v3m-3 5h6m-5-5h4l.5 5h-5l.5-5z" />
    </>
  ),
  flag:   <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4m0 0h11.5L14 8l2.5 4H5" />,
  coins: (
    <>
      <ellipse cx="12" cy="6.5" rx="6.5" ry="2.8" />
      <path strokeLinecap="round" d="M5.5 6.5v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-5" />
      <path strokeLinecap="round" d="M5.5 11.5v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-5" />
    </>
  ),
  check:  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />,
  lock:   <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 118 0v3m-9 0h10a1 1 0 011 1v7a1 1 0 01-1 1H7a1 1 0 01-1-1v-7a1 1 0 011-1z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  gem:    <path strokeLinecap="round" strokeLinejoin="round" d="M7 4h10l4 5-9 11L3 9l4-5zm-4 5h18M10 4l-2 5 4 11 4-11-2-5" />,
};

function Icon({ name, className = 'w-4 h-4', color = '#60a5fa' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={1.8}>
      {ICON_PATHS[name]}
    </svg>
  );
}

function IconTile({ name, color = '#60a5fa', bg = 'rgba(37,99,235,0.12)', border = 'rgba(59,130,246,0.25)' }) {
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bg, border: `1px solid ${border}` }}>
      <Icon name={name} color={color} />
    </div>
  );
}

function Hexagon({ size = 64, fill = 'rgba(37,99,235,0.15)', border = '#3b82f6', glow = false, children }) {
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

/* ── top stat cards ───────────────────────────────────────────────────────── */

function Delta({ value, suffix = '', positiveText }) {
  if (value > 0) return <p className="text-[11px] font-semibold text-emerald-400 mt-1">+{value}{suffix} {positiveText ?? 'vs last week'}</p>;
  if (value < 0) return <p className="text-[11px] font-semibold text-slate-500 mt-1">{value}{suffix} vs last week</p>;
  return <p className="text-[11px] text-slate-500 mt-1">— vs last week</p>;
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

function CompletionRing({ pct, size = 52 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(59,130,246,0.12)" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3b82f6" strokeWidth={5} strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          style={{ filter: 'drop-shadow(0 0 4px rgba(59,130,246,0.6))', transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-blue-300">{pct}%</span>
    </div>
  );
}

/* ── level progression panel ──────────────────────────────────────────────── */

function LevelProgression({ xp, level }) {
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const xpToNext = XP_PER_LEVEL - xpIntoLevel;
  const nextThreshold = (Math.floor(xp / XP_PER_LEVEL) + 1) * XP_PER_LEVEL;

  const nodes = [
    { lv: level - 1, state: 'past' },
    { lv: level,     state: 'current', top: `${xp.toLocaleString()} XP`, bottom: 'Current' },
    { lv: level + 1, state: 'next',    top: `${nextThreshold.toLocaleString()} XP`, bottom: 'Next Level' },
  ].filter((n) => n.lv >= 1);

  return (
    <div className="card h-full flex flex-col">
      <SectionTitle>Level Progression</SectionTitle>

      <div className="flex items-center gap-5 flex-1">
        {/* Hex level badge */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <Hexagon size={72} glow>
            <span className="text-xl font-extrabold text-white">{level}</span>
            <span className="text-[9px] font-bold uppercase tracking-wide text-blue-300">{tierName(level)}</span>
          </Hexagon>
          <div className="text-center leading-tight">
            <p className="text-[11px] font-bold text-navy-100">{xpToNext} XP</p>
            <p className="text-[10px] text-slate-500">to lvl {level + 1}</p>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            {nodes.map((n, i) => (
              <div key={n.lv} className={`flex items-center ${i < nodes.length - 1 ? 'flex-1' : ''}`}>
                <div className="flex flex-col items-center gap-1.5 relative">
                  <span className="text-[10px] text-slate-400 h-3.5 whitespace-nowrap">{n.top ?? ''}</span>
                  <div
                    className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
                    style={{
                      width: n.state === 'current' ? 44 : 34,
                      height: n.state === 'current' ? 44 : 34,
                      fontSize: n.state === 'current' ? 15 : 12,
                      background: n.state === 'current' ? '#2563eb' : n.state === 'past' ? 'rgba(37,99,235,0.2)' : 'rgba(13,31,56,0.7)',
                      border: `2px solid ${n.state === 'current' ? '#60a5fa' : n.state === 'past' ? 'rgba(59,130,246,0.45)' : 'rgba(59,130,246,0.18)'}`,
                      color: n.state === 'current' ? '#fff' : n.state === 'past' ? '#60a5fa' : '#475569',
                      boxShadow: n.state === 'current' ? '0 0 18px rgba(59,130,246,0.6)' : 'none',
                    }}
                  >
                    {n.lv}
                  </div>
                  <span className={`text-[10px] h-3.5 whitespace-nowrap ${n.state === 'current' ? 'text-blue-300 font-semibold' : 'text-slate-500'}`}>{n.bottom ?? ''}</span>
                </div>
                {i < nodes.length - 1 && (
                  <div className="flex-1 h-0.5 mx-2 mt-0 rounded-full" style={{ background: n.state !== 'next' && nodes[i + 1].state !== 'next' ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.15)' }} />
                )}
              </div>
            ))}
          </div>

          {/* XP bar */}
          <div className="mt-4">
            <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)' }}>
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${Math.round((xpIntoLevel / XP_PER_LEVEL) * 100)}%`, background: 'linear-gradient(90deg, #2563eb, #60a5fa)', boxShadow: '0 0 8px rgba(59,130,246,0.4)' }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 text-right">
        <PanelLink href="/profile">View all levels</PanelLink>
      </div>
    </div>
  );
}

/* ── streak milestone tracker ─────────────────────────────────────────────── */

function StreakMilestoneTracker({ streak }) {
  const next = MILESTONES.find((m) => m > streak) ?? null;
  const visible = MILESTONES.slice(0, 4);

  return (
    <div className="card h-full flex flex-col">
      <SectionTitle>Streak Milestone Tracker</SectionTitle>

      <div className="flex items-center gap-5 flex-1">
        {/* Flame hex */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <Hexagon size={72} fill="rgba(234,88,12,0.15)" border="#f97316" glow>
            <Icon name="flame" className="w-5 h-5" color="#fb923c" />
            <span className="text-sm font-extrabold text-white mt-0.5">{streak}</span>
            <span className="text-[9px] font-semibold text-orange-300">days</span>
          </Hexagon>
          <p className="text-[10px] text-slate-500 text-center leading-tight">Current Streak</p>
        </div>

        {/* Milestone trail */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            {visible.map((m, i) => {
              const done = streak >= m;
              const isNext = m === next;
              return (
                <div key={m} className={`flex items-center ${i < visible.length - 1 ? 'flex-1' : ''}`}>
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: done ? 'rgba(37,99,235,0.25)' : 'rgba(13,31,56,0.7)',
                        border: `2px solid ${done ? '#3b82f6' : isNext ? 'rgba(59,130,246,0.45)' : 'rgba(59,130,246,0.15)'}`,
                        boxShadow: done ? '0 0 10px rgba(59,130,246,0.35)' : 'none',
                      }}
                    >
                      {done
                        ? <Icon name="check" className="w-3.5 h-3.5" color="#60a5fa" />
                        : <span className={`text-[11px] font-bold ${isNext ? 'text-blue-300' : 'text-slate-600'}`}>{m}</span>}
                    </div>
                    <span className="text-[9px] text-slate-500">{m}d</span>
                  </div>
                  {i < visible.length - 1 && (
                    <div className="flex-1 h-0.5 mx-1.5 -mt-3.5 rounded-full" style={{ background: streak >= visible[i + 1] ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.15)' }} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            {next ? (
              <>
                <p className="text-xs text-navy-100 font-semibold">Next milestone: {next} day streak</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Keep it going, Quester!</p>
              </>
            ) : (
              <p className="text-xs text-navy-100 font-semibold">All milestones conquered. Legend.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── weekly activity heatmap ──────────────────────────────────────────────── */

function WeeklyActivity({ activityByDay }) {
  const WEEKS = 5;
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const thisWeekStart = startOfWeek(new Date());

  const counts = [];
  for (let w = 0; w < WEEKS; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(thisWeekStart);
      date.setDate(thisWeekStart.getDate() - (WEEKS - 1 - w) * 7 + d);
      row.push({ date, count: activityByDay.get(dayKey(date)) ?? 0, future: date > today });
    }
    counts.push(row);
  }

  const max = Math.max(1, ...counts.flat().map((c) => c.count));
  const shade = (count, future) => {
    if (future) return 'rgba(13,31,56,0.35)';
    if (count === 0) return 'rgba(13,31,56,0.7)';
    const t = count / max;
    if (t <= 0.34) return 'rgba(37,99,235,0.3)';
    if (t <= 0.67) return 'rgba(37,99,235,0.55)';
    return '#3b82f6';
  };

  return (
    <div className="card h-full flex flex-col">
      <SectionTitle>Weekly Activity</SectionTitle>

      <div className="flex-1">
        {/* Day header */}
        <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
          <span />
          {dayLabels.map((d) => (
            <span key={d} className="text-center text-[9px] font-semibold text-slate-500">{d}</span>
          ))}
        </div>
        {counts.map((row, w) => (
          <div key={w} className="grid gap-1 mb-1" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
            <span className="text-[9px] text-slate-500 flex items-center">Week {w + 1}</span>
            {row.map((cell, d) => (
              <div
                key={d}
                className="rounded-[4px] aspect-square w-full"
                style={{
                  background: shade(cell.count, cell.future),
                  border: '1px solid rgba(59,130,246,0.08)',
                  boxShadow: !cell.future && cell.count / max > 0.67 ? '0 0 6px rgba(59,130,246,0.4)' : 'none',
                }}
                title={`${cell.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${cell.count} ${cell.count === 1 ? 'activity' : 'activities'}`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-slate-500 mr-0.5">Level</span>
          {['rgba(13,31,56,0.7)', 'rgba(37,99,235,0.3)', 'rgba(37,99,235,0.55)', '#3b82f6'].map((bg, i) => (
            <div key={i} className="w-3 h-3 rounded-[3px]" style={{ background: bg, border: '1px solid rgba(59,130,246,0.1)' }} />
          ))}
        </div>
        <span className="text-[9px] text-slate-500">daily quests completed</span>
      </div>
    </div>
  );
}

/* ── quests by category ───────────────────────────────────────────────────── */

function QuestsByCategory({ tasks }) {
  const rows = Object.keys(CATEGORY_META)
    .map((cat) => {
      const catTasks = tasks.filter((t) => (t.category ?? 'other') === cat);
      if (catTasks.length === 0) return null;
      const completed = catTasks.filter((t) => t.completed).length;
      const rate = Math.round((completed / catTasks.length) * 100);
      const xp = catTasks.filter((t) => t.completed).reduce((s, t) => s + (t.xpReward ?? 50), 0);
      return { cat, total: catTasks.length, completed, rate, xp };
    })
    .filter(Boolean)
    .sort((a, b) => b.xp - a.xp);

  return (
    <div className="card h-full flex flex-col">
      <SectionTitle>Quests by Category</SectionTitle>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center flex-1">No quest data yet. Start a quest to see your breakdown.</p>
      ) : (
        <>
          {/* Column headers */}
          <div className="flex items-center gap-3 px-1 mb-2">
            <span className="flex-1" />
            <span className="w-12 text-right text-[9px] font-semibold uppercase tracking-wide text-slate-500">Completed</span>
            <span className="w-[88px] text-right text-[9px] font-semibold uppercase tracking-wide text-slate-500">Completion Rate</span>
            <span className="w-14 text-right text-[9px] font-semibold uppercase tracking-wide text-slate-500">XP Earned</span>
          </div>

          <div className="space-y-1.5 flex-1">
            {rows.map(({ cat, total, completed, rate, xp }) => (
              <div key={cat} className="flex items-center gap-3 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(13,31,56,0.4)', border: '1px solid rgba(59,130,246,0.08)' }}>
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <CategoryIcon category={cat} className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="text-xs font-semibold text-navy-100 capitalize truncate">{cat}</p>
                    <p className="text-[9px] text-slate-500 truncate">{CATEGORY_META[cat].tagline}</p>
                  </div>
                </div>
                <span className="w-12 text-right text-[11px] font-semibold text-navy-100 tabular-nums">{completed} / {total}</span>
                <div className="w-[88px] flex items-center gap-1.5 justify-end">
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)' }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${rate}%`, background: 'linear-gradient(90deg,#1d4ed8,#60a5fa)' }} />
                  </div>
                  <span className="text-[10px] text-slate-400 tabular-nums w-7 text-right">{rate}%</span>
                </div>
                <span className="w-14 text-right text-[11px] font-bold text-blue-400 tabular-nums">+{xp} XP</span>
              </div>
            ))}
          </div>

          <div className="mt-3 text-right">
            <PanelLink href="/quests">View category insights</PanelLink>
          </div>
        </>
      )}
    </div>
  );
}

/* ── progress over time (tri-series line chart) ───────────────────────────── */

function ProgressOverTime({ weekData }) {
  const W = 460, H = 190, padL = 34, padR = 34, padTop = 10, padBot = 22;
  const chartW = W - padL - padR;
  const chartH = H - padTop - padBot;

  const xpMax = Math.max(50, ...weekData.map((d) => d.xp));
  const debtMax = Math.max(10, ...weekData.map((d) => d.debt));
  const questMax = Math.max(1, ...weekData.map((d) => d.quests));

  const x = (i) => padL + (i / (weekData.length - 1)) * chartW;
  const yXp = (v) => padTop + chartH - (v / xpMax) * chartH;
  const yDebt = (v) => padTop + chartH - (v / debtMax) * chartH;
  const yQuest = (v) => padTop + chartH - (v / questMax) * chartH * 0.85;

  const line = (yFn, key) => weekData.map((d, i) => `${x(i)},${yFn(d[key])}`).join(' ');

  const series = [
    { key: 'xp',     yFn: yXp,    color: '#3b82f6', label: 'XP Earned' },
    { key: 'quests', yFn: yQuest, color: '#22d3ee', label: 'Quests Completed' },
    { key: 'debt',   yFn: yDebt,  color: '#f59e0b', label: 'Debt Paid' },
  ];

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-start justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">Progress Over Time</h2>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-300" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.2)' }}>
          This Week
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 5px ${s.color}` }} />
            <span className="text-[10px] text-slate-400">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 flex items-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
          {/* Grid + axes labels */}
          {gridLines.map((t) => {
            const y = padTop + chartH - t * chartH;
            return (
              <g key={t}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(59,130,246,0.08)" strokeDasharray="3 4" />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={7.5} fill="#475569">{Math.round(t * xpMax)}</text>
                <text x={W - padR + 6} y={y + 3} textAnchor="start" fontSize={7.5} fill="#475569">{Math.round(t * debtMax)}</text>
              </g>
            );
          })}

          {/* Series lines */}
          {series.map((s) => (
            <g key={s.key}>
              <polyline
                points={line(s.yFn, s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 3px ${s.color}66)` }}
              />
              {weekData.map((d, i) => (
                <circle key={i} cx={x(i)} cy={s.yFn(d[s.key])} r={2.4} fill="#081525" stroke={s.color} strokeWidth={1.5} />
              ))}
            </g>
          ))}

          {/* X labels */}
          {weekData.map((d, i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={8} fill="#475569">{d.label}</text>
          ))}
        </svg>
      </div>

      <div className="mt-2 text-right">
        <PanelLink href="/debt">View full analytics</PanelLink>
      </div>
    </div>
  );
}

/* ── recent achievements ──────────────────────────────────────────────────── */

function buildAchievements({ maxStreak, allTimePaid, totalCompleted, tasks }) {
  const list = [];

  [...MILESTONES].reverse().forEach((m) => {
    if (maxStreak >= m) {
      list.push({
        id: `streak-${m}`, icon: 'flame', color: '#fb923c', bg: 'rgba(234,88,12,0.14)', border: 'rgba(234,88,12,0.35)',
        title: `${m}-Day Streak`, desc: `Complete quests ${m} days in a row`, xp: m * 25,
      });
    }
  });

  if (allTimePaid >= 100) {
    list.push({
      id: 'debt-crusher', icon: 'coins', color: '#fbbf24', bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.3)',
      title: 'Debt Crusher', desc: 'Pay down 100 debt', xp: 150,
    });
  }

  const focusDone = tasks.filter((t) => t.category === 'focus' && t.completed).length;
  if (focusDone >= 5) {
    list.push({
      id: 'focus-hero', icon: 'target', color: '#60a5fa', bg: 'rgba(37,99,235,0.14)', border: 'rgba(59,130,246,0.35)',
      title: 'Focus Hero', desc: 'Complete 5 focus quests in a week', xp: 100,
    });
  }

  if (totalCompleted >= 20) {
    list.push({
      id: 'consistency', icon: 'gem', color: '#c084fc', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)',
      title: 'Consistency Badge', desc: 'Complete 20 quests in a month', xp: 50,
    });
  }

  return list.slice(0, 4);
}

function RecentAchievements({ achievements }) {
  return (
    <div className="card h-full flex flex-col">
      <SectionTitle right={<PanelLink href="/profile">View all</PanelLink>}>Recent Achievements</SectionTitle>

      {achievements.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
          <Icon name="trophy" className="w-7 h-7 mb-2" color="#475569" />
          <p className="text-xs text-slate-400">No achievements yet.</p>
          <p className="text-[10px] text-slate-500 mt-1">Keep questing — your first badge is close.</p>
        </div>
      ) : (
        <div className="space-y-1.5 flex-1">
          {achievements.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(13,31,56,0.4)', border: '1px solid rgba(59,130,246,0.08)' }}>
              <Hexagon size={38} fill={a.bg} border={a.border}>
                <Icon name={a.icon} className="w-4 h-4" color={a.color} />
              </Hexagon>
              <div className="flex-1 min-w-0 leading-tight">
                <p className="text-xs font-semibold text-navy-100 truncate">{a.title}</p>
                <p className="text-[10px] text-slate-500 truncate">{a.desc}</p>
              </div>
              <span className="text-[11px] font-bold text-emerald-400 flex-shrink-0 tabular-nums">+{a.xp} XP</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

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

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050A14' }}>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ── derived stats ── */
  const xp = user.xp ?? 0;
  const level = user.level ?? 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const maxStreak = user.maxStreak ?? 0;
  const totalCompleted = user.totalTasksCompleted ?? 0;

  const now = new Date();
  const weekStart = startOfWeek(now);
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(weekStart.getDate() - 7);

  const completedThisWeek = tasks.filter((t) => t.completedAt && new Date(t.completedAt) >= weekStart);
  const completedLastWeek = tasks.filter((t) => t.completedAt && new Date(t.completedAt) >= lastWeekStart && new Date(t.completedAt) < weekStart);
  const xpThisWeek = completedThisWeek.reduce((s, t) => s + (t.xpReward ?? 50), 0);
  const questsDelta = completedThisWeek.length - completedLastWeek.length;

  const paidThisWeek = sessions.filter((s) => new Date(s.date) >= weekStart).reduce((s, x2) => s + x2.pushupsCompleted, 0);
  const paidLastWeek = sessions.filter((s) => new Date(s.date) >= lastWeekStart && new Date(s.date) < weekStart).reduce((s, x2) => s + x2.pushupsCompleted, 0);

  const completedCount = tasks.filter((t) => t.completed).length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  /* activity map: quests completed + workout sessions per day */
  const activityByDay = new Map();
  for (const t of tasks) {
    if (!t.completedAt) continue;
    const k = dayKey(t.completedAt);
    activityByDay.set(k, (activityByDay.get(k) ?? 0) + 1);
  }
  for (const s of sessions) {
    if (s.pushupsCompleted > 0) {
      const k = dayKey(s.date);
      activityByDay.set(k, (activityByDay.get(k) ?? 0) + 1);
    }
  }

  /* this week's chart series (Mon–Sun) */
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekData = dayLabels.map((label, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    const k = dayKey(d);
    const dayTasks = completedThisWeek.filter((t) => dayKey(t.completedAt) === k);
    const debt = sessions.filter((s) => dayKey(s.date) === k).reduce((s, x2) => s + x2.pushupsCompleted, 0);
    return { label, xp: dayTasks.reduce((s, t) => s + (t.xpReward ?? 50), 0), quests: dayTasks.length, debt };
  });

  const achievements = buildAchievements({ maxStreak, allTimePaid, totalCompleted, tasks });

  return (
    <Layout streak={streak}>
      {/* Header */}
      <div className="mb-6">
        <p className="text-[11px] text-slate-500 mb-1">
          {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-2xl font-bold" style={{ color: '#93c5fd' }}>Your Journey</h1>
        <p className="text-navy-300 text-sm mt-1">Consistent actions. Real progress. Unstoppable you.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Stat cards row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <StatCard icon="bolt" iconColor="#60a5fa" label="Current XP">
              <p className="text-xl font-extrabold text-white tabular-nums">{xp.toLocaleString()}</p>
              <Delta value={xpThisWeek} suffix=" XP" positiveText="this week" />
            </StatCard>

            <StatCard icon="shield" iconColor="#60a5fa" label="Level">
              <div className="flex items-center gap-2">
                <p className="text-xl font-extrabold text-white tabular-nums">{level}</p>
                <span className="badge badge-blue">{tierName(level)}</span>
              </div>
              <div className="w-full h-1 rounded-full mt-1.5" style={{ background: 'rgba(59,130,246,0.1)' }}>
                <div className="h-1 rounded-full" style={{ width: `${Math.round((xpIntoLevel / XP_PER_LEVEL) * 100)}%`, background: 'linear-gradient(90deg,#2563eb,#60a5fa)' }} />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{XP_PER_LEVEL - xpIntoLevel} XP to level {level + 1}</p>
            </StatCard>

            <StatCard icon="flame" iconColor="#fb923c" label="Current Streak">
              <p className="text-xl font-extrabold text-white tabular-nums">{streak} <span className="text-sm font-bold text-slate-400">days</span></p>
              <p className="text-[11px] font-semibold text-orange-400 mt-1">Keep it going!</p>
            </StatCard>

            <StatCard icon="trophy" iconColor="#fbbf24" label="Best Streak">
              <p className="text-xl font-extrabold text-white tabular-nums">{maxStreak} <span className="text-sm font-bold text-slate-400">days</span></p>
              <p className="text-[11px] text-slate-500 mt-1">Personal record</p>
            </StatCard>

            <StatCard icon="flag" iconColor="#60a5fa" label="Quests Completed This Week">
              <p className="text-xl font-extrabold text-white tabular-nums">{completedThisWeek.length}</p>
              <Delta value={questsDelta} />
            </StatCard>

            <StatCard icon="coins" iconColor="#fbbf24" label="Debt Paid This Week">
              <p className="text-xl font-extrabold text-white tabular-nums">{paidThisWeek}</p>
              <Delta value={paidThisWeek - paidLastWeek} />
            </StatCard>

            {/* Completion rate — radial */}
            <div className="stat-card flex items-center gap-3" style={{ padding: '14px' }}>
              <CompletionRing pct={completionRate} />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-tight">Completion Rate</p>
                <p className="text-[11px] text-slate-500 mt-1.5">{completedCount} of {tasks.length} quests</p>
              </div>
            </div>
          </div>

          {/* ── Row 2: level / streak / heatmap ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1.15fr_1fr] gap-4">
            <LevelProgression xp={xp} level={level} />
            <StreakMilestoneTracker streak={streak} />
            <WeeklyActivity activityByDay={activityByDay} />
          </div>

          {/* ── Row 3: categories / chart / achievements ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.35fr_1fr] gap-4">
            <QuestsByCategory tasks={tasks} />
            <ProgressOverTime weekData={weekData} />
            <RecentAchievements achievements={achievements} />
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 pt-1 pb-2">
            <Icon name="bolt" className="w-3.5 h-3.5" color="#475569" />
            <p className="text-[11px] text-slate-500">Progress is built daily. Small steps lead to big wins.</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
