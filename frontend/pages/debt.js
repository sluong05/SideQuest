import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Icon, CategoryIcon } from '../components/Icons';
import { PAYOFF_METHODS } from '../components/PayoffShell';
import { getDebt, getStreak, recalculateDebt, getSessions } from '../lib/api';
import { timeAgo } from '../lib/questMeta';

const DEBT_LEVELS = [
  { max: 0,        label: 'Clear',            color: '#34d399', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)' },
  { max: 25,       label: 'Light Burden',      color: '#fbbf24', bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.3)' },
  { max: 75,       label: 'Quest Debt',        color: '#fb923c', bg: 'rgba(234,88,12,0.12)',   border: 'rgba(234,88,12,0.3)' },
  { max: 125,      label: 'Debt Spiral',       color: '#f87171', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
  { max: 175,      label: 'Quest Bankruptcy',  color: '#f87171', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
  { max: 249,      label: 'Critical Mass',     color: '#c084fc', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.3)' },
  { max: Infinity, label: 'Beyond Recovery',   color: '#c084fc', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.3)' },
];

function getDebtLevel(total) {
  return DEBT_LEVELS.find((l) => total <= l.max) ?? DEBT_LEVELS[DEBT_LEVELS.length - 1];
}

function overdueColor(days) {
  if (days >= 5) return '#f87171';
  if (days >= 2) return '#fb923c';
  return '#fbbf24';
}

/* ── shared bits (mirrors progress.js visual language) ────────────────────── */

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

/* ── payoff recommendation (right column, orange) ─────────────────────────── */

function PayoffRecommendation({ debt, totalOwed }) {
  const owed = Math.ceil(debt.amountOwed);
  const pctOfTotal = Math.round((owed / Math.max(totalOwed, 1)) * 100);
  const title = debt.quest?.title ?? 'Abandoned quest';

  return (
    <div className="card" style={{ background: 'rgba(234,88,12,0.07)', borderColor: 'rgba(249,115,22,0.3)' }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-300">Payoff Recommendation</h2>
        <span className="badge badge-orange">Best option</span>
      </div>

      <p className="text-[10px] text-slate-500 mb-0.5">Suggested next action</p>
      <p className="text-base font-bold text-white truncate">{title} — {owed} pts</p>
      <p className="text-[11px] text-slate-400 mt-1">Clearing your oldest debt first stops it from compounding.</p>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        {[
          { icon: 'coins', value: `${owed} pts`,             sub: 'to pay off' },
          { icon: 'clock', value: `${debt.daysOverdue}d`,    sub: 'overdue' },
          { icon: 'bolt',  value: `${pctOfTotal}%`,          sub: 'of total debt' },
        ].map(({ icon, value, sub }) => (
          <div key={sub} className="flex flex-col items-center text-center rounded-xl py-2 px-1" style={{ background: 'rgba(8,21,37,0.6)', border: '1px solid rgba(249,115,22,0.15)' }}>
            <Icon name={icon} className="w-3.5 h-3.5 mb-1" color="#fb923c" />
            <span className="text-xs font-bold text-white tabular-nums leading-tight">{value}</span>
            <span className="text-[9px] text-slate-500">{sub}</span>
          </div>
        ))}
      </div>

      <Link
        href="/pay"
        className="mt-4 w-full inline-flex items-center justify-center gap-1.5 font-bold rounded-lg py-2.5 text-sm text-white transition-all"
        style={{
          background: 'linear-gradient(90deg, #ea580c, #f59e0b)',
          boxShadow: '0 0 18px rgba(249,115,22,0.35)',
        }}
      >
        <Icon name="bolt" className="w-4 h-4" color="#fff" />
        Start This Payoff
      </Link>
    </div>
  );
}

/* ── debt table ───────────────────────────────────────────────────────────── */

function DebtTable({ debts, sortBy, setSortBy, level, totalOwed }) {
  const sorted = [...debts].sort((a, b) =>
    sortBy === 'owed' ? b.amountOwed - a.amountOwed : b.daysOverdue - a.daysOverdue
  );

  return (
    <div className="card p-0 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap" style={{ borderBottom: '1px solid rgba(59,130,246,0.1)' }}>
        <IconTile name="clock" color="#fb923c" bg="rgba(234,88,12,0.12)" border="rgba(249,115,22,0.25)" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-navy-50">Your Debt</h2>
            <span className="badge" style={{ background: level.bg, border: `1px solid ${level.border}`, color: level.color }}>{level.label}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {totalOwed > 249
              ? <span className="inline-flex items-center gap-1"><Icon name="ban" className="w-3 h-3" color="#f87171" /> New quest creation is locked until you pay down debt.</span>
              : 'Complete actions to pay back what you owe.'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-slate-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-[11px] font-semibold rounded-md px-2 py-1 focus:outline-none cursor-pointer"
            style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.2)', color: '#cbd5e1' }}
          >
            <option value="overdue">Overdue</option>
            <option value="owed">Owed</option>
          </select>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 py-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500" style={{ borderBottom: '1px solid rgba(59,130,246,0.08)', background: 'rgba(8,15,32,0.5)' }}>
        <div className="flex-1">Debt Item</div>
        <div className="hidden md:block w-32 flex-shrink-0">Originating Quest</div>
        <div className="hidden sm:block w-16 text-center flex-shrink-0">Overdue</div>
        <div className="hidden lg:block w-28 flex-shrink-0">Progress</div>
        <div className="w-[150px] flex-shrink-0" />
      </div>

      <div className="divide-y" style={{ borderColor: 'rgba(59,130,246,0.06)' }}>
        {sorted.map((debt) => {
          const questTitle = debt.quest ? debt.quest.title : 'Abandoned quest';
          const category = debt.quest?.category ?? 'other';
          const owed = Math.ceil(debt.amountOwed);
          const days = debt.daysOverdue;
          // original charge is 5 pts/day — anything below that has been partially repaid
          const original = Math.max(5 * days, owed);
          const paidPct = Math.round(((original - owed) / original) * 100);

          return (
            <div key={debt.id} className="flex items-center gap-3 px-4 py-3">
              {/* Debt item */}
              <div className="flex-1 min-w-0 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <CategoryIcon category={category} />
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="text-sm font-semibold text-navy-100 truncate">{owed} pts owed</p>
                  <p className="text-[10px] text-slate-500 capitalize truncate">
                    {category}
                    <span className="sm:hidden" style={{ color: overdueColor(days) }}> · {days}d overdue</span>
                  </p>
                </div>
              </div>

              {/* Originating quest */}
              <div className="hidden md:block w-32 flex-shrink-0 leading-tight">
                <p className="text-xs text-navy-100 truncate">{questTitle}</p>
                {debt.quest?.dueDate && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Due {new Date(debt.quest.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>

              {/* Overdue */}
              <div className="hidden sm:block w-16 text-center flex-shrink-0 leading-tight">
                <p className="text-xs font-bold tabular-nums" style={{ color: overdueColor(days) }}>{days} {days === 1 ? 'day' : 'days'}</p>
                <p className="text-[9px] uppercase tracking-wide" style={{ color: overdueColor(days), opacity: 0.7 }}>Overdue</p>
              </div>

              {/* Progress */}
              <div className="hidden lg:flex w-28 items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-slate-400 tabular-nums w-7 text-right">{paidPct}%</span>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${paidPct}%`, background: 'linear-gradient(90deg,#1d4ed8,#60a5fa)' }} />
                </div>
              </div>

              {/* Actions */}
              <div className="w-[150px] flex items-center justify-end gap-1.5 flex-shrink-0">
                <Link
                  href="/pay"
                  className="text-[11px] py-1.5 px-2.5 rounded-lg font-semibold text-white text-center transition-all"
                  style={{ background: 'rgba(37,99,235,0.9)', border: '1px solid rgba(59,130,246,0.55)', boxShadow: '0 0 10px rgba(37,99,235,0.25)' }}
                >
                  Log Progress
                </Link>
                <Link
                  href="/pay/custom"
                  className="inline-flex items-center gap-0.5 text-[11px] py-1.5 px-2 rounded-lg font-semibold transition-all"
                  style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.2)', color: '#94a3b8' }}
                >
                  <Icon name="bolt" className="w-3 h-3" color="#fbbf24" />
                  Quick Pay
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 text-center" style={{ borderTop: '1px solid rgba(59,130,246,0.08)' }}>
        <PanelLink href="/progress">View past debt history</PanelLink>
      </div>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function DebtPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [debts, setDebts] = useState([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [allTimePaid, setAllTimePaid] = useState(0);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('overdue');

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
      setAllTimePaid(sessionsRes.data.allTimePaid ?? 0);
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
  const oldestDebt = debts.length > 0 ? [...debts].sort((a, b) => b.daysOverdue - a.daysOverdue)[0] : null;

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050A14' }}>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Layout streak={streak}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* ── Left column ── */}
        <div className="space-y-4 min-w-0">
          {/* Header */}
          <div>
            <p className="text-[11px] text-slate-500 mb-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="text-2xl font-bold" style={{ color: '#93c5fd' }}>Debt Hub</h1>
            <p className="text-navy-300 text-sm mt-1">Missed quests become debt. Pay it back through real actions.</p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard icon="clock" iconColor="#fb923c" label="Total Debt">
              <p className="text-xl font-extrabold tabular-nums" style={{ color: totalOwed > 0 ? '#fff' : '#34d399' }}>
                {totalOwed} <span className="text-sm font-bold text-slate-400">pts</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Across {activeCnt} debt {activeCnt === 1 ? 'item' : 'items'}</p>
            </StatCard>

            <StatCard icon="list" iconColor="#60a5fa" label="Active Debt Items">
              <p className="text-xl font-extrabold text-white tabular-nums">{activeCnt}</p>
              <p className="text-[11px] text-slate-500 mt-1">Overdue quests</p>
            </StatCard>

            <StatCard icon="flame" iconColor="#fb923c" label="Payoff Streak">
              <p className="text-xl font-extrabold text-white tabular-nums">{streak} <span className="text-sm font-bold text-slate-400">days</span></p>
              <p className="text-[11px] font-semibold text-orange-400 mt-1">Keep it going!</p>
            </StatCard>

            <StatCard icon="bolt" iconColor="#60a5fa" label="All-Time Repaid">
              <p className="text-xl font-extrabold tabular-nums text-blue-300">+{allTimePaid}</p>
              <p className="text-[11px] text-slate-500 mt-1">pts paid back</p>
            </StatCard>
          </div>

          {/* Debt table */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : debts.length === 0 ? (
            <div className="card text-center py-12">
              <div className="flex justify-center mb-3"><Icon name="partyPopper" className="w-9 h-9" color="#4ade80" /></div>
              <p className="text-xl font-bold text-green-400 mb-2">No Active Debt!</p>
              <p className="text-navy-300 text-sm">You're cleared. Go crush your quests.</p>
              <Link href="/quests" className="btn-primary mt-4 text-sm py-2 px-5 inline-block">View Quests</Link>
            </div>
          ) : (
            <DebtTable debts={debts} sortBy={sortBy} setSortBy={setSortBy} level={level} totalOwed={totalOwed} />
          )}

          {/* How do you want to pay */}
          {totalOwed > 0 && (
            <div className="card">
              <div className="flex items-start justify-between gap-2 mb-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold text-navy-50">How do you want to pay?</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Choose a payment style to browse actions.</p>
                </div>
                <PanelLink href="/pay">Browse All Actions</PanelLink>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
                {PAYOFF_METHODS.map((m) => (
                  <Link
                    key={m.id}
                    href={m.href}
                    className="group flex flex-col gap-1.5 p-3 rounded-xl transition-all"
                    style={{ background: 'rgba(13,31,56,0.5)', border: '1px solid rgba(59,130,246,0.12)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = m.border.replace('0.3)', '0.5)'); e.currentTarget.style.boxShadow = `0 0 14px ${m.bg}`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.12)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: m.bg, border: `1px solid ${m.border}` }}
                      >
                        <Icon name={m.icon} className="w-3.5 h-3.5" color={m.color} />
                      </div>
                      <span className="text-xs font-bold text-navy-100">{m.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 leading-tight">{m.desc}</span>
                    <span className="text-[10px] font-semibold text-blue-400 group-hover:text-blue-300 transition-colors">Start →</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4 lg:pt-[76px]">
          {/* Payoff recommendation */}
          {!loading && oldestDebt && <PayoffRecommendation debt={oldestDebt} totalOwed={totalOwed} />}

          {/* Recent repayments */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">Recent Repayments</h2>
              <PanelLink href="/progress">View All</PanelLink>
            </div>
            {recentSessions.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No repayments yet. Clear some debt to see them here.</p>
            ) : (
              <div className="space-y-1.5">
                {recentSessions.map((s, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: 'rgba(13,31,56,0.4)', border: '1px solid rgba(59,130,246,0.08)' }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)' }}>
                      <Icon name="check" className="w-3 h-3" color="#4ade80" />
                    </div>
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-xs font-semibold text-navy-100 truncate">Paid off {s.amount} pts</p>
                      <p className="text-[10px] text-slate-500">
                        {timeAgo(s.date)} · {(PAYOFF_METHODS.find((m) => m.id === s.activity) ?? PAYOFF_METHODS[0]).label}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-400 tabular-nums flex-shrink-0">-{s.amount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pay debt. Earn XP. Level up. */}
          <div className="card flex items-center gap-3" style={{ background: 'rgba(37,99,235,0.06)', borderColor: 'rgba(59,130,246,0.25)' }}>
            <Hexagon size={46} glow>
              <Icon name="bolt" className="w-4 h-4" color="#60a5fa" />
            </Hexagon>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-bold text-white">Pay debt. Earn XP. Level up.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Every action clears debt and moves you forward.</p>
              <p className="text-[11px] font-semibold text-blue-400 mt-1">Lv {user?.level ?? 1} · {(user?.xp ?? 0).toLocaleString()} XP</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
