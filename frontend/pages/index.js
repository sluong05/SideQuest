import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import TaskList from '../components/TaskList';
import DebtSummary from '../components/DebtSummary';
import AddTaskModal from '../components/AddTaskModal';
import { useAuth } from '../contexts/AuthContext';
import { getTasks, getDebt, getStreak, recalculateDebt, setUsername } from '../lib/api';

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
  const [showAddTask, setShowAddTask] = useState(false);
  const [showDebtBlock, setShowDebtBlock] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
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
      const [tasksRes, debtRes, streakRes] = await Promise.all([
        getTasks({ upToDate: today }),   // overdue incomplete + completed today
        getDebt(),
        getStreak(),
      ]);
      setTasks(tasksRes.data.tasks);
      setDebts(debtRes.data.debts);
      setTotalOwed(debtRes.data.totalOwed);
      setStreak(streakRes.data.streak);
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

              <TaskList tasks={tasks} onTaskUpdated={loadData} />
            </div>

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
                  <span className="text-amber-400 font-mono">🔥</span>
                  <span>streak resets if debt remains</span>
                </div>
              </div>
            </div>
          </div>
        </div>
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
                💪 Do Pushups
              </a>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}
