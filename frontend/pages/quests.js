import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import AddQuestModal from '../components/AddQuestModal';
import QuestDetailModal from '../components/QuestDetailModal';
import { useAuth } from '../contexts/AuthContext';
import { getQuests, getDebt, getStreak, completeQuest, uncompleteQuest, deleteQuest, recalculateDebt } from '../lib/api';
import confetti from 'canvas-confetti';
import { Icon, CategoryIcon } from '../components/Icons';
import { CATEGORY_COLORS, DIFF_STYLES, DIFF_DURATION } from '../lib/questMeta';
import { PANEL_STYLE, SELECT_STYLE, PanelHeader } from '../components/Panel';
import { useSheetBehavior, deletePenalty, freeWindowMinutesLeft, FREE_EDIT_MINUTES } from '../components/SheetModal';

function formatDue(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const questDay = new Date(date); questDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((questDay - today) / 86400000);
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (date < now) {
    return dayDiff === 0
      ? { line1: 'Due Today', line2: `${timeStr} · past due`, overdue: true }
      : { line1: 'Overdue', line2: `${Math.abs(dayDiff)} day${Math.abs(dayDiff) !== 1 ? 's' : ''} overdue`, overdue: true };
  }
  if (dayDiff === 0) return { line1: 'Due Today', line2: `Today · ${timeStr}`, urgent: true };
  if (dayDiff === 1) return { line1: 'Due Tomorrow', line2: 'Tomorrow' };
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return { line1: `Due ${dateLabel}`, line2: `In ${dayDiff} days` };
}

