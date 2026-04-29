import Link from 'next/link';
import { useState, useEffect } from 'react';

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
  if (!now) return '';
  const diff = new Date(dueDate) - now;
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function DebtSummary({ debts, totalOwed, todayAtRisk = [] }) {
  const potentialAdditional = todayAtRisk.length * 5;
  const potentialTotal = totalOwed + potentialAdditional;

  if (totalOwed === 0 && todayAtRisk.length === 0) {
    return (
      <div className="card text-center py-10">
        <p className="text-5xl mb-4">🎉</p>
        <p className="text-xl font-bold text-green-400">No Debt!</p>
        <p className="text-navy-200 text-sm mt-2">You're all caught up. Keep it up!</p>
      </div>
    );
  }

  if (totalOwed === 0 && todayAtRisk.length > 0) {
    return (
      <div className="space-y-4">
        <div className="card text-center py-8">
          <p className="text-3xl mb-3">✅</p>
          <p className="text-lg font-bold text-green-400">No Debt Right Now</p>
          <p className="text-navy-200 text-sm mt-1">Finish today's tasks to keep it that way.</p>
        </div>
        <PotentialDebtCard todayAtRisk={todayAtRisk} potentialAdditional={potentialAdditional} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Total owed */}
      <div className="card bg-gradient-to-br from-red-900/30 to-navy-500 border-red-700/40">
        <div className="text-center">
          <p className="text-sm text-navy-100 mb-1">Total Pushups Owed</p>
          <p className="text-6xl font-bold text-red-400 tabular-nums">{totalOwed}</p>
          <p className="text-sm text-navy-200 mt-2">
            {debts.length} overdue {debts.length === 1 ? 'task' : 'tasks'}
          </p>
        </div>

        {/* Potential total preview */}
        {potentialAdditional > 0 && (
          <div className="mt-4 border-t border-red-900/40 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-navy-200">If today's tasks go unfinished</span>
              <span className="text-amber-400 font-bold tabular-nums">+{potentialAdditional}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-navy-200">Total at risk</span>
              <span className="text-amber-300 font-bold tabular-nums">{potentialTotal}</span>
            </div>
          </div>
        )}

        <Link href="/verify-pushups" className="btn-primary w-full mt-5 text-base py-3 text-center block">
          💪 Log Pushups on Camera
        </Link>
      </div>

      {/* Potential debt from today's unfinished tasks */}
      {potentialAdditional > 0 && (
        <PotentialDebtCard todayAtRisk={todayAtRisk} potentialAdditional={potentialAdditional} />
      )}

      {/* Individual existing debts */}
      {debts.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-navy-200 uppercase tracking-wide mb-3">
            Current Breakdown
          </h3>
          <div className="space-y-3">
            {/* Named task debts */}
            {debts.filter((d) => d.task).map((debt) => (
              <div key={debt.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-50 truncate">{debt.task.title}</p>
                  <p className="text-xs text-navy-200">
                    {debt.daysOverdue} {debt.daysOverdue === 1 ? 'day' : 'days'} overdue
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-sm font-bold text-red-400 tabular-nums">
                    {Math.ceil(debt.pushupsOwed)}
                  </span>
                  <span className="text-xs text-navy-300 ml-1">reps</span>
                </div>
              </div>
            ))}
            {/* Combine all deleted-task debts into one row */}
            {(() => {
              const deleted = debts.filter((d) => !d.task);
              if (deleted.length === 0) return null;
              const total = Math.ceil(deleted.reduce((sum, d) => sum + d.pushupsOwed, 0));
              return (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-300 truncate italic">Deleted tasks</p>
                    <p className="text-xs text-navy-200">{deleted.length} {deleted.length === 1 ? 'task' : 'tasks'}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-sm font-bold text-red-400 tabular-nums">{total}</span>
                    <span className="text-xs text-navy-300 ml-1">reps</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function PotentialDebtCard({ todayAtRisk, potentialAdditional }) {
  const now = useNow();

  return (
    <div className="card border-amber-700/40 bg-amber-950/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-amber-400/80 uppercase tracking-wide">
          At Risk Today
        </h3>
        <span className="text-xs text-navy-300">if left unfinished</span>
      </div>

      <div className="space-y-2.5">
        {todayAtRisk.map((task) => {
          const countdown = formatCountdown(task.dueDate, now);
          const pastDue = now && new Date(task.dueDate) <= now;
          return (
            <div key={task.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-navy-100 truncate">{task.title}</p>
                <p className={`text-xs font-mono mt-0.5 ${pastDue ? 'text-red-400' : 'text-amber-400'}`}>
                  {pastDue ? 'past due — debt accruing' : `⏱ ${countdown} left`}
                </p>
              </div>
              <span className="text-sm font-semibold text-amber-500/80 tabular-nums flex-shrink-0">
                +5
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-amber-900/30 mt-3 pt-3 flex items-center justify-between">
        <span className="text-xs text-navy-200">
          {todayAtRisk.length} task{todayAtRisk.length !== 1 ? 's' : ''} · 5 pushups each
        </span>
        <span className="text-sm font-bold text-amber-400 tabular-nums">
          +{potentialAdditional} pushups
        </span>
      </div>
    </div>
  );
}
