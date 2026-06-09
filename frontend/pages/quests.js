import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import AddTaskModal from '../components/AddTaskModal';
import { useAuth } from '../contexts/AuthContext';
import { getTasks, getDebt, getStreak, completeTask, uncompleteTask, deleteTask, recalculateDebt } from '../lib/api';
import confetti from 'canvas-confetti';

// ─── Constants ─────────────────────────────────────────────────────────────
const CATEGORY_ICONS = {
  fitness: '💪', learning: '📚', focus: '🎯',
  productivity: '⚡', wellness: '🧘', chores: '🏠', other: '✦',
};
const CATEGORY_COLORS = {
  fitness: 'rgba(59,130,246,0.2)', learning: 'rgba(168,85,247,0.2)', focus: 'rgba(16,185,129,0.2)',
  productivity: 'rgba(234,179,8,0.2)', wellness: 'rgba(34,197,94,0.2)', chores: 'rgba(251,146,60,0.2)', other: 'rgba(59,130,246,0.15)',
};
const DIFF_STYLES = {
  easy:   { label: 'Easy',   color: '#34d399', bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.35)' },
  medium: { label: 'Medium', color: '#fbbf24', bg: 'rgba(234,179,8,0.15)',   border: 'rgba(234,179,8,0.35)' },
  hard:   { label: 'Hard',   color: '#f87171', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.35)' },
};
const DEBT_UNITS = { pushups: 'reps', study: 'min', walk: 'min', clean: 'min', read: 'pages', custom: '' };
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function formatDue(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const taskDay = new Date(date); taskDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((taskDay - today) / 86400000);
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (date < now) {
    return { label: dayDiff === 0 ? `Due Today · ${timeStr}` : `${Math.abs(dayDiff)}d overdue`, overdue: true };
  }
  if (dayDiff === 0) return { label: `Due Today · ${timeStr}`, overdue: false };
  if (dayDiff === 1) return { label: `Tomorrow · ${timeStr}`, overdue: false };
  if (dayDiff <= 7) return { label: `In ${dayDiff} days`, overdue: false };
  return { label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false };
}