// ─── Skip / delete confirmation (bottom sheet on mobile) ────────────────────
function SkipConfirm({ quest, onCancel, onConfirm }) {
  useSheetBehavior(onCancel);
  const penalty = deletePenalty(quest);
  const freeLeft = freeWindowMinutesLeft(quest);
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`skip-title-${quest.id}`}
        className="card w-full sm:max-w-sm text-center rounded-b-none sm:rounded-2xl sheet-footer"
      >
        <div className="flex justify-center mb-3"><Icon name="alert" className="w-9 h-9" color="#fbbf24" /></div>
        <h2 id={`skip-title-${quest.id}`} className="text-base font-bold text-navy-50 mb-2">Skip This Quest?</h2>
        <p className="text-navy-200 text-sm mb-5">
          {penalty > 0 ? (
            <>Skipping adds <span className="text-red-400 font-bold">+{penalty} pts</span> to your debt.</>
          ) : (
            <><span className="text-green-400 font-bold">No debt added</span> — quests are free to delete for {FREE_EDIT_MINUTES} min after creating ({freeLeft} min left).</>
          )}
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 min-h-[44px]">Cancel</button>
          <button
            onClick={onConfirm}
            className="flex-1 min-h-[44px] px-4 rounded-lg font-semibold text-sm text-white transition-all"
            style={{ background: 'rgba(239,68,68,0.8)', border: '1px solid rgba(239,68,68,0.5)' }}
          >
            {penalty > 0 ? 'Skip anyway' : 'Delete quest'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quest Row ──────────────────────────────────────────────────────────────
const MINI_LABEL = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94A3B8' };

function QuestCard({ quest, onComplete, onUncomplete, onSkip, onUpdated, isActioning }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const dueInfo = formatDue(quest.dueDate);
  const diff    = DIFF_STYLES[quest.difficulty] ?? DIFF_STYLES.medium;
  const catBg   = CATEGORY_COLORS[quest.category] ?? 'rgba(59,130,246,0.18)';
  const xp      = quest.xpReward ?? 50;
  const debtAmt = quest.debtAmount ?? 5;
  const duration = quest.duration ?? DIFF_DURATION[quest.difficulty] ?? '~45 min';
  const loading = isActioning === quest.id;
  const isOverdue = dueInfo.overdue && !quest.completed;
  // Completions lock after the local day they were checked off — no more undo
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const isLocked = quest.completed && quest.completedAt && new Date(quest.completedAt) < todayStart;

  const stateClass = quest.completed ? 'is-completed opacity-50' : isOverdue ? 'is-overdue' : '';
  const dueColor = quest.completed ? '#94A3B8' : isOverdue ? '#fb923c' : '#94a3b8';
  const due2Color = isOverdue || dueInfo.urgent ? '#f87171' : '#94A3B8';

  return (
    <>
      <div className={`sq-quest-card rounded-xl transition-all duration-200 ${stateClass}`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Checkbox circle — 44px hit area around an 18px circle */}
            <button
              onClick={() => (quest.completed ? onUncomplete(quest.id) : onComplete(quest.id))}
              disabled={loading || isLocked}
              aria-label={isLocked ? 'Completion locked' : quest.completed ? `Mark "${quest.title}" incomplete` : `Mark "${quest.title}" complete`}
              className="w-11 h-11 -mx-2 -my-1.5 flex items-center justify-center flex-shrink-0 rounded-full"
            >
              <span
                className="sq-check w-[20px] h-[20px] rounded-full flex items-center justify-center transition-all duration-150"
                style={quest.completed ? { border: '1.5px solid rgba(34,197,94,0.7)', background: 'rgba(34,197,94,0.18)' } : undefined}
              >
                {quest.completed && (
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth={3.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
            </button>

            {/* Category icon — rounded square */}
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: catBg, border: `1px solid ${catBg.replace(/[\d.]+\)$/, '0.4)')}` }}
            >
              <CategoryIcon category={quest.category} className="w-4 h-4" />
            </div>

            {/* Title + duration (+ due & penalty inline on mobile) */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold leading-tight break-words ${quest.completed ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                {quest.title}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[11px]" style={{ color: '#94A3B8' }}>{duration}</span>
                {quest.category && (
                  <>
                    <span className="text-[11px]" style={{ color: '#475569' }} aria-hidden>·</span>
                    <span className="text-[11px] capitalize" style={{ color: '#94A3B8' }}>{quest.category}</span>
                  </>
                )}
              </div>
              <div className="sm:hidden flex items-center gap-1.5 mt-1 flex-wrap text-[11px]">
                <span className="font-semibold" style={{ color: dueColor }}>{quest.completed ? 'Completed' : dueInfo.line1}</span>
                {!quest.completed && dueInfo.line2 && <span style={{ color: due2Color }}>· {dueInfo.line2}</span>}
                <span className="font-bold px-1.5 rounded-full" style={{ background: diff.bg, border: `1px solid ${diff.border}`, color: diff.color }}>{diff.label}</span>
                <span className="font-bold" style={{ color: '#60a5fa' }}>+{xp} XP</span>
                {!quest.completed && <span className="font-bold" style={{ color: isOverdue ? '#f87171' : '#fb923c' }}>{debtAmt} pts/day if missed</span>}
              </div>
            </div>
          </div>

          {/* Due date — two lines */}
          <div className="hidden sm:flex flex-col w-28 flex-shrink-0">
            <span className="text-xs font-semibold" style={{ color: dueColor }}>
              {quest.completed ? 'Completed' : dueInfo.line1}
            </span>
            <span className="text-[11px] mt-0.5" style={{ color: due2Color }}>
              {quest.completed ? '' : dueInfo.line2}
            </span>
          </div>

          {/* Difficulty badge */}
          <div className="hidden md:flex w-16 flex-shrink-0">
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: diff.bg, border: `1px solid ${diff.border}`, color: diff.color }}
            >
              {diff.label}
            </span>
          </div>

          {/* Quest XP */}
          <div className="hidden md:flex flex-col w-20 flex-shrink-0">
            <span style={MINI_LABEL}>Quest XP</span>
            <span className="text-xs font-bold tabular-nums mt-0.5" style={{ color: '#60a5fa' }}>+{xp} XP</span>
          </div>

          {/* Debt if missed */}
          {!quest.completed ? (
            <div className="hidden lg:flex flex-col w-28 flex-shrink-0">
              <span style={MINI_LABEL}>If missed</span>
              <span className="text-xs font-bold mt-0.5 flex items-center gap-1" style={{ color: isOverdue ? '#f87171' : '#fb923c' }}>
                +{debtAmt} pts/day
                {isOverdue && (
                  <svg className="w-3 h-3" fill="#fb923c" viewBox="0 0 24 24" aria-label="Overdue">
                    <path d="M12 2L1 21h22L12 2zm0 6l7.5 13h-15L12 8zm-1 4v4h2v-4h-2zm0 5v2h2v-2h-2z" />
                  </svg>
                )}
              </span>
            </div>
          ) : (
            <div className="hidden lg:block w-28 flex-shrink-0" />
          )}

          {/* Actions — full-width row on mobile, stacked column from sm */}
          <div className="flex flex-row sm:flex-col items-stretch gap-2 sm:gap-1 w-full sm:w-[118px] flex-shrink-0">
            <button
              onClick={() => setShowDetail(true)}
              aria-label={`Open details for "${quest.title}"`}
              className="sq-row-btn flex-1 sm:flex-none min-h-[44px] sm:min-h-0 text-xs sm:text-[11px] px-3 py-1 rounded-lg font-medium transition-all duration-150 flex items-center justify-center gap-1"
            >
              <Icon name="book" className="w-3 h-3" color="currentColor" /> Details
            </button>
            {quest.completed ? (
              isLocked ? (
                <span
                  className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 text-xs px-3 py-1.5 rounded-lg font-medium text-center flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.14)', color: '#94A3B8' }}
                >
                  <Icon name="lock" className="w-3 h-3" color="#94A3B8" /> Locked
                </span>
              ) : (
                <button
                  onClick={() => onUncomplete(quest.id)}
                  disabled={loading}
                  className="sq-row-btn flex-1 sm:flex-none min-h-[44px] sm:min-h-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-150"
                >
                  Undo
                </button>
              )
            ) : (
              <>
                <button
                  onClick={() => onComplete(quest.id)}
                  disabled={loading}
                  className="sq-btn-blue flex-[2] sm:flex-none min-h-[44px] sm:min-h-0 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all duration-150"
                >
                  {loading ? '…' : 'Complete'}
                  <span className="hidden sm:inline">{loading ? '' : ' Quest'}</span>
                </button>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={loading}
                  aria-label={`Skip "${quest.title}"`}
                  className="sq-row-btn sq-row-btn-danger flex-1 sm:flex-none min-h-[44px] sm:min-h-0 text-xs sm:text-[11px] px-3 py-1 rounded-lg font-medium transition-all duration-150"
                >
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showDetail && (
        <QuestDetailModal
          quest={quest}
          onClose={() => setShowDetail(false)}
          onUpdated={onUpdated}
          onDelete={quest.completed ? undefined : () => { setShowDetail(false); setShowConfirm(true); }}
        />
      )}

      {showConfirm && (
        <SkipConfirm
          quest={quest}
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => { setShowConfirm(false); onSkip(quest.id); }}
        />
      )}
    </>
  );
}

// ─── Quest list column header (sm and up — rows stack on mobile) ─────────────
function QuestListHeader() {
  const h = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94A3B8' };
  return (
    <div
      className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-lg mb-1.5"
      style={{ background: 'rgba(8,21,37,0.4)', border: '1px solid rgba(59,130,246,0.06)' }}
    >
      <div className="w-7 flex-shrink-0" />
      <div className="w-9 flex-shrink-0" />
      <div className="flex-1" style={h}>Quest</div>
      <div className="w-28 flex-shrink-0" style={h}>Due Date</div>
      <div className="hidden md:block w-16 flex-shrink-0" style={h}>Diff.</div>
      <div className="hidden md:block w-20 flex-shrink-0" style={h}>XP</div>
      <div className="hidden lg:block w-28 flex-shrink-0" style={h}>Debt</div>
      <div className="text-center flex-shrink-0" style={{ ...h, width: 118 }}>Actions</div>
    </div>
  );
}

// ─── Mobile stat strip (replaces the hidden sidebar below lg) ────────────────
function MobileStatStrip({ todayCount, overdueAll, completionRate, totalOwed, debtCount, streak }) {
  const chip = 'flex-shrink-0 snap-start rounded-xl px-3.5 py-2.5 min-w-[132px] min-h-[56px]';
  return (
    <div className="lg:hidden -mx-4 px-4 mb-4 overflow-x-auto no-scrollbar snap-x" aria-label="Quest stats">
      <div className="flex gap-2 w-max">
        <div className={chip} style={PANEL_STYLE}>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Due Today</p>
          <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: '#60a5fa' }}>
            {todayCount}
            {overdueAll > 0 && <span className="text-[11px] font-bold ml-1.5" style={{ color: '#f87171' }}>{overdueAll} overdue</span>}
          </p>
        </div>
        <div className={chip} style={PANEL_STYLE}>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Completion</p>
          <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: '#f8fafc' }}>{completionRate}%</p>
        </div>
        <Link
          href="/debt"
          className={chip}
          style={totalOwed > 0
            ? { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)' }
            : { background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: totalOwed > 0 ? '#fca5a5' : '#86efac' }}>Active Debt ›</p>
          <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: totalOwed > 0 ? '#f87171' : '#4ade80' }}>
            {totalOwed > 0 ? <>{totalOwed} <span className="text-[11px] font-semibold">pts · {debtCount}</span></> : 'Clear'}
          </p>
        </Link>
        <div className={chip} style={PANEL_STYLE}>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Streak</p>
          <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: '#fb923c' }}>{streak} <span className="text-[11px] font-semibold">days</span></p>
        </div>
      </div>
    </div>
  );
}

