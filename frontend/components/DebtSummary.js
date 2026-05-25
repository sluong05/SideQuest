import Link from 'next/link';

const DEBT_LEVELS = [
  { max: 0,   label: 'Debt Free',          flavor: null,                                                                          color: 'green',  nextLabel: null,              dropTo: null },
  { max: 25,  label: 'Light Debt',          flavor: 'Your debt collector is keeping a close eye on you.',                          color: 'yellow', nextLabel: 'Debt Free',       dropTo: (n) => n },
  { max: 75,  label: 'Risky',               flavor: 'The Pushup Bank is getting nervous.',                                         color: 'orange', nextLabel: 'Light Debt',      dropTo: (n) => n - 25 },
  { max: 125, label: 'Debt Spiral',         flavor: 'Financially and physically irresponsible.',                                   color: 'red',    nextLabel: 'Risky',           dropTo: (n) => n - 75 },
  { max: 175, label: 'Pushup Bankruptcy',   flavor: 'The Pushup Bank has sent collections. This is not a drill.',                  color: 'red',    nextLabel: 'Debt Spiral',     dropTo: (n) => n - 125 },
  { max: 225, label: 'Critical Mass',       flavor: "You've become a cautionary tale at the Pushup Bank.",                        color: 'purple', nextLabel: 'Pushup Bankruptcy', dropTo: (n) => n - 175 },
  { max: 249, label: 'Point of No Return',  flavor: 'One more overdue task and new tasks are blocked. Do pushups. Now.',          color: 'purple', nextLabel: 'Critical Mass',   dropTo: (n) => n - 225 },
  { max: Infinity, label: 'Beyond Recovery', flavor: 'New tasks are blocked. The Pushup Bank has given up on you.',               color: 'purple', nextLabel: 'Point of No Return', dropTo: (n) => n - 249 },
];

function getDebtLevel(total) {
  return DEBT_LEVELS.find((l) => total <= l.max);
}

const levelBadgeStyle = {
  green:  'bg-green-900/40 text-green-400 border border-green-700/40',
  yellow: 'bg-yellow-900/30 text-yellow-400 border border-yellow-700/40',
  orange: 'bg-orange-900/30 text-orange-400 border border-orange-700/40',
  red:    'bg-red-900/40 text-red-400 border border-red-700/40',
  purple: 'bg-purple-900/40 text-purple-400 border border-purple-700/40',
};

export default function DebtSummary({ debts, totalOwed, todayAtRisk = [] }) {
  const potentialAdditional = todayAtRisk.length * 5;
  const potentialTotal = totalOwed + potentialAdditional;
  const level = getDebtLevel(totalOwed);

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
      <div className="card text-center py-8">
        <p className="text-3xl mb-3">✅</p>
        <p className="text-lg font-bold text-green-400">No Debt Right Now</p>
        <p className="text-navy-200 text-sm mt-1">Finish today's tasks to keep it that way.</p>
      </div>
    );
  }

  const toDrop = level.dropTo ? level.dropTo(totalOwed) : null;

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

        {/* Debt level badge + flavor text */}
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${levelBadgeStyle[level.color]}`}>
            {level.label}
          </span>
          {level.flavor && (
            <p className="text-xs text-navy-300 italic text-center">{level.flavor}</p>
          )}
          {toDrop !== null && (
            <p className="text-xs text-navy-400 text-center">
              Pay <span className="text-amber-400 font-semibold">{toDrop}</span> to drop to{' '}
              <span className="text-navy-200 font-medium">{level.nextLabel}</span>
            </p>
          )}
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
          <span className="flex items-center justify-center gap-1.5"><img src="/Bicep.svg" className="w-5 h-5" />Log Pushups on Camera</span>
        </Link>
      </div>

      {/* Individual existing debts */}
      {debts.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-navy-200 uppercase tracking-wide mb-3">
            Current Breakdown
          </h3>
          <div className="space-y-3">
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