// ─── Quest Card ─────────────────────────────────────────────────────────────
function QuestCard({ task, onComplete, onUncomplete, onSkip, isActioning }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const dueInfo = formatDue(task.dueDate);
  const diff = DIFF_STYLES[task.difficulty] ?? DIFF_STYLES.medium;
  const catIcon = CATEGORY_ICONS[task.category] ?? '✦';
  const catBg = CATEGORY_COLORS[task.category] ?? 'rgba(59,130,246,0.15)';
  const xp = task.xpReward ?? 50;
  const debtAmt = task.debtAmount ?? 5;
  const debtUnit = DEBT_UNITS[task.debtType] ?? 'reps';
  const activeDebt = task.pushupDebt && !task.pushupDebt.resolved ? Math.ceil(task.pushupDebt.pushupsOwed) : null;
  const loading = isActioning === task.id;

  const accentColor = task.completed ? '#34d399' : dueInfo.overdue ? '#f87171' : '#3b82f6';

  return (
    <>
      <div
        className={`rounded-xl transition-all ${task.completed ? 'opacity-55' : ''}`}
        style={{
          background: task.completed ? 'rgba(13,31,56,0.3)' : dueInfo.overdue ? 'rgba(239,68,68,0.04)' : 'rgba(13,31,56,0.55)',
          border: `1px solid ${task.completed ? 'rgba(52,211,153,0.12)' : dueInfo.overdue ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.1)'}`,
          borderLeft: `3px solid ${accentColor}`,
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          {/* Category icon */}
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ background: catBg }}>
            {catIcon}
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold leading-tight ${task.completed ? 'line-through text-navy-400' : 'text-white'}`}>
              {task.title}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Due */}
              <span className={`text-[11px] font-medium ${dueInfo.overdue && !task.completed ? 'text-red-400' : 'text-navy-400'}`}>
                {dueInfo.label}
              </span>
              {/* Status badges */}
              {task.completed && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' }}>
                  Completed
                </span>
              )}
              {dueInfo.overdue && !task.completed && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                  Overdue
                </span>
              )}
              {/* Difficulty */}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: diff.bg, border: `1px solid ${diff.border}`, color: diff.color }}>
                {diff.label}
              </span>
              {/* Debt cost pill */}
              {!task.completed && debtAmt > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', color: '#fb923c' }}>
                  +{debtAmt} {debtUnit} if skipped
                </span>
              )}
              {/* Active debt badge */}
              {activeDebt !== null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171' }}>
                  {activeDebt} owed
                </span>
              )}
            </div>
          </div>

          {/* Cost if skipped — desktop */}
          {!task.completed && (
            <div className="hidden xl:flex flex-col items-center text-center w-24 flex-shrink-0 gap-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <span className="text-red-400 text-sm font-bold leading-none">×</span>
              </div>
              <span className="text-[10px] text-orange-400 font-semibold leading-tight">+{debtAmt} {debtUnit}</span>
              <span className="text-[9px] text-navy-500 leading-tight">cost if skipped</span>
            </div>
          )}

          {/* XP */}
          <div className="hidden md:flex flex-col items-center w-16 flex-shrink-0">
            <span className="text-xs font-bold text-yellow-400">+{xp} XP</span>
            {task.completed && <span className="text-[9px] text-navy-500 mt-0.5">earned</span>}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {task.completed ? (
              <button
                onClick={() => onUncomplete(task.id)}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', color: '#94a3b8' }}
              >
                Undo
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all hidden sm:block"
                  style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
                >
                  Skip Quest
                </button>
                <button
                  onClick={() => onComplete(task.id)}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white transition-all"
                  style={{ background: loading ? 'rgba(37,99,235,0.4)' : '#2563eb', border: '1px solid rgba(59,130,246,0.4)', minWidth: 100 }}
                >
                  {loading ? '…' : 'Complete Quest'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <h2 className="text-base font-bold text-navy-50 mb-2">Skip This Quest?</h2>
            <p className="text-navy-200 text-sm mb-5">Skipping adds <span className="text-red-400 font-bold">5 to your debt</span>.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => { setShowConfirm(false); onSkip(task.id); }}
                className="flex-1 py-2 px-4 rounded-lg font-semibold text-sm text-white"
                style={{ background: 'rgba(239,68,68,0.8)', border: '1px solid rgba(239,68,68,0.5)' }}
              >
                Skip anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Right sidebar panels ───────────────────────────────────────────────────
function DueTodayPanel({ tasks, todayCount, pendingAll, completedAll, overdueAll, todayStart, todayEnd }) {
  const todayTasks = tasks.filter((t) => {
    const d = new Date(t.dueDate);
    return !t.completed && d >= todayStart && d <= todayEnd;
  });
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
      <p className="text-[10px] font-bold text-navy-400 uppercase tracking-widest mb-3">Quests Due Today</p>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-3xl font-bold text-white">{todayCount}</span>
        <span className="text-sm text-navy-400">quests</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[
          { label: `${pendingAll} To Do`,     bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa',  border: 'rgba(59,130,246,0.25)' },
          { label: `${completedAll} Done`,    bg: 'rgba(52,211,153,0.15)',  color: '#34d399',  border: 'rgba(52,211,153,0.25)' },
          { label: `${overdueAll} Overdue`,   bg: 'rgba(239,68,68,0.15)',   color: '#f87171',  border: 'rgba(239,68,68,0.25)' },
        ].map(({ label, bg, color, border }) => (
          <span key={label} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: bg, color, border: `1px solid ${border}` }}>
            {label}
          </span>
        ))}
      </div>
      {todayTasks.length > 0 && (
        <div className="space-y-2">
          {todayTasks.slice(0, 4).map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#3b82f6' }} />
              <span className="text-xs text-navy-200 truncate">{t.title}</span>
            </div>
          ))}
          {todayTasks.length > 4 && (
            <p className="text-[10px] text-navy-500">+{todayTasks.length - 4} more</p>
          )}
        </div>
      )}
    </div>
  );
}

function CompletionRatePanel({ completionRate, completedAll, totalCount }) {
  const r = 32, cx = 44, cy = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(completionRate / 100, 1));
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
      <p className="text-[10px] font-bold text-navy-400 uppercase tracking-widest mb-3">Completion Rate</p>
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(59,130,246,0.1)" strokeWidth={8} />
            <circle
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={8}
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.5))', transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-white">{completionRate}%</span>
          </div>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{completionRate}%</p>
          <p className="text-xs text-navy-400 mt-0.5">{completedAll} of {totalCount} quests</p>
          <div className="w-full h-1 rounded-full mt-2" style={{ background: 'rgba(59,130,246,0.1)', width: 80 }}>
            <div className="h-1 rounded-full" style={{ width: `${completionRate}%`, background: 'linear-gradient(90deg,#2563eb,#60a5fa)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function XPThisWeekPanel({ tasks, userXP, userLevel }) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = tasks
    .filter((t) => t.completed && t.completedAt && new Date(t.completedAt) >= sevenDaysAgo)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const weekXP = recent.reduce((s, t) => s + (t.xpReward ?? 50), 0);

  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
      <p className="text-[10px] font-bold text-navy-400 uppercase tracking-widest mb-1">XP This Week</p>
      <p className="text-3xl font-bold text-yellow-400 mb-0.5">{weekXP}</p>
      <p className="text-[10px] text-navy-500 mb-3">Total: {userXP ?? 0} XP · Lv {userLevel ?? 1}</p>
      {recent.length > 0 ? (
        <div className="space-y-2">
          {recent.slice(0, 4).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm flex-shrink-0">{CATEGORY_ICONS[t.category] ?? '✦'}</span>
                <span className="text-xs text-navy-200 truncate">{t.title}</span>
              </div>
              <span className="text-xs font-bold text-yellow-400 flex-shrink-0">+{t.xpReward ?? 50} XP</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-navy-500">Complete quests to earn XP this week.</p>
      )}
    </div>
  );
}

function StreakPanel({ streak }) {
  const today = new Date().getDay();
  const activeDays = Array.from({ length: 7 }, (_, i) => {
    const dayIdx = (i + 1) % 7;
    return streak > 0 && dayIdx <= (today === 0 ? 7 : today);
  });
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
      <p className="text-[10px] font-bold text-navy-400 uppercase tracking-widest mb-3">Quest Streak</p>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">🔥</span>
        <span className="text-3xl font-bold text-orange-400 tabular-nums">{streak}</span>
        <span className="text-sm text-navy-300">days</span>
      </div>
      <div className="flex items-center gap-1 mb-3">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div
              className="w-5 h-5 rounded-full"
              style={{
                background: activeDays[i] && streak > 0 ? 'linear-gradient(135deg,#f97316,#fb923c)' : 'rgba(13,31,56,0.8)',
                border: `1px solid ${activeDays[i] && streak > 0 ? 'rgba(249,115,22,0.5)' : 'rgba(59,130,246,0.1)'}`,
                boxShadow: activeDays[i] && streak > 0 ? '0 0 6px rgba(249,115,22,0.4)' : 'none',
              }}
            />
            <span className="text-[9px] text-navy-600">{d}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-navy-400">
        {streak > 0 ? 'Keep going! Complete a quest today to keep your streak.' : 'Complete a quest today to start your streak!'}
      </p>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function Quests() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tasks, setTasks] = useState([]);
  const [debts, setDebts] = useState([]);
  const [streak, setStreak] = useState(0);
  const [totalOwed, setTotalOwed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [diffFilter, setDiffFilter] = useState('All');
  const [sortBy, setSortBy] = useState('dueDate');
  const [search, setSearch] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [tasksRes, debtRes, streakRes] = await Promise.all([getTasks(), getDebt(), getStreak()]);
      setTasks(tasksRes.data.tasks);
      setDebts(debtRes.data.debts);
      setTotalOwed(debtRes.data.totalOwed);
      setStreak(streakRes.data.streak);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    recalculateDebt().catch(() => {}).finally(() => loadData());
  }, [user]);

  async function handleComplete(taskId) {
    setActionLoading(taskId);
    try {
      await completeTask(taskId);
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.6 }, colors: ['#3b82f6', '#60a5fa', '#34d399', '#fbbf24'] });
      loadData();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  }
  async function handleUncomplete(taskId) {
    setActionLoading(taskId);
    try { await uncompleteTask(taskId); loadData(); }
    catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  }
  async function handleSkip(taskId) {
    setActionLoading(taskId);
    try { await deleteTask(taskId); loadData(); }
    catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  }

  const now = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const todayCount  = tasks.filter((t) => { const d = new Date(t.dueDate); return !t.completed && d >= todayStart && d <= todayEnd; }).length;
  const completedAll = tasks.filter((t) => t.completed).length;
  const overdueAll  = tasks.filter((t) => !t.completed && new Date(t.dueDate) < now).length;
  const pendingAll  = tasks.filter((t) => !t.completed).length;
  const completionRate = tasks.length > 0 ? Math.round((completedAll / tasks.length) * 100) : 0;

  const TABS = [
    { key: 'All',       label: 'All',       count: null },
    { key: 'Today',     label: 'Today',     count: todayCount },
    { key: 'Upcoming',  label: 'Upcoming',  count: null },
    { key: 'Completed', label: 'Completed', count: completedAll },
    { key: 'Overdue',   label: 'Overdue',   count: overdueAll },
  ];

  const filtered = tasks
    .filter((t) => {
      const due = new Date(t.dueDate);
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (diffFilter !== 'All' && (t.difficulty ?? 'medium') !== diffFilter.toLowerCase()) return false;
      if (filter === 'All')       return !t.deletedAt;
      if (filter === 'Today')     return !t.completed && due >= todayStart && due <= todayEnd;
      if (filter === 'Upcoming')  return !t.completed && due > now;
      if (filter === 'Completed') return t.completed;
      if (filter === 'Overdue')   return !t.completed && due < now;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'dueDate')   return new Date(a.dueDate) - new Date(b.dueDate);
      if (sortBy === 'difficulty') {
        const o = { easy: 0, medium: 1, hard: 2 };
        return (o[a.difficulty] ?? 1) - (o[b.difficulty] ?? 1);
      }
      if (sortBy === 'xp') return (b.xpReward ?? 50) - (a.xpReward ?? 50);
      return 0;
    });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectStyle = {
    background: 'rgba(13,31,56,0.8)',
    border: '1px solid rgba(59,130,246,0.2)',
    color: '#94a3b8',
    borderRadius: 8,
    padding: '6px 28px 6px 10px',
    fontSize: 12,
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
  };

  return (
    <Layout streak={streak}>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

        {/* ── Main content ────────────────────────────────── */}
        <div className="lg:col-span-3">

          {/* Header */}
          <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-navy-50">All Quests</h1>
              <p className="text-navy-400 text-sm mt-0.5">Browse and manage your quests. Complete them to earn XP and avoid debt.</p>
            </div>
            <button
              onClick={() => totalOwed > 249 ? alert('Pay off debt first.') : setShowAddTask(true)}
              className="btn-primary flex items-center gap-1.5 text-sm flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Quest
            </button>
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              className="input pl-9"
              placeholder="Search quests…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filter tabs + dropdowns */}
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl overflow-x-auto flex-shrink-0" style={{ background: 'rgba(13,31,56,0.6)', border: '1px solid rgba(59,130,246,0.1)' }}>
              {TABS.map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                  style={{
                    background: filter === key ? 'rgba(59,130,246,0.2)' : 'transparent',
                    color: filter === key ? '#60a5fa' : '#475569',
                    border: filter === key ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                  }}
                >
                  {label}
                  {count !== null && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                      style={{
                        background: filter === key ? 'rgba(59,130,246,0.35)' : 'rgba(59,130,246,0.12)',
                        color: filter === key ? '#93c5fd' : '#64748b',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Dropdowns */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative">
                <select value={diffFilter} onChange={(e) => setDiffFilter(e.target.value)} style={selectStyle}>
                  <option value="All">All Difficulties</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-navy-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="relative">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
                  <option value="dueDate">Sort: Due Date</option>
                  <option value="difficulty">Sort: Difficulty</option>
                  <option value="xp">Sort: XP</option>
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-navy-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Quest list */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl text-center py-14" style={{ background: 'rgba(13,31,56,0.5)', border: '1px solid rgba(59,130,246,0.1)' }}>
              <p className="text-3xl mb-3">🎯</p>
              <p className="text-navy-200 font-medium text-sm">No quests found</p>
              <p className="text-navy-500 text-xs mt-1">
                {filter !== 'All' || diffFilter !== 'All' ? 'Try changing the filters.' : 'Create your first quest to get started.'}
              </p>
              {filter === 'All' && diffFilter === 'All' && (
                <button onClick={() => setShowAddTask(true)} className="btn-primary mt-5 text-sm py-2 px-5">+ Create Quest</button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((task) => (
                <QuestCard
                  key={task.id}
                  task={task}
                  onComplete={handleComplete}
                  onUncomplete={handleUncomplete}
                  onSkip={handleSkip}
                  isActioning={actionLoading}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Right sidebar ─────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">
          <DueTodayPanel
            tasks={tasks}
            todayCount={todayCount}
            pendingAll={pendingAll}
            completedAll={completedAll}
            overdueAll={overdueAll}
            todayStart={todayStart}
            todayEnd={todayEnd}
          />
          <CompletionRatePanel
            completionRate={completionRate}
            completedAll={completedAll}
            totalCount={tasks.length}
          />
          <XPThisWeekPanel tasks={tasks} userXP={user?.xp} userLevel={user?.level} />
          <StreakPanel streak={streak} />

          {totalOwed > 0 && (
            <div className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2">Active Debt</p>
              <p className="text-3xl font-bold text-red-400 mb-0.5">{totalOwed}</p>
              <p className="text-xs text-navy-400 mb-3">{debts.length} overdue quest{debts.length !== 1 ? 's' : ''}</p>
              <Link href="/verify-pushups" className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.4)' }}>
                ⚔ Pay Debt
              </Link>
            </div>
          )}
        </div>
      </div>

      {showAddTask && (
        <AddTaskModal
          onClose={() => setShowAddTask(false)}
          onTaskAdded={() => { recalculateDebt().catch(() => {}); loadData(); }}
        />
      )}
    </Layout>
  );
}
