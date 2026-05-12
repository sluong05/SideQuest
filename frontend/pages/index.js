import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import TaskList from '../components/TaskList';
import DebtSummary from '../components/DebtSummary';
import AddTaskModal from '../components/AddTaskModal';
import ActivityFeed from '../components/ActivityFeed';
import { useAuth } from '../contexts/AuthContext';
import { getTasks, getDebt, getStreak, getSessions, recalculateDebt, setUsername, getFriends } from '../lib/api';

// ── Shared time helpers ──────────────────────────────────────────────────────
function useNow() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatCountdown(dueDate, now) {
  if (!now) return '…';
  const diff = new Date(dueDate) - now;
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Today's Focus card ───────────────────────────────────────────────────────
function TodaysFocusCard({ todayAtRisk, tasks, onAddTask }) {
  const now = useNow();
  const pendingCount = todayAtRisk.length;
  const potentialDebt = pendingCount * 5;

  if (tasks.length === 0) {
    return (
      <div className="card mt-4 border-navy-500/60 bg-navy-700/20">
        <p className="text-xs font-semibold text-navy-400 uppercase tracking-widest mb-4">
          Today's Focus
        </p>
        <div className="text-center py-2">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-sm font-medium text-navy-100">No tasks yet today.</p>
          <p className="text-xs text-navy-300 mt-1 mb-5">
            Add one commitment to start protecting your streak.
          </p>
          <button
            onClick={onAddTask}
            className="btn-primary text-sm py-2 px-5"
          >
            + Add Task
          </button>
        </div>
      </div>
    );
  }

  if (pendingCount === 0) {
    return (
      <div className="card mt-4 border-green-800/30 bg-green-950/10">
        <p className="text-xs font-semibold text-navy-400 uppercase tracking-widest mb-3">
          Today's Focus
        </p>
        <div className="flex items-start gap-3">
          <span className="text-lg mt-0.5">✅</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-400">You're on track!</p>
            <p className="text-xs text-navy-300 mt-1">
              All tasks for today are handled. Keep the streak alive.
            </p>
          </div>
        </div>
        <button
          onClick={onAddTask}
          className="mt-4 text-xs text-navy-400 hover:text-amber-400 transition-colors duration-150"
        >
          + Add another task
        </button>
      </div>
    );
  }

  return (
    <div className="card mt-4 border-amber-700/30 bg-amber-950/10">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-amber-500/80 uppercase tracking-widest">
          Today's Focus
        </p>
        <span className="text-xs text-navy-400">stay on track</span>
      </div>

      <p className="text-sm text-navy-100 mb-0.5">
        You have{' '}
        <span className="text-amber-400 font-semibold">
          {pendingCount} task{pendingCount > 1 ? 's' : ''}
        </span>{' '}
        at risk today.
      </p>
      <p className="text-xs text-navy-300 mb-4">
        Finish {pendingCount > 1 ? 'them' : 'it'} in time to avoid{' '}
        <span className="text-amber-400 font-semibold">+{potentialDebt} pushups</span>.
      </p>

      <div className="space-y-2 mb-4">
        {todayAtRisk.map((task) => {
          const cd = formatCountdown(task.dueDate, now);
          const past = now && new Date(task.dueDate) <= now;
          return (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 bg-navy-700/40 rounded-lg px-3 py-2.5"
            >
              <p className="text-xs text-navy-100 truncate flex-1">{task.title}</p>
              <span
                className={`text-xs font-mono flex-shrink-0 ${
                  past ? 'text-red-400' : 'text-amber-400'
                }`}
              >
                {past ? 'past due' : cd ? `⏱ ${cd}` : '…'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-amber-900/30 pt-3 flex items-center justify-between">
        <span className="text-xs text-navy-300">
          Potential debt:{' '}
          <span className="text-amber-400 font-semibold">+{potentialDebt} pushups</span>
        </span>
        <button
          onClick={onAddTask}
          className="text-xs text-navy-400 hover:text-amber-400 transition-colors duration-150"
        >
          + Add task
        </button>
      </div>
    </div>
  );
}

// ── Streak milestones ────────────────────────────────────────────────────────
const MILESTONES = [3, 7, 14, 30, 60, 100];

function getNextMilestone(streak) {
  return MILESTONES.find((m) => m > streak) ?? null;
}

function getAchievedMilestones(streak) {
  return MILESTONES.filter((m) => m <= streak);
}

// ── Pushup bar chart helpers ─────────────────────────────────────────────────
function buildChartData(sessions) {
  const DAYS = 14;
  const buckets = [];
  const now = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    buckets.push({
      date: d,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      pushups: 0,
    });
  }
  for (const s of sessions) {
    const sd = new Date(s.date);
    sd.setHours(0, 0, 0, 0);
    const bucket = buckets.find((b) => b.date.getTime() === sd.getTime());
    if (bucket) bucket.pushups += s.pushupsCompleted;
  }
  return buckets;
}

function PushupChart({ sessions }) {
  const data = buildChartData(sessions);
  const maxVal = Math.max(...data.map((d) => d.pushups), 1);
  const W = 560;
  const H = 110;
  const padL = 4;
  const padR = 4;
  const padTop = 8;
  const padBot = 28;
  const chartW = W - padL - padR;
  const chartH = H - padTop - padBot;
  const barW = chartW / data.length;
  const gap = 3;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
      {data.map((d, i) => {
        const barH = d.pushups > 0 ? Math.max(4, (d.pushups / maxVal) * chartH) : 2;
        const x = padL + i * barW + gap / 2;
        const y = padTop + chartH - barH;
        const w = barW - gap;
        const isToday = i === data.length - 1;
        const showLabel = i % 2 === 0 || isToday;
        return (
          <g key={i}>
            <rect
              x={x} y={y} width={w}
              height={d.pushups > 0 ? barH : 2}
              rx={2}
              fill={d.pushups > 0 ? (isToday ? '#f97316' : '#fbbf24') : '#1e3a4a'}
            />
            {d.pushups > 0 && (
              <text
                x={x + w / 2}
                y={y - 2}
                textAnchor="middle"
                fontSize={8}
                fill={isToday ? '#f97316' : '#fbbf24'}
              >
                {d.pushups}
              </text>
            )}
            {showLabel && (
              <text
                x={x + w / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize={8}
                fill="#4b6070"
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function Dashboard() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const router = useRouter();

  const [tasks, setTasks] = useState([]);
  const [debts, setDebts] = useState([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [allTimePushups, setAllTimePushups] = useState(0);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showDebtBlock, setShowDebtBlock] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [hasFriends, setHasFriends] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/welcome');
    }
  }, [user, authLoading]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const [tasksRes, debtRes, streakRes, sessionsRes, friendsRes] = await Promise.all([
        getTasks({ upToDate: today }),
        getDebt(),
        getStreak(),
        getSessions(),
        getFriends(),
      ]);
      setTasks(tasksRes.data.tasks);
      setDebts(debtRes.data.debts);
      setTotalOwed(debtRes.data.totalOwed);
      setStreak(streakRes.data.streak);
      setSessions(sessionsRes.data.sessions);
      setAllTimePushups(sessionsRes.data.allTimePushups);
      setHasFriends(friendsRes.data.friends.length > 0);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  // On mount, trigger debt recalculation then load data
  useEffect(() => {
    if (!user) return;
    recalculateDebt().catch(() => {}).finally(() => loadData());
  }, [user]);

  // Update tab title to reflect outstanding debt
  useEffect(() => {
    document.title = totalOwed > 0 ? `(${totalOwed} pushups owed) PushupDebt` : 'PushupDebt';
    return () => { document.title = 'PushupDebt'; };
  }, [totalOwed]);

  async function handleTaskAdded() {
    // Recalculate in case the new task was already overdue, then refresh all data
    await recalculateDebt().catch(() => {});
    loadData();
  }

  async function handleSetUsername(e) {
    e.preventDefault();
    setUsernameError('');
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(usernameInput)) {
      setUsernameError('3–20 characters: letters, numbers, underscores only');
      return;
    }
    setUsernameSaving(true);
    try {
      const res = await setUsername(usernameInput);
      updateUser(res.data.user);
    } catch (err) {
      setUsernameError(err.response?.data?.error || 'Failed to save username');
    } finally {
      setUsernameSaving(false);
    }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const pendingCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;
  const overdueCount = tasks.filter((t) => !t.completed && new Date(t.dueDate) < today).length;
  // Tasks due today that haven't been completed yet — these will become debt tonight
  const todayAtRisk = tasks.filter((t) => {
    if (t.completed) return false;
    const due = new Date(t.dueDate);
    return due >= today && due <= todayEnd;
  });

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Layout streak={streak} showIdleModel>
      {/* Username prompt for existing accounts */}
      {!user?.username && (
        <div className="card border-amber-500/40 bg-amber-900/10 mb-6 p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">👤</span>
            <div className="flex-1">
              <p className="text-amber-400 font-semibold text-sm">Set your username</p>
              <p className="text-navy-200 text-xs mt-0.5 mb-3">
                Your account doesn't have a username yet. Add one to appear on the leaderboard and sign in without your email.
              </p>
              <form onSubmit={handleSetUsername} className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    type="text"
                    className="input py-2 text-sm"
                    placeholder="e.g. pushup_king"
                    value={usernameInput}
                    onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(''); }}
                    minLength={3}
                    maxLength={20}
                    required
                  />
                  {usernameError && (
                    <p className="text-xs text-red-400 mt-1">{usernameError}</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={usernameSaving}
                  className="btn-primary py-2 px-4 text-sm flex-shrink-0"
                >
                  {usernameSaving ? 'Saving…' : 'Save'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="mb-8">
        <p className="text-zinc-500 text-sm mb-1">{todayLabel()}</p>
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
      </div>

      {dataLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column — Tasks */}
          <div className="lg:col-span-3">
            <div className="card">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-navy-50">Tasks</h2>
                    {overdueCount > 0 && (
                      <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full font-medium">
                        {overdueCount} overdue
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-navy-200 mt-0.5">
                    {completedCount}/{tasks.length} completed
                  </p>
                </div>
                <button
                  onClick={() => totalOwed > 99 ? setShowDebtBlock(true) : setShowAddTask(true)}
                  className={`text-sm py-2 px-3 flex items-center gap-1.5 rounded-lg font-semibold transition-colors duration-150 ${
                    totalOwed > 99
                      ? 'bg-navy-400 text-navy-200 cursor-not-allowed opacity-60'
                      : 'btn-primary'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Task
                </button>
              </div>

              {/* Progress bar */}
              {tasks.length > 0 && (
                <div className="mb-5">
                  <div className="w-full bg-navy-700 rounded-full h-1.5">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <TaskList
                tasks={tasks}
                onTaskUpdated={loadData}
                onAddTask={totalOwed > 99 ? () => setShowDebtBlock(true) : () => setShowAddTask(true)}
              />
            </div>

            {/* Today's Focus — fills empty space when task list is short */}
            {tasks.length > 0 && tasks.length <= 2 && (
              <TodaysFocusCard
                todayAtRisk={todayAtRisk}
                tasks={tasks}
                onAddTask={() =>
                  totalOwed > 99 ? setShowDebtBlock(true) : setShowAddTask(true)
                }
              />
            )}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="card py-4 text-center">
                <p className="text-2xl font-bold text-navy-50">{tasks.length}</p>
                <p className="text-xs text-navy-200 mt-1">Active Tasks</p>
              </div>
              <div className="card py-4 text-center">
                <p className="text-2xl font-bold text-green-400">{completedCount}</p>
                <p className="text-xs text-navy-200 mt-1">Completed</p>
              </div>
              <div className="card py-4 text-center">
                <p className={`text-2xl font-bold ${pendingCount > 0 ? 'text-amber-400' : 'text-navy-300'}`}>
                  {pendingCount}
                </p>
                <p className="text-xs text-navy-200 mt-1">Pending</p>
              </div>
            </div>
          </div>

          {/* Right column — Debt */}
          <div className="lg:col-span-2">
            <div className="mb-3">
              <h2 className="text-base font-bold text-navy-50">Pushup Debt</h2>
            </div>

            <DebtSummary
              debts={debts}
              totalOwed={totalOwed}
              todayAtRisk={todayAtRisk}
            />

            {/* Streak milestone card */}
            {(() => {
              const next = getNextMilestone(streak);
              const achieved = getAchievedMilestones(streak);
              const daysAway = next ? next - streak : 0;
              return (
                <div className="card mt-4 bg-navy-700/50">
                  <h3 className="text-xs font-semibold text-navy-200 uppercase tracking-wide mb-3">
                    <span className="flex items-center gap-1.5"><img src="/Streak.svg" className="w-4 h-4" />Streak Milestones</span>
                  </h3>
                  {next ? (
                    <p className="text-sm text-navy-100 mb-3">
                      <span className="text-amber-400 font-bold">{daysAway}</span>{' '}
                      {daysAway === 1 ? 'day' : 'days'} until your{' '}
                      <span className="text-amber-400 font-bold">{next}-day badge</span>
                    </p>
                  ) : (
                    <p className="text-sm text-green-400 font-semibold mb-3 flex items-center gap-1.5">All milestones reached! <img src="/Ranking.svg" className="w-4 h-4" /></p>
                  )}
                  {next && (
                    <div className="w-full bg-navy-800 rounded-full h-1.5 mb-3">
                      <div
                        className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${(streak / next) * 100}%` }}
                      />
                    </div>
                  )}
                  {achieved.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {achieved.map((m) => (
                        <span
                          key={m}
                          className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium"
                        >
                          ✓ {m}d
                        </span>
                      ))}
                    </div>
                  )}
                  {achieved.length === 0 && streak === 0 && (
                    <p className="text-xs text-navy-300">Complete all tasks today to start your streak!</p>
                  )}
                </div>
              );
            })()}

            {/* Formula info */}
            <div className="card mt-4 bg-navy-700/50">
              <h3 className="text-xs font-semibold text-navy-200 uppercase tracking-wide mb-3">
                How It Works
              </h3>
              <div className="space-y-2 text-xs text-navy-200">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-mono">5 × days</span>
                  <span>pushups per overdue day</span>
                </div>
                <div className="flex items-center gap-2">
                  <img src="/Streak.svg" className="w-4 h-4" />
                  <span>streak resets if debt remains</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Friend activity feed */}
        {hasFriends && <ActivityFeed />}

        {/* Progress section */}
        <div className="mt-6 card">
          <h2 className="text-base font-bold text-navy-50 mb-1">Your Progress</h2>
          <p className="text-xs text-navy-300 mb-4">Pushups logged per day — last 14 days</p>

          {sessions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-navy-300 text-sm">No pushup sessions yet.</p>
              <p className="text-navy-400 text-xs mt-1">Log some pushups to see your chart.</p>
            </div>
          ) : (
            <PushupChart sessions={sessions} />
          )}

          {/* All-time stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-navy-600">
            <div className="text-center">
              <p className="text-xl font-bold text-amber-400 tabular-nums">{allTimePushups}</p>
              <p className="text-xs text-navy-300 mt-0.5">pushups all-time</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-400 tabular-nums">{user?.totalTasksCompleted ?? 0}</p>
              <p className="text-xs text-navy-300 mt-0.5">tasks completed</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-orange-400 tabular-nums">{streak}</p>
              <p className="text-xs text-navy-300 mt-0.5">day streak</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-navy-100 tabular-nums">
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                  : '—'}
              </p>
              <p className="text-xs text-navy-300 mt-0.5">member since</p>
            </div>
          </div>
        </div>
        </>
      )}

      {/* Modals */}
      {showAddTask && (
        <AddTaskModal
          onClose={() => setShowAddTask(false)}
          onTaskAdded={handleTaskAdded}
        />
      )}

      {showDebtBlock && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm text-center">
            <p className="text-4xl mb-4">🚫</p>
            <h2 className="text-lg font-bold text-navy-50 mb-2">Too Much Debt!</h2>
            <p className="text-navy-200 text-sm mb-6">
              Can't add more tasks until you do your pushups.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDebtBlock(false)}
                className="btn-secondary flex-1"
              >
                Dismiss
              </button>
              <a
                href="/verify-pushups"
                className="btn-primary flex-1 text-center"
              >
                <span className="flex items-center justify-center gap-1.5"><img src="/Bicep.svg" className="w-5 h-5" />Do Pushups</span>
              </a>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}
