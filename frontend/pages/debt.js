import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getDebt, getStreak, recalculateDebt, getSessions } from '../lib/api';

const DEBT_LEVELS = [
  { max: 0,        label: 'Clear',            color: '#34d399', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)' },
  { max: 25,       label: 'Light Burden',      color: '#fbbf24', bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.3)' },
  { max: 75,       label: 'Quest Debt',        color: '#fb923c', bg: 'rgba(234,88,12,0.12)',   border: 'rgba(234,88,12,0.3)' },
  { max: 125,      label: 'Debt Spiral',       color: '#f87171', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
  { max: 175,      label: 'Quest Bankruptcy',  color: '#f87171', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
  { max: 249,      label: 'Critical Mass',     color: '#c084fc', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.3)' },
  { max: Infinity, label: 'Beyond Recovery',   color: '#c084fc', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.3)' },
];

const PAYOFF_METHODS = [
  { id: 'pushups', label: 'Fitness',   icon: '💪', desc: 'Camera-verified reps',  href: '/verify-pushups' },
  { id: 'study',   label: 'Focus',     icon: '🎯', desc: 'Focus session',         href: '/verify-pushups' },
  { id: 'walk',    label: 'Wellness',  icon: '🧘', desc: 'Walk or stretch',       href: '/verify-pushups' },
  { id: 'clean',   label: 'Chores',    icon: '🏠', desc: 'Tidy something up',     href: '/verify-pushups' },
  { id: 'read',    label: 'Study',     icon: '📚', desc: 'Pages or minutes',      href: '/verify-pushups' },
  { id: 'custom',  label: 'Custom',    icon: '✏️', desc: 'Your own challenge',    href: '/verify-pushups' },
];

const CATEGORY_ICONS = {
  fitness: '💪', learning: '📚', focus: '🎯',
  productivity: '⚡', wellness: '🧘', chores: '🏠', other: '✦',
};

function getDebtLevel(total) {
  return DEBT_LEVELS.find((l) => total <= l.max) ?? DEBT_LEVELS[DEBT_LEVELS.length - 1];
}

export default function DebtPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [debts, setDebts] = useState([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [allTimePaid, setAllTimePaid] = useState(0);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState('pushups');

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [debtRes, streakRes, sessionsRes] = await Promise.all([getDebt(), getStreak(), getSessions()]);
      setDebts(debtRes.data.debts);
      setTotalOwed(debtRes.data.totalOwed);
      setStreak(streakRes.data.streak);
      setAllTimePaid(sessionsRes.data.allTimePushups ?? 0);
      setRecentSessions(sessionsRes.data.sessions.slice(0, 5));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    recalculateDebt().catch(() => {}).finally(() => loadData());
  }, [user]);

  const level = getDebtLevel(totalOwed);
  const activeCnt = debts.filter((d) => !d.resolved).length;
  const maxDaysOverdue = debts.length > 0 ? Math.max(...debts.map((d) => d.daysOverdue ?? 0)) : 0;

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
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-navy-50">Debt Hub</h1>
        <p className="text-navy-300 text-sm mt-1">Review your debt and take action through your chosen activities.</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card text-center py-4">
          <p className="text-2xl font-bold tabular-nums" style={{ color: totalOwed > 0 ? '#f87171' : '#34d399' }}>
            {totalOwed}
          </p>
          <p className="text-xs text-navy-400 mt-1">Total Debt</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold tabular-nums text-orange-400">{activeCnt}</p>
          <p className="text-xs text-navy-400 mt-1">Active Debts</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold tabular-nums text-red-400">{maxDaysOverdue}d</p>
          <p className="text-xs text-navy-400 mt-1">Longest Overdue</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold tabular-nums text-blue-400">{allTimePaid}</p>
          <p className="text-xs text-navy-400 mt-1">All-Time Paid</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main debt table */}
        <div className="lg:col-span-2">
          {/* Debt level banner */}
          {totalOwed > 0 && (
            <div className="rounded-xl px-4 py-3 mb-4 flex items-center justify-between" style={{ background: level.bg, border: `1px solid ${level.border}` }}>
              <div>
                <span className="text-sm font-bold" style={{ color: level.color }}>{level.label}</span>
                <p className="text-xs text-navy-400 mt-0.5">
                  {totalOwed > 249 ? '🚫 New quest creation is locked.' : `${totalOwed} total debt remaining.`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums" style={{ color: level.color }}>{totalOwed}</p>
                <p className="text-[10px] text-navy-500">/ 250 limit</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : debts.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-4xl mb-3">🎉</p>
              <p className="text-xl font-bold text-green-400 mb-2">No Active Debt!</p>
              <p className="text-navy-300 text-sm">You're cleared. Go crush your quests.</p>
              <Link href="/quests" className="btn-primary mt-4 text-sm py-2 px-5 inline-block">View Quests</Link>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              {/* Table header */}
              <div className="flex items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-navy-500" style={{ borderBottom: '1px solid rgba(59,130,246,0.1)', background: 'rgba(8,15,32,0.5)' }}>
                <div className="flex-1">Quest</div>
                <div className="hidden sm:block w-20 text-center flex-shrink-0">Overdue</div>
                <div className="hidden md:block flex-1 text-center">Progress</div>
                <div className="w-20 text-right flex-shrink-0">Owed</div>
                <div className="w-24 flex-shrink-0" />
              </div>

              <div className="divide-y" style={{ borderColor: 'rgba(59,130,246,0.06)' }}>
                {debts.map((debt) => {
                  const questTitle = debt.task ? debt.task.title : 'Abandoned quest';
                  const catIcon = CATEGORY_ICONS[debt.task?.category] ?? '⚔️';
                  const owed = Math.ceil(debt.pushupsOwed);
                  const days = debt.daysOverdue;
                  const pct = Math.min((owed / Math.max(totalOwed, 1)) * 100, 100);

                  return (
                    <div key={debt.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-base flex-shrink-0">{catIcon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-navy-100 truncate">{questTitle}</p>
                          <p className="text-xs text-navy-500 mt-0.5 sm:hidden">{days}d overdue</p>
                        </div>
                      </div>
                      <div className="hidden sm:block w-20 text-center flex-shrink-0">
                        <span className="text-xs font-bold text-orange-400">{days}d</span>
                      </div>
                      <div className="hidden md:flex flex-1 items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)' }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #ef4444, #f87171)' }} />
                        </div>
                        <span className="text-[10px] text-navy-500 flex-shrink-0">{Math.round(pct)}%</span>
                      </div>
                      <div className="w-20 text-right flex-shrink-0">
                        <span className="text-base font-bold tabular-nums text-red-400">{owed}</span>
                      </div>
                      <div className="w-24 flex-shrink-0">
                        <Link
                          href="/verify-pushups"
                          className="text-xs py-1.5 px-3 rounded-lg font-medium text-center block transition-all"
                          style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}
                        >
                          Pay Now
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* How do you want to pay */}
          {totalOwed > 0 && (
            <div className="card mt-4">
              <h3 className="text-sm font-bold text-navy-50 mb-1">How do you want to pay?</h3>
              <p className="text-xs text-navy-400 mb-4">Pick your activity, then start the session.</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                {PAYOFF_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMethod(m.id)}
                    className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl transition-all"
                    style={{
                      background: selectedMethod === m.id ? 'rgba(59,130,246,0.2)' : 'rgba(13,31,56,0.6)',
                      border: `1px solid ${selectedMethod === m.id ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.1)'}`,
                    }}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <span className={`text-[10px] font-semibold ${selectedMethod === m.id ? 'text-blue-400' : 'text-navy-400'}`}>{m.label}</span>
                  </button>
                ))}
              </div>
              <Link
                href={PAYOFF_METHODS.find((m) => m.id === selectedMethod)?.href ?? '/verify-pushups'}
                className="btn-primary w-full text-center py-3 block font-bold"
                style={{ boxShadow: '0 0 20px rgba(59,130,246,0.25)' }}
              >
                ⚔️ Start {PAYOFF_METHODS.find((m) => m.id === selectedMethod)?.label} Session
              </Link>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Payoff recommendation */}
          {debts.length > 0 && (
            <div className="card" style={{ background: 'rgba(59,130,246,0.07)', borderColor: 'rgba(59,130,246,0.25)' }}>
              <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-3">Payoff Recommendation</h3>
              <p className="text-sm text-navy-100 mb-1">
                Start with the oldest debt first to prevent compounding.
              </p>
              {debts[0] && (
                <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(13,31,56,0.6)' }}>
                  <p className="text-xs text-navy-300 truncate">{debts[0].task?.title ?? 'Abandoned quest'}</p>
                  <p className="text-lg font-bold text-red-400 mt-1">{Math.ceil(debts[0].pushupsOwed)} owed</p>
                  <p className="text-xs text-orange-400">{debts[0].daysOverdue} days overdue</p>
                </div>
              )}
              <Link href="/verify-pushups" className="btn-primary w-full text-center py-2.5 mt-3 block text-sm">
                ⚔️ Start Payoff
              </Link>
            </div>
          )}

          {/* Recent repayments */}
          {recentSessions.length > 0 && (
            <div className="card">
              <h3 className="text-xs font-semibold text-navy-300 uppercase tracking-wide mb-3">Recent Repayments</h3>
              <div className="space-y-2">
                {recentSessions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-navy-100">Pushup Session</p>
                      <p className="text-[10px] text-navy-500">{new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    </div>
                    <span className="text-xs font-bold text-green-400">-{s.pushupsCompleted}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Streak */}
          <div className="card">
            <h3 className="text-xs font-semibold text-navy-300 uppercase tracking-wide mb-2">Quest Streak</h3>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔥</span>
              <span className="text-3xl font-bold text-orange-400">{streak}</span>
              <span className="text-sm text-navy-300">days</span>
            </div>
          </div>

          {/* XP */}
          <div className="card">
            <h3 className="text-xs font-semibold text-navy-300 uppercase tracking-wide mb-2">Your Level</h3>
            <p className="text-3xl font-bold text-purple-400">Lv {user?.level ?? 1}</p>
            <p className="text-xs text-navy-400 mt-1">{(user?.xp ?? 0).toLocaleString()} XP total</p>
            <div className="mt-3 p-2 rounded-lg text-xs text-blue-400 text-center" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
              Pay debt → earn XP → level up
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
