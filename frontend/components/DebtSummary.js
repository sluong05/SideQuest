import Link from 'next/link';

const DEBT_LEVELS = [
  { max: 0,        label: 'Clear',            flavor: null,                                                                color: '#34d399', ring: 'rgba(52,211,153,0.7)',  bg: 'rgba(16,185,129,0.1)' },
  { max: 25,       label: 'Light Burden',      flavor: 'The Quest Council is watching you closely.',                       color: '#fbbf24', ring: 'rgba(251,191,36,0.7)',  bg: 'rgba(234,179,8,0.1)' },
  { max: 75,       label: 'Quest Debt',        flavor: 'Your debts are piling up. Time to act.',                          color: '#fb923c', ring: 'rgba(251,146,60,0.7)',  bg: 'rgba(234,88,12,0.1)' },
  { max: 125,      label: 'Debt Spiral',       flavor: 'Reckless. The Quest Council is not pleased.',                     color: '#f87171', ring: 'rgba(248,113,113,0.7)', bg: 'rgba(239,68,68,0.1)' },
  { max: 175,      label: 'Quest Bankruptcy',  flavor: 'Collections have been sent. This is not a drill.',                color: '#f87171', ring: 'rgba(248,113,113,0.7)', bg: 'rgba(239,68,68,0.1)' },
  { max: 249,      label: 'Critical Mass',     flavor: "You've become a cautionary tale in the Quest Realm.",             color: '#c084fc', ring: 'rgba(192,132,252,0.7)', bg: 'rgba(168,85,247,0.1)' },
  { max: Infinity, label: 'Beyond Recovery',   flavor: 'New quests are blocked. The Quest Realm has given up on you.',    color: '#c084fc', ring: 'rgba(192,132,252,0.7)', bg: 'rgba(168,85,247,0.1)' },
];

function getDebtLevel(total) {
  return DEBT_LEVELS.find((l) => total <= l.max) ?? DEBT_LEVELS[DEBT_LEVELS.length - 1];
}

function CircularDebtGauge({ totalOwed }) {
  const radius = 52;
  const cx = 64;
  const cy = 64;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(totalOwed / 250, 1);
  const dashoffset = circumference * (1 - ratio);
  const level = getDebtLevel(totalOwed);

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(59,130,246,0.1)" strokeWidth={9} />
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={level.color}
            strokeWidth={9}
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ filter: `drop-shadow(0 0 8px ${level.ring})`, transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums leading-none" style={{ color: level.color }}>
            {totalOwed}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: level.color }}>
            {level.label.split(' ')[0]}
          </span>
        </div>
      </div>
      <span
        className="text-xs font-bold px-3 py-1 rounded-full mt-2"
        style={{ background: level.bg, border: `1px solid ${level.ring}`, color: level.color }}
      >
        {level.label}
      </span>
    </div>
  );
}

export default function DebtSummary({ debts, totalOwed, todayAtRisk = [] }) {
  const potentialAdditional = todayAtRisk.length * 5;
  const level = getDebtLevel(totalOwed);

  if (totalOwed === 0 && todayAtRisk.length === 0) {
    return (
      <div className="card text-center py-10">
        <p className="text-5xl mb-4">🎉</p>
        <p className="text-xl font-bold text-green-400">No Debt!</p>
        <p className="text-navy-300 text-sm mt-2">You're cleared. Keep questing.</p>
      </div>
    );
  }

  if (totalOwed === 0 && todayAtRisk.length > 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-3xl mb-3">✅</p>
        <p className="text-lg font-bold text-green-400">No Debt Right Now</p>
        <p className="text-navy-200 text-sm mt-1">Finish today's quests to keep it that way.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Circular gauge card */}
      <div
        className="card"
        style={{ background: `linear-gradient(135deg, ${level.bg} 0%, rgba(8,15,32,0.95) 100%)`, borderColor: level.ring.replace('0.7', '0.35') }}
      >
        <CircularDebtGauge totalOwed={totalOwed} />

        {level.flavor && (
          <p className="text-xs text-navy-400 italic text-center mt-3">{level.flavor}</p>
        )}

        {potentialAdditional > 0 && (
          <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(59,130,246,0.1)' }}>
            <span className="text-xs text-navy-300">If today fails</span>
            <span className="text-xs font-bold text-orange-400">+{potentialAdditional} more</span>
          </div>
        )}

        <Link
          href="/verify-pushups"
          className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all block"
          style={{ background: `linear-gradient(135deg, ${level.color}33, ${level.color}22)`, border: `1px solid ${level.ring}`, boxShadow: `0 0 20px ${level.ring.replace('0.7','0.2')}` }}
        >
          ⚔️ Pay Down Debt
        </Link>
      </div>

      {/* Debt breakdown */}
      {debts.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(59,130,246,0.08)' }}>
            <h3 className="text-xs font-semibold text-navy-300 uppercase tracking-wide">Debt Breakdown</h3>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(59,130,246,0.06)' }}>
            {debts.filter((d) => d.task).map((debt) => {
              const owed = Math.ceil(debt.pushupsOwed);
              const pct = Math.min((owed / totalOwed) * 100, 100);
              return (
                <div key={debt.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-navy-100 truncate flex-1 mr-2">{debt.task.title}</p>
                    <span className="text-xs font-bold tabular-nums text-red-400 flex-shrink-0">{owed}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(239,68,68,0.1)' }}>
                      <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #ef4444, #f87171)' }} />
                    </div>
                    <span className="text-[10px] text-navy-400 flex-shrink-0">{debt.daysOverdue}d</span>
                  </div>
                </div>
              );
            })}
            {(() => {
              const abandoned = debts.filter((d) => !d.task);
              if (abandoned.length === 0) return null;
              const total = Math.ceil(abandoned.reduce((s, d) => s + d.pushupsOwed, 0));
              return (
                <div key="abandoned" className="px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs text-navy-400 italic">Abandoned ({abandoned.length})</p>
                  <span className="text-xs font-bold text-red-400">{total}</span>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