// ─── Right sidebar panels ───────────────────────────────────────────────────
function DueTodayPanel({ todayCount, pendingAll, completedAll, overdueAll }) {
  const rows = [
    { label: 'To Do',     n: pendingAll,   color: '#60a5fa' },
    { label: 'Completed', n: completedAll, color: '#4ade80' },
    { label: 'Overdue',   n: overdueAll,   color: '#f87171' },
  ];
  return (
    <div className="rounded-2xl p-4" style={PANEL_STYLE}>
      <PanelHeader icon={<Icon name="calendar" className="w-3 h-3" color="currentColor" />}>Quests Due Today</PanelHeader>
      <div className="flex items-center gap-5">
        <div className="flex flex-col items-center flex-shrink-0">
          <span
            className="text-5xl font-bold tabular-nums leading-none"
            style={{ color: '#60a5fa', textShadow: '0 0 28px rgba(59,130,246,0.6)' }}
          >
            {todayCount}
          </span>
          {overdueAll > 0 && (
            <span className="text-[11px] font-bold mt-1.5" style={{ color: '#f87171' }}>{overdueAll} overdue!</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          {rows.map(({ label, n, color }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 5px ${color}` }} />
                <span className="text-[11px]" style={{ color: '#94A3B8' }}>{label}</span>
              </div>
              <span className="text-xs font-bold tabular-nums" style={{ color }}>{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompletionRatePanel({ completionRate, completedAll, totalCount }) {
  const r = 30, cx = 38, cy = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(completionRate / 100, 1));
  return (
    <div className="rounded-2xl p-4" style={PANEL_STYLE}>
      <PanelHeader icon="◔">Completion Rate</PanelHeader>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center flex-shrink-0">
          <div className="relative">
            <svg width="76" height="76" viewBox="0 0 76 76">
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(37,99,235,0.1)" strokeWidth={7} />
              <circle
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke="#2563eb"
                strokeWidth={7}
                strokeDasharray={circ}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ filter: 'drop-shadow(0 0 8px rgba(37,99,235,0.65))', transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-base font-bold" style={{ color: '#f8fafc' }}>{completionRate}%</span>
            </div>
          </div>
          <span className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>All quests</span>
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#4ade80', boxShadow: '0 0 5px #4ade80' }} />
            <span className="text-[11px]" style={{ color: '#64748b' }}><span className="font-bold" style={{ color: '#94a3b8' }}>{completedAll}</span> completed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#475569' }} />
            <span className="text-[11px]" style={{ color: '#64748b' }}><span className="font-bold" style={{ color: '#94a3b8' }}>{totalCount}</span> total</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function XPThisWeekPanel({ quests, userLevel }) {
  const weeklyGoal = 200;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = quests
    .filter((t) => t.completed && t.completedAt && new Date(t.completedAt) >= sevenDaysAgo)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const weekXP = recent.reduce((s, t) => s + (t.xpReward ?? 50), 0);
  const pct = Math.min((weekXP / weeklyGoal) * 100, 100);

  return (
    <div className="rounded-2xl p-4" style={PANEL_STYLE}>
      <PanelHeader icon={<Icon name="bolt" className="w-3 h-3" color="currentColor" />}>XP This Week</PanelHeader>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-4xl font-bold tabular-nums leading-none" style={{ color: '#f8fafc', textShadow: '0 0 24px rgba(59,130,246,0.35)' }}>
            {weekXP} <span className="text-lg font-bold" style={{ color: '#60a5fa' }}>XP</span>
          </p>
          <p className="text-[11px] mt-1.5" style={{ color: '#94A3B8' }}>Total XP Earned · Lv {userLevel ?? 1}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#94A3B8' }}>Weekly Goal</p>
          <p className="text-xs font-bold" style={{ color: '#60a5fa' }}>{weeklyGoal} XP</p>
        </div>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(37,99,235,0.1)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#1d4ed8,#60a5fa)', boxShadow: '0 0 8px rgba(59,130,246,0.5)' }} />
      </div>
      {recent.length > 0 ? (
        <div className="space-y-1.5">
          {recent.slice(0, 2).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#475569' }} />
                <span className="text-[11px] truncate" style={{ color: '#94A3B8' }}>{t.title}</span>
              </div>
              <span className="text-[11px] font-bold flex-shrink-0" style={{ color: '#60a5fa' }}>+{t.xpReward ?? 50}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px]" style={{ color: '#94A3B8' }}>Complete quests to earn XP this week.</p>
      )}
    </div>
  );
}

function StreakPanel({ streak }) {
  const r = 30, cx = 38, cy = 38;
  const circ = 2 * Math.PI * r;
  const arc = streak > 0 ? 0.78 : 0;
  return (
    <div className="rounded-2xl p-4" style={PANEL_STYLE}>
      <PanelHeader icon={<Icon name="flame" className="w-3 h-3" color="currentColor" />} color="#fb923c">Quest Streak</PanelHeader>
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <svg width="76" height="76" viewBox="0 0 76 76">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(249,115,22,0.12)" strokeWidth={5} />
            <circle
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke="#fb923c"
              strokeWidth={5}
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - arc)}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ filter: 'drop-shadow(0 0 7px rgba(249,115,22,0.6))' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums leading-none" style={{ color: '#f8fafc' }}>{streak}</span>
            <span className="text-[11px]" style={{ color: '#94A3B8' }}>days</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold" style={{ color: '#f8fafc' }}>Keep it going!</p>
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: '#94A3B8' }}>
            {streak > 0
              ? 'Complete a quest tomorrow to extend your streak.'
              : 'Complete a quest today to start your streak!'}
          </p>
        </div>
      </div>
    </div>
  );
}

function CoinStatusPanel({ totalOwed, userCoins }) {
  const inDebt = totalOwed > 0;
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.22)' }}
    >
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>Coin Earnings</p>
      <div className="flex items-center gap-2 mb-1.5">
        <img src="/coin.png" alt="" width={16} height={16} className="w-4 h-4" />
        <p className="text-sm font-bold text-yellow-400">{userCoins ?? 0} in wallet</p>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: '#94A3B8' }}>
        {inDebt
          ? <>Log payoff actions to earn <span className="font-bold text-yellow-400">1 coin per 5 pts</span> of debt repaid.</>
          : <>You're debt-free! Every point you log now becomes a <span className="font-bold text-yellow-400">coin</span>.</>}
      </p>
    </div>
  );
}

function TipCard() {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(59,130,246,0.18)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon name="lightbulb" className="w-4 h-4" color="#3b82f6" />
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#60a5fa' }}>Pro Tip</p>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: '#94A3B8' }}>
        <span className="font-bold" style={{ color: '#cbd5e1' }}>Skipping quests adds debt</span>{' '}
        (free for {FREE_EDIT_MINUTES} min after creating). Complete your quests to stay debt-free and keep your streak!
      </p>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function Quests() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [quests, setQuests]           = useState([]);
  const [debts, setDebts]           = useState([]);
  const [streak, setStreak]         = useState(0);
  const [totalOwed, setTotalOwed]   = useState(0);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('All');
  const [diffFilter, setDiffFilter] = useState('All');
  const [sortBy, setSortBy]         = useState('dueDate');
  const [search, setSearch]         = useState('');
  const [showAddQuest, setShowAddQuest] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [notice, setNotice] = useState(null); // { tone: 'warn'|'ok'|'error', text }

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [questsRes, debtRes, streakRes] = await Promise.all([getQuests(), getDebt(), getStreak()]);
      setQuests(questsRes.data.quests);
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

  async function handleComplete(questId) {
    setActionLoading(questId);
    try {
      await completeQuest(questId);
      if (!(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)) confetti({ particleCount: 60, spread: 50, origin: { y: 0.6 }, colors: ['#2563eb', '#60a5fa', '#22c55e', '#fbbf24'] });
      loadData();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  }
  async function handleUncomplete(questId) {
    setActionLoading(questId);
    try { await uncompleteQuest(questId); loadData(); }
    catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  }
  async function handleSkip(questId) {
    setActionLoading(questId);
    try {
      const res = await deleteQuest(questId);
      const penalty = res.data?.penalty ?? 0;
      setNotice(penalty > 0
        ? { tone: 'warn', text: `Quest skipped — +${penalty} pts added to your debt.` }
        : { tone: 'ok', text: 'Quest deleted — no debt added.' });
      loadData();
    } catch (err) {
      console.error(err);
      setNotice({ tone: 'error', text: err.response?.data?.error || 'Could not skip that quest. Try again.' });
    }
    finally { setActionLoading(null); }
  }
  function handleQuestUpdated(updated) {
    setQuests((prev) => prev.map((q) => (q.id === updated.id ? { ...q, ...updated } : q)));
  }

  const now        = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const todayCount   = quests.filter((t) => { const d = new Date(t.dueDate); return !t.completed && d >= todayStart && d <= todayEnd; }).length;
  const completedAll = quests.filter((t) => t.completed).length;
  const overdueAll   = quests.filter((t) => !t.completed && new Date(t.dueDate) < now).length;
  const pendingAll   = quests.filter((t) => !t.completed).length;
  const activeCount  = quests.filter((t) => !t.completed && !t.deletedAt).length;
  const completionRate = quests.length > 0 ? Math.round((completedAll / quests.length) * 100) : 0;
  // Soft lockout: creation still works above the threshold, we just warn
  const debtIsHigh = totalOwed >= 250;

  const TABS = [
    { key: 'All',       label: 'All',       count: null },
    { key: 'Today',     label: 'Today',     count: todayCount },
    { key: 'Active',    label: 'Active',    count: activeCount },
    { key: 'Upcoming',  label: 'Upcoming',  count: null },
    { key: 'Completed', label: 'Completed', count: completedAll },
    { key: 'Overdue',   label: 'Overdue',   count: overdueAll },
  ];

  const filtered = quests
    .filter((t) => {
      const due = new Date(t.dueDate);
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (diffFilter !== 'All' && (t.difficulty ?? 'medium') !== diffFilter.toLowerCase()) return false;
      if (filter === 'All')       return !t.deletedAt;
      if (filter === 'Today')     return !t.completed && due >= todayStart && due <= todayEnd;
      if (filter === 'Active')    return !t.completed && !t.deletedAt;
      if (filter === 'Upcoming')  return !t.completed && due > now;
      if (filter === 'Completed') return t.completed;
      if (filter === 'Overdue')   return !t.completed && due < now;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'dueDate')    return new Date(a.dueDate) - new Date(b.dueDate);
      if (sortBy === 'difficulty') {
        const o = { easy: 0, medium: 1, hard: 2 };
        return (o[a.difficulty] ?? 1) - (o[b.difficulty] ?? 1);
      }
      if (sortBy === 'xp') return (b.xpReward ?? 50) - (a.xpReward ?? 50);
      return 0;
    });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050A14' }}>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Layout streak={streak}>
      <div className="flex gap-6 items-start">

        {/* ── Main content (flex-1) ───────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Hero header band with nebula glow */}
          <div
            className="relative rounded-2xl overflow-hidden mb-4 px-5 py-5"
            style={{
              background: 'linear-gradient(180deg, rgba(8,18,34,0.92) 0%, rgba(5,10,20,0.96) 100%)',
              border: '1px solid rgba(59,130,246,0.14)',
            }}
          >
            {/* Nebula glow layers */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background: [
                  'radial-gradient(ellipse 460px 110px at 58% 88%, rgba(37,99,235,0.4), transparent 70%)',
                  'radial-gradient(ellipse 240px 70px at 42% 100%, rgba(125,211,252,0.22), transparent 70%)',
                  'radial-gradient(ellipse 600px 180px at 78% 120%, rgba(29,78,216,0.32), transparent 70%)',
                  'radial-gradient(ellipse 300px 140px at 12% 0%, rgba(37,99,235,0.14), transparent 70%)',
                ].join(', '),
                filter: 'blur(1px)',
              }}
            />
            <div className="relative flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: '#f8fafc' }}>All Quests</h1>
                <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>
                  Browse and manage all your quests. Complete them to earn XP and avoid debt.
                </p>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto flex-shrink-0">
                <div className="relative hidden sm:block">
                  <input
                    type="text"
                    className="rounded-lg pl-3.5 pr-9 py-2 text-base lg:text-sm focus:outline-none transition-all duration-150"
                    style={{
                      width: 220,
                      background: 'rgba(4,10,20,0.85)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      color: '#f8fafc',
                    }}
                    placeholder="Search quests…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search quests"
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.6)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(59,130,246,0.12)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <svg
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: '#475569' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <button
                  onClick={() => setShowAddQuest(true)}
                  className="sq-btn-blue flex items-center justify-center gap-1.5 text-sm font-semibold px-4 min-h-[44px] sm:min-h-[38px] rounded-lg transition-all duration-150 flex-1 sm:flex-none"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create Quest
                </button>
              </div>
            </div>
          </div>

          <MobileStatStrip
            todayCount={todayCount}
            overdueAll={overdueAll}
            completionRate={completionRate}
            totalOwed={totalOwed}
            debtCount={debts.length}
            streak={streak}
          />

          {debtIsHigh && (
            <div className="mb-3 rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm" role="status" style={{ background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(249,115,22,0.3)', color: '#fed7aa' }}>
              <Icon name="alert" className="w-4 h-4 flex-shrink-0 mt-0.5" color="#fb923c" />
              <p className="flex-1">
                Debt is high — new quests still allowed, but clear some to stay on track.{' '}
                <Link href="/debt" className="font-semibold text-orange-300 underline underline-offset-2">Open Debt Hub</Link>
              </p>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mb-3 rounded-xl pl-4 pr-1 py-1 flex items-center gap-2 text-sm"
              style={notice.tone === 'ok'
                ? { background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)', color: '#bbf7d0' }
                : notice.tone === 'error'
                ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fecaca' }
                : { background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(249,115,22,0.3)', color: '#fed7aa' }}
            >
              <p className="flex-1 py-2">{notice.text}</p>
              <button onClick={() => setNotice(null)} aria-label="Dismiss message" className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          {/* Mobile search */}
          <div className="relative mb-3 sm:hidden">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: '#64748b' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              aria-label="Search quests"
              className="input pl-9"
              placeholder="Search quests…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filter toolbar */}
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            {/* Pill tabs */}
            <div
              role="tablist"
              aria-label="Filter quests"
              className="flex gap-1 p-1 rounded-xl overflow-x-auto no-scrollbar max-w-full"
              style={{ background: 'rgba(8,21,37,0.7)', border: '1px solid rgba(59,130,246,0.1)' }}
            >
              {TABS.map(({ key, label, count }) => {
                const active = filter === key;
                const isOverdueTab = key === 'Overdue' && count > 0;
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    role="tab"
                    aria-selected={active}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 min-h-[40px] sm:min-h-[32px] text-xs font-semibold rounded-lg transition-all duration-150"
                    style={{
                      background: active ? (isOverdueTab ? 'rgba(239,68,68,0.18)' : 'rgba(37,99,235,0.85)') : 'transparent',
                      color: active ? '#ffffff' : isOverdueTab ? '#fb923c' : '#94A3B8',
                      border: active ? `1px solid ${isOverdueTab ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.5)'}` : '1px solid transparent',
                      boxShadow: active ? (isOverdueTab ? '0 0 10px rgba(239,68,68,0.2)' : '0 0 12px rgba(37,99,235,0.35)') : 'none',
                    }}
                  >
                    {label}
                    {count !== null && (
                      <span
                        className="text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                        style={{
                          background: active ? 'rgba(255,255,255,0.18)' : isOverdueTab ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.1)',
                          color: active ? '#ffffff' : isOverdueTab ? '#fb923c' : '#94A3B8',
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Dropdowns */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative">
                <select aria-label="Filter by difficulty" value={diffFilter} onChange={(e) => setDiffFilter(e.target.value)} style={SELECT_STYLE}>
                  <option value="All">All Difficulties</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: '#475569' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="relative">
                <select aria-label="Sort quests" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={SELECT_STYLE}>
                  <option value="dueDate">Sort: Due Date</option>
                  <option value="difficulty">Sort: Difficulty</option>
                  <option value="xp">Sort: XP</option>
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: '#475569' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            <div
              className="rounded-2xl text-center py-14"
              style={{ background: 'rgba(8,21,37,0.6)', border: '1px solid rgba(59,130,246,0.1)' }}
            >
              <div className="flex justify-center mb-3"><Icon name="target" className="w-8 h-8" color="#475569" /></div>
              <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>No quests found</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                {filter !== 'All' || diffFilter !== 'All' ? 'Try changing the filters.' : 'Create your first quest to get started.'}
              </p>
              {filter === 'All' && diffFilter === 'All' && (
                <button onClick={() => setShowAddQuest(true)} className="btn-primary mt-5 text-sm min-h-[44px] px-5">
                  + Create Quest
                </button>
              )}
            </div>
          ) : (
            <div>
              <QuestListHeader />
              <div className="space-y-1.5">
                {filtered.map((quest) => (
                  <QuestCard
                    key={quest.id}
                    quest={quest}
                    onComplete={handleComplete}
                    onUncomplete={handleUncomplete}
                    onSkip={handleSkip}
                    onUpdated={handleQuestUpdated}
                    isActioning={actionLoading}
                  />
                ))}
              </div>
              {filter !== 'Completed' && completedAll > 0 && (
                <button
                  onClick={() => setFilter('Completed')}
                  className="w-full text-center text-xs font-medium min-h-[44px] py-3.5 transition-colors duration-150 text-blue-400 hover:text-blue-300"
                >
                  View completed quests →
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Right sidebar (fixed width) ────────────────────── */}
        <div className="hidden lg:flex flex-col gap-4 flex-shrink-0" style={{ width: 288 }}>
          <DueTodayPanel
            todayCount={todayCount}
            pendingAll={pendingAll}
            completedAll={completedAll}
            overdueAll={overdueAll}
          />
          <CompletionRatePanel
            completionRate={completionRate}
            completedAll={completedAll}
            totalCount={quests.length}
          />
          <XPThisWeekPanel quests={quests} userLevel={user?.level} />
          <StreakPanel streak={streak} />

          {totalOwed > 0 && (
            <div className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(248,113,113,0.8)' }}>Active Debt</p>
              <p className="text-3xl font-bold mb-0.5" style={{ color: '#f87171' }}>{totalOwed}</p>
              <p className="text-xs mb-3" style={{ color: '#94A3B8' }}>{debts.length} overdue quest{debts.length !== 1 ? 's' : ''}</p>
              <Link
                href="/pay"
                className="flex items-center justify-center gap-1.5 w-full min-h-[40px] rounded-xl text-xs font-bold text-white transition-all"
                style={{ background: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.4)' }}
              >
                <Icon name="swords" className="w-3.5 h-3.5" color="currentColor" /> Pay Debt
              </Link>
            </div>
          )}

          <CoinStatusPanel totalOwed={totalOwed} userCoins={user?.coins} />
          <TipCard />
        </div>
      </div>

      {showAddQuest && (
        <AddQuestModal
          onClose={() => setShowAddQuest(false)}
          onQuestAdded={(_quest, warning) => {
            if (warning) setNotice({ tone: 'warn', text: typeof warning === 'string' ? warning : 'Debt is high — new quests still allowed, but clear some to stay on track.' });
            recalculateDebt().catch(() => {});
            loadData();
          }}
        />
      )}
    </Layout>
  );
}
