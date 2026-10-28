import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import Layout from '../components/Layout';
import AddQuestModal from '../components/AddQuestModal';
import QuestDetailModal from '../components/QuestDetailModal';
import ActivityFeed from '../components/ActivityFeed';
import { useAuth } from '../contexts/AuthContext';
import { getQuests, getDebt, getStreak, getSessions, recalculateDebt, setUsername,
         getFriends, completeQuest, uncompleteQuest, deleteQuest } from '../lib/api';
import confetti from 'canvas-confetti';
import { Icon, CategoryIcon } from '../components/Icons';
import { CATEGORY_COLORS, DIFF_STYLES, timeAgo } from '../lib/questMeta';
import { WelcomeLanding } from './welcome';
import Onboarding, { hasOnboarded, markOnboarded } from '../components/Onboarding';
import ShareButton from '../components/ShareButton';
import { PageMeta, DEFAULT_TITLE, DEFAULT_DESCRIPTION, SITE_URL } from '../lib/site';
import { trackOnce } from '../lib/analytics';
import { streakShareText, levelShareText, profileLink } from '../lib/share';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MILESTONES = [3, 7, 14, 30, 60, 100];
const SHARE_MILESTONES = [7, 30, 100];
const DAY_MS = 86400000;

function isNewAccount(user) {
  if (!user?.createdAt) return false;
  return Date.now() - new Date(user.createdAt).getTime() < DAY_MS;
}

// Server `warning` may be a string or { message }.
function warningText(w) {
  if (!w) return null;
  if (typeof w === 'string') return w;
  return typeof w.message === 'string' ? w.message : null;
}

function readNum(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}
function writeNum(key, n) {
  try { localStorage.setItem(key, String(n)); } catch { /* ignore */ }
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatDue(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const questDay = new Date(date); questDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((questDay - today) / 86400000);
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (date < now) {
    return { label: dayDiff === 0 ? `Due Today · ${timeStr}` : `${Math.abs(dayDiff)}d overdue`, overdue: true };
  }
  if (dayDiff === 0) return { label: `Due Today · ${timeStr}`, overdue: false };
  if (dayDiff === 1) return { label: `Tomorrow · ${timeStr}`, overdue: false };
  return { label: `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${timeStr}`, overdue: false };
}

function formatDebtTime(total) {
  if (total === 0) return '0';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function getDebtLevelInfo(total) {
  if (total === 0) return { label: 'CLEAR',    short: 'None',   color: '#34d399', ring: '#34d399', ringBg: 'rgba(52,211,153,0.15)' };
  if (total <= 25)  return { label: 'LOW',     short: 'Low',    color: '#fbbf24', ring: '#fbbf24', ringBg: 'rgba(251,191,36,0.15)' };
  if (total <= 75)  return { label: 'MODERATE',short: 'Mod',    color: '#fb923c', ring: '#fb923c', ringBg: 'rgba(251,146,60,0.15)' };
  if (total <= 125) return { label: 'HIGH',    short: 'High',   color: '#f97316', ring: '#f97316', ringBg: 'rgba(249,115,22,0.15)' };
  if (total <= 175) return { label: 'SEVERE',  short: 'Severe', color: '#ef4444', ring: '#ef4444', ringBg: 'rgba(239,68,68,0.15)' };
  return              { label: 'CRITICAL', short: 'Crit',   color: '#c084fc', ring: '#c084fc', ringBg: 'rgba(192,132,252,0.15)' };
}

// ─── Quest Row (dashboard compact style) ─────────────────────────────────────
function DashQuestRow({ quest, onComplete, onUncomplete, onDelete, onUpdated }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [loading, setLoading] = useState(false);
  const dueInfo = formatDue(quest.dueDate);
  const catBg   = CATEGORY_COLORS[quest.category] ?? 'rgba(59,130,246,0.12)';
  const diff    = DIFF_STYLES[quest.difficulty];
  const xp      = quest.xpReward ?? 50;
  const debtAmt = quest.debtAmount ?? 5;

  const accentColor = quest.completed ? '#34d399' : dueInfo.overdue ? '#f87171' : '#3b82f6';

  async function doComplete() {
    setLoading(true);
    try {
      await onComplete(quest.id);
    } finally { setLoading(false); }
  }
  async function doUncomplete() {
    setLoading(true);
    try { await onUncomplete(quest.id); }
    finally { setLoading(false); }
  }
  async function doDelete() {
    setShowConfirm(false);
    setLoading(true);
    try { await onDelete(quest.id); }
    finally { setLoading(false); }
  }

  return (
    <>
      <div
        className={`flex items-center gap-3 py-2.5 transition-all ${quest.completed ? 'opacity-60' : ''}`}
        style={{ borderBottom: '1px solid rgba(59,130,246,0.07)' }}
      >
        {/* Left accent bar */}
        <div className="w-0.5 h-9 rounded-full flex-shrink-0" style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}80` }} />

        {/* Category icon */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: catBg }}>
          <CategoryIcon category={quest.category} className="w-4 h-4" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-tight ${quest.completed ? 'line-through text-slate-400' : 'text-white'}`}>
            {quest.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[11px] ${dueInfo.overdue && !quest.completed ? 'text-red-400' : 'text-slate-400'}`}>
              {dueInfo.label}
            </span>
            {!quest.completed && debtAmt > 0 && (
              <span className="text-[10px] text-orange-400/75 font-medium">
                DEBT IF SKIPPED: +{debtAmt} pts
              </span>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {quest.completed && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full hidden sm:inline" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' }}>
              Completed
            </span>
          )}
          {dueInfo.overdue && !quest.completed && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              Overdue
            </span>
          )}
          {diff && !quest.completed && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full hidden md:inline" style={{ background: diff.bg, border: `1px solid ${diff.border}`, color: diff.color }}>
              {diff.label}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setShowDetail(true)}
            className="text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1"
            style={{ background: 'rgba(13,31,56,0.8)', border: '1px solid rgba(59,130,246,0.15)', color: '#94a3b8' }}
            aria-label="Read quest details"
          >
            <Icon name="book" className="w-3 h-3" color="currentColor" /> <span className="hidden sm:inline">Read</span>
          </button>
          {quest.completed ? (
            <button
              onClick={doUncomplete}
              disabled={loading}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-colors text-slate-400 hover:text-navy-100"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.12)' }}
            >
              Undo
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={loading}
                className="text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all hidden sm:block"
                style={{ background: 'rgba(13,31,56,0.8)', border: '1px solid rgba(59,130,246,0.15)', color: '#94a3b8' }}
              >
                Skip Quest
              </button>
              <button
                onClick={doComplete}
                disabled={loading}
                className="text-[11px] px-2.5 py-1 rounded-lg font-semibold text-white transition-all"
                style={{ background: loading ? 'rgba(37,99,235,0.4)' : '#2563eb', border: '1px solid rgba(59,130,246,0.5)', minWidth: 88 }}
              >
                {loading ? '…' : 'Complete Quest'}
              </button>
            </>
          )}
        </div>
      </div>

      {showDetail && (
        <QuestDetailModal
          quest={quest}
          onClose={() => setShowDetail(false)}
          onUpdated={onUpdated}
        />
      )}

      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm text-center">
            <div className="flex justify-center mb-3"><Icon name="alert" className="w-9 h-9" color="#fbbf24" /></div>
            <h2 className="text-base font-bold text-navy-50 mb-2">Skip This Quest?</h2>
            <p className="text-navy-300 text-sm mb-5">
              Skipping adds <span className="text-orange-400 font-bold">{debtAmt} pts of debt</span> — free if you created it in the last 15 minutes.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={doDelete} className="flex-1 py-2 px-4 rounded-lg font-semibold text-sm text-white" style={{ background: 'rgba(239,68,68,0.8)' }}>
                Skip anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Daily Focus Card ─────────────────────────────────────────────────────────
function DailyFocusCard({ todayAtRisk, quests }) {
  const focusQuest = todayAtRisk[0] ?? quests.filter((t) => !t.completed)[0] ?? null;

  return (
    <div
      className="rounded-2xl overflow-hidden relative"
      style={{ background: 'linear-gradient(135deg, #060C18 0%, #0A1628 50%, #0d1f38 100%)', border: '1px solid rgba(59,130,246,0.2)', minHeight: 90 }}
    >
      {/* Blue glow beam */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, transparent 20%, rgba(59,130,246,0.07) 50%, rgba(59,130,246,0.18) 70%, transparent 90%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '30%', left: '30%', width: 200, height: 1, background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.6), transparent)', transform: 'rotate(-15deg)', filter: 'blur(2px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '55%', left: '20%', width: 300, height: 1, background: 'linear-gradient(90deg, transparent, rgba(96,165,250,0.4), transparent)', transform: 'rotate(-12deg)', filter: 'blur(1px)', pointerEvents: 'none' }} />

      <div className="relative z-10 flex items-center justify-between px-5 py-4 gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Daily Focus</p>
          <p className="text-sm font-semibold text-white leading-snug">
            {focusQuest ? focusQuest.title : 'All quests handled! Keep the streak alive.'}
          </p>
          {focusQuest && (
            <p className="text-xs text-slate-400 mt-0.5">
              {todayAtRisk.length > 0
                ? `${todayAtRisk.length} quest${todayAtRisk.length > 1 ? 's' : ''} at risk today`
                : 'Stay focused — complete this quest before the deadline.'}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <Link
            href={focusQuest ? `/pay/focus?quest=${focusQuest.id}` : '/quests'}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: '#2563eb', border: '1px solid rgba(59,130,246,0.5)', boxShadow: '0 0 16px rgba(59,130,246,0.3)', whiteSpace: 'nowrap' }}
          >
            {focusQuest ? <><Icon name="play" className="w-3.5 h-3.5" color="currentColor" /> Start Focus Session</> : 'View Quests'}
          </Link>
          <span className="text-[10px] text-slate-500">
            {focusQuest ? `+${focusQuest.xpReward ?? 50} XP Possible` : 'Debt-free bonus!'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Debt Overview Panel (right sidebar) ────────────────────────────────────
function DebtOverviewPanel({ totalOwed, debts }) {
  const level = getDebtLevelInfo(totalOwed);
  const radius = 52;
  const cx = 64, cy = 64;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(totalOwed / 250, 1);
  const dashoffset = circumference * (1 - ratio);
  const timeStr = totalOwed;
  const xpReward = Math.min(Math.round(totalOwed), 999); // 1 XP per debt point repaid

  if (totalOwed === 0) {
    return (
      <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(13,31,56,0.6)', border: '1px solid rgba(52,211,153,0.2)' }}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Debt Overview</p>
        <div className="flex justify-center mb-2"><Icon name="partyPopper" className="w-9 h-9" color="#4ade80" /></div>
        <p className="text-green-400 font-bold text-sm">No Active Debt!</p>
        <p className="text-xs text-slate-400 mt-1 mb-4">Keep logging actions to earn coins.</p>
        <Link
          href="/pay"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.85), rgba(234,179,8,0.5))', border: '1px solid rgba(234,179,8,0.5)', boxShadow: '0 0 20px rgba(234,179,8,0.25)' }}
        >
          <img src="/coin.png" width={64} height={64} alt="" className="w-4 h-4" /> Log Actions for Coins
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Debt Overview</p>
        <span className="text-[10px] text-slate-500">{debts.length} active quest{debts.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Circular gauge */}
      <div className="flex flex-col items-center mb-4">
        <div className="relative">
          <svg width="128" height="128" viewBox="0 0 128 128">
            {/* Glow ring base */}
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(249,115,22,0.08)" strokeWidth={10} />
            {/* Progress ring */}
            <circle
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={level.ring}
              strokeWidth={10}
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ filter: `drop-shadow(0 0 10px ${level.ring})`, transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold leading-none text-white">{timeStr}</span>
            <span className="text-[11px] font-semibold mt-0.5 text-slate-400">pts</span>
            <span className="text-[10px] font-bold mt-0.5" style={{ color: level.color }}>{level.label}</span>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-1">Debt Level: <span style={{ color: level.color }}>{level.label}</span></p>
      </div>

      {/* CTA */}
      <Link
        href="/pay"
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold text-white mb-4"
        style={{ background: `linear-gradient(135deg, ${level.ring}dd, ${level.ring}88)`, border: `1px solid ${level.ring}60`, boxShadow: `0 0 20px ${level.ring}40` }}
      >
        <Icon name="swords" className="w-4 h-4" color="currentColor" /> Pay Down Debt
        {xpReward > 0 && <span className="text-[11px] font-bold text-yellow-300">→ +{xpReward} XP</span>}
      </Link>

      {/* Debt breakdown */}
      {debts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Debt Breakdown</p>
            <span className="text-[10px] text-slate-500">Total: {totalOwed}</span>
          </div>
          <div className="space-y-2">
            {debts.slice(0, 3).map((debt) => {
              const owed = Math.ceil(debt.amountOwed);
              const pct = Math.min((owed / Math.max(totalOwed, 1)) * 100, 100);
              return (
                <div key={debt.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {debt.quest?.category
                        ? <CategoryIcon category={debt.quest.category} className="w-3.5 h-3.5" />
                        : <Icon name="swords" className="w-3.5 h-3.5" color="#f87171" />}
                      <span className="text-xs text-navy-200 truncate max-w-[120px]">
                        {debt.quest ? debt.quest.title : 'Abandoned'}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-red-400 tabular-nums">{owed} pts</span>
                  </div>
                  <div className="w-full h-1 rounded-full" style={{ background: 'rgba(239,68,68,0.1)' }}>
                    <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${level.ring}, ${level.ring}88)` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {debts.length > 3 && (
            <Link href="/debt" className="text-[10px] text-blue-400 hover:text-blue-300 mt-2 block text-right">
              See all →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Streak & Progress Panel ──────────────────────────────────────────────────
function StreakPanel({ streak, maxStreak }) {
  const next = MILESTONES.find((m) => m > streak) ?? null;
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const today = new Date().getDay();
  const activeDays = Array.from({ length: 7 }, (_, i) => {
    const dayIdx = (i + 1) % 7;
    return streak > 0 && dayIdx <= (today === 0 ? 7 : today);
  });

  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.1)' }}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Streak &amp; Progress</p>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <Icon name="flame" className="w-6 h-6" color="#fb923c" strokeWidth={2} />
          <span className="text-3xl font-bold text-orange-400 tabular-nums">{streak}</span>
        </div>
        <div className="flex-1">
          <p className="text-xs text-navy-300">day streak</p>
          {maxStreak > 0 && <p className="text-[10px] text-slate-500">Best: {maxStreak}d</p>}
        </div>
      </div>

      {/* 7-day dots */}
      <div className="flex items-center gap-1.5 mb-3">
        {dayLabels.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div
              className="w-5 h-5 rounded-full"
              style={{
                background: activeDays[i] && streak > 0 ? 'linear-gradient(135deg, #f97316, #fb923c)' : 'rgba(13,31,56,0.8)',
                border: `1px solid ${activeDays[i] && streak > 0 ? 'rgba(249,115,22,0.5)' : 'rgba(59,130,246,0.1)'}`,
                boxShadow: activeDays[i] && streak > 0 ? '0 0 6px rgba(249,115,22,0.4)' : 'none',
              }}
            />
            <span className="text-[9px] text-navy-600">{d}</span>
          </div>
        ))}
      </div>

      {next && (
        <>
          <p className="text-[10px] text-slate-400 mb-1.5">
            <span className="text-orange-400 font-bold">{next - streak}</span> days to {next}-day badge
          </p>
          <div className="w-full h-1 rounded-full" style={{ background: 'rgba(249,115,22,0.1)' }}>
            <div className="h-1 rounded-full" style={{ width: `${(streak / next) * 100}%`, background: 'linear-gradient(90deg,#ea580c,#fb923c)' }} />
          </div>
        </>
      )}
      {!next && streak > 0 && (
        <p className="text-[10px] text-green-400 font-bold flex items-center gap-1">
          All milestones earned! <Icon name="trophy" className="w-3 h-3" color="#4ade80" />
        </p>
      )}
    </div>
  );
}

// ─── Coin Status Panel ────────────────────────────────────────────────────────
function DashCoinPanel({ totalOwed, coins }) {
  const inDebt = totalOwed > 0;
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.22)' }}
    >
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Coin Status</p>
      <div className="flex items-center gap-2.5 mb-1.5">
        <img src="/coin.png" width={64} height={64} alt="" className="w-5 h-5" />
        <div>
          <p className="text-sm font-bold" style={{ color: '#fbbf24' }}>{coins} Coins</p>
          <p className="text-[10px]" style={{ color: '#475569' }}>
            {inDebt ? 'Paying off debt earns coins and XP' : 'Earn 1 coin per point logged'}
          </p>
          <p className="text-[10px]" style={{ color: '#475569' }}>On-time quests earn +2 coins</p>
        </div>
      </div>
    </div>
  );
}

// ─── Recent Activity Panel ────────────────────────────────────────────────────
const SESSION_ACTIVITY_META = {
  fitness:  { label: 'Completed Pushups', icon: 'biceps', color: '#60a5fa', bg: 'rgba(59,130,246,0.12)' },
  focus:    { label: 'Focus Session',     icon: 'target', color: '#34d399', bg: 'rgba(16,185,129,0.12)' },
  wellness: { label: 'Wellness Session',  icon: 'flower', color: '#4ade80', bg: 'rgba(34,197,94,0.12)' },
  chores:   { label: 'Completed Chores',  icon: 'home',   color: '#fb923c', bg: 'rgba(249,115,22,0.12)' },
  custom:   { label: 'Custom Action',     icon: 'pencil', color: '#c084fc', bg: 'rgba(168,85,247,0.12)' },
};

function RecentActivityPanel({ sessions }) {
  if (sessions.length === 0) return null;

  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.1)' }}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Recent Activity</p>
      <div className="space-y-2.5">
        {sessions.slice(0, 4).map((s, i) => {
          const meta = SESSION_ACTIVITY_META[s.activity] ?? SESSION_ACTIVITY_META.fitness;
          return (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
                <Icon name={meta.icon} className="w-3.5 h-3.5" color={meta.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-navy-100">{meta.label}</p>
                <p className="text-[10px] text-slate-500">{timeAgo(s.date)} · {s.amount} pts</p>
              </div>
              <span className="text-xs font-bold text-green-400 flex-shrink-0">+{Math.round(s.xpEarned ?? s.amount)} XP</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const router = useRouter();

  const [quests, setQuests] = useState([]);
  const [debts, setDebts] = useState([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [allTimePaid, setAllTimePaid] = useState(0);
  const [showAddQuest, setShowAddQuest] = useState(false);
  const [debtWarning, setDebtWarning] = useState(null);
  const [lockoutThreshold, setLockoutThreshold] = useState(250);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [sharePrompt, setSharePrompt] = useState(null); // { kind: 'streak'|'level', value }
  const [dataLoading, setDataLoading] = useState(true);
  const [hasFriends, setHasFriends] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  // Logged-out visitors get the landing page rendered right here (SSR-friendly),
  // so no redirect to /welcome.

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const [questsRes, debtRes, streakRes, sessionsRes, friendsRes] = await Promise.all([
        getQuests({ upToDate: today }),
        getDebt(),
        getStreak(),
        getSessions(),
        getFriends(),
      ]);
      // Server already excludes quests completed before today, but re-filter
      // client-side so a tab left open across midnight doesn't show stale rows
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      setQuests(questsRes.data.quests.filter(
        (q) => !q.completed || (q.completedAt && new Date(q.completedAt) >= dayStart)
      ));
      setDebts(debtRes.data.debts);
      setTotalOwed(debtRes.data.totalOwed);
      if (debtRes.data.lockoutThreshold) setLockoutThreshold(debtRes.data.lockoutThreshold);
      setDebtWarning(warningText(debtRes.data.warning));
      setStreak(streakRes.data.streak);
      setSessions(sessionsRes.data.sessions);
      setAllTimePaid(sessionsRes.data.allTimePaid);
      setHasFriends(friendsRes.data.friends.length > 0);
    } catch (err) { console.error(err); }
    finally { setDataLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    recalculateDebt().catch(() => {}).finally(() => loadData());
  }, [user]);

  // First-run onboarding: new accounts (< 24h) or nobody with quests yet.
  useEffect(() => {
    if (!user || dataLoading || hasOnboarded()) return;
    const noQuests = quests.length === 0 && (user.totalQuestsCompleted ?? 0) === 0;
    if (isNewAccount(user) || noQuests) setShowOnboarding(true);
    else markOnboarded();
  }, [user?.id, dataLoading]);

  // Share prompt when a streak milestone (7/30/100) is reached.
  useEffect(() => {
    if (!user || dataLoading) return;
    const key = `sq_share_streak_${user.id}`;
    const last = readNum(key);
    const hit = [...SHARE_MILESTONES].reverse().find((m) => streak >= m);
    if (hit && hit > last) {
      writeNum(key, hit);
      setSharePrompt({ kind: 'streak', value: hit });
    }
  }, [user?.id, dataLoading, streak]);

  // Share prompt after a level-up (also catches level-ups from other devices).
  useEffect(() => {
    if (!user?.id || !user.level) return;
    const key = `sq_last_level_${user.id}`;
    const last = readNum(key);
    if (last && user.level > last) setSharePrompt({ kind: 'level', value: user.level });
    if (user.level !== last) writeNum(key, user.level);
  }, [user?.id, user?.level]);

  async function handleComplete(questId) {
    try {
      const res = await completeQuest(questId);
      confetti({ particleCount: 80, spread: 55, origin: { y: 0.6 }, colors: ['#3b82f6', '#60a5fa', '#34d399', '#fbbf24', '#fff'], scalar: 0.9 });
      if (res?.data?.leveledUp && res.data.newLevel) {
        setSharePrompt({ kind: 'level', value: res.data.newLevel });
        if (user?.id) writeNum(`sq_last_level_${user.id}`, res.data.newLevel);
      }
      loadData();
    } catch (err) { console.error(err); }
  }
  async function handleUncomplete(questId) {
    try { await uncompleteQuest(questId); loadData(); } catch (err) { console.error(err); }
  }
  async function handleDelete(questId) {
    try { await deleteQuest(questId); loadData(); } catch (err) { console.error(err); }
  }
  function handleQuestUpdated(updated) {
    setQuests((prev) => prev.map((q) => (q.id === updated.id ? { ...q, ...updated } : q)));
  }
  // AddQuestModal calls onQuestAdded(quest[, warning]); the server's soft
  // lockout warning (createQuest → { quest, warning? }) is shown as a banner.
  async function handleQuestAdded(quest, warning) {
    const w = warningText(warning || quest?.warning);
    if (w) setDebtWarning(w);
    if (user && quests.length === 0 && (user.totalQuestsCompleted ?? 0) === 0) {
      trackOnce('first_quest_created', {}, `first_quest_created_${user.id}`);
    }
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
    } finally { setUsernameSaving(false); }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const completedCount = quests.filter((t) => t.completed).length;
  const overdueCount = quests.filter((t) => !t.completed && new Date(t.dueDate) < new Date()).length;
  const completionRate = quests.length > 0 ? Math.round((completedCount / quests.length) * 100) : 0;
  const todayAtRisk = quests.filter((t) => {
    if (t.completed) return false;
    const due = new Date(t.dueDate);
    return due >= today && due <= todayEnd;
  });
  const displayName = user?.username || 'Questor';
  const greeting = isNewAccount(user) ? `Welcome, ${displayName}.` : `Welcome back, ${displayName}.`;
  const shareUrl = user?.username ? profileLink(user.username) : SITE_URL;
  const shareText = sharePrompt?.kind === 'streak' ? streakShareText(sharePrompt.value) : levelShareText(sharePrompt?.value);
  const deepInDebt = totalOwed >= lockoutThreshold;
  const sortedQuests = [...quests].sort((a, b) => {
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  if (authLoading || !user) {
    // Server-rendered marketing landing for logged-out visitors (and while auth
    // resolves); the dashboard replaces it once a session is confirmed.
    return (
      <>
        <PageMeta title={DEFAULT_TITLE} description={DEFAULT_DESCRIPTION} path="/" />
        <WelcomeLanding user={null} loading={authLoading} />
      </>
    );
  }

  return (
    <Layout streak={streak}>
      <Head>
        <title key="title">{totalOwed > 0 ? `(${totalOwed} debt) Dashboard — SideQuest` : 'Dashboard — SideQuest'}</title>
        <meta key="robots" name="robots" content="noindex" />
      </Head>

      {/* Share prompt (streak milestone / level-up) */}
      {sharePrompt && (
        <div className="card mb-5 p-4 flex items-center gap-3 flex-wrap" style={{ borderColor: 'rgba(249,115,22,0.35)', background: 'rgba(249,115,22,0.06)' }}>
          <Icon name={sharePrompt.kind === 'streak' ? 'flame' : 'arrowUpCircle'} className="w-6 h-6 flex-shrink-0" color={sharePrompt.kind === 'streak' ? '#fb923c' : '#60a5fa'} />
          <div className="flex-1 min-w-[180px]">
            <p className="text-sm font-semibold text-navy-50">
              {sharePrompt.kind === 'streak' ? `${sharePrompt.value}-day streak!` : `Level ${sharePrompt.value} reached!`}
            </p>
            <p className="text-xs text-navy-300">Nice work. Share it and get a friend to keep you honest.</p>
          </div>
          <div className="flex items-center gap-2">
            <ShareButton
              text={shareText}
              url={shareUrl}
              eventProps={{ source: `dashboard_${sharePrompt.kind}`, value: sharePrompt.value }}
              className="btn-primary text-xs py-2 px-3"
            />
            <button onClick={() => setSharePrompt(null)} className="text-xs text-slate-400 hover:text-navy-100 px-2 py-2">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Soft debt warning (quest creation is never blocked) */}
      {(deepInDebt || debtWarning) && (
        <div className="card mb-5 p-4 flex items-start gap-3 flex-wrap" style={{ borderColor: 'rgba(192,132,252,0.35)', background: 'rgba(168,85,247,0.06)' }}>
          <Icon name="alert" className="w-5 h-5 flex-shrink-0 mt-0.5" color="#c084fc" />
          <div className="flex-1 min-w-[180px]">
            <p className="text-sm font-semibold text-purple-300">You're deep in debt</p>
            <p className="text-xs text-navy-200 mt-0.5">
              {debtWarning || `You owe ${totalOwed} pts. You can still add quests — paying a little back first will make the next ones easier to keep.`}
            </p>
          </div>
          <Link href="/pay" className="btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5 flex-shrink-0">
            <Icon name="swords" className="w-3.5 h-3.5" color="currentColor" /> Pay some back
          </Link>
        </div>
      )}

      {/* Username prompt */}
      {!user?.username && (
        <div className="card mb-5 p-4" style={{ borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.05)' }}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5"><Icon name="user" className="w-5 h-5" color="#60a5fa" /></span>
            <div className="flex-1">
              <p className="text-blue-400 font-semibold text-sm">Set your username</p>
              <p className="text-navy-200 text-xs mt-0.5 mb-3">Add one to appear on the leaderboard.</p>
              <form onSubmit={handleSetUsername} className="flex gap-2 items-start">
                <div className="flex-1">
                  <input type="text" className="input py-2 text-sm" placeholder="e.g. quest_master" value={usernameInput}
                    onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(''); }} minLength={3} maxLength={20} required />
                  {usernameError && <p className="text-xs text-red-400 mt-1">{usernameError}</p>}
                </div>
                <button type="submit" disabled={usernameSaving} className="btn-primary py-2 px-4 text-sm flex-shrink-0">
                  {usernameSaving ? 'Saving…' : 'Save'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <p className="text-slate-400 text-sm mb-0.5">{todayLabel()}</p>
          <h1 className="text-2xl font-bold text-white">{greeting}</h1>
          <p className="text-slate-400 text-sm mt-0.5">Finish today's quests and keep your streak alive.</p>
        </div>
        <button
          onClick={() => setShowAddQuest(true)}
          className="btn-primary flex items-center gap-1.5 py-2.5 px-4 text-sm font-semibold flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Quest
        </button>
      </div>

      {dataLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* ── Left column ─────────────────────────────────── */}
            <div className="lg:col-span-3 space-y-4">

              {/* Today's Quests card */}
              <div className="rounded-2xl p-5" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Today's Quests</p>
                  <span className="text-xs text-slate-500">{completedCount}/{quests.length} completed</span>
                </div>

                {/* Completion bar */}
                {quests.length > 0 && (
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)' }}>
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${completionRate}%`, background: 'linear-gradient(90deg, #1d4ed8, #60a5fa)', boxShadow: '0 0 8px rgba(59,130,246,0.4)' }}
                      />
                    </div>
                    <span className="text-xs font-bold text-blue-400 tabular-nums w-8 text-right">{completionRate}%</span>
                  </div>
                )}

                {/* Quest rows */}
                {sortedQuests.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="flex justify-center mb-2"><Icon name="target" className="w-8 h-8" color="#475569" /></div>
                    <p className="text-sm font-medium text-navy-100 mb-1">No quests yet</p>
                    <p className="text-xs text-slate-400 mb-4">Add your first quest to start building momentum.</p>
                    <button onClick={() => setShowAddQuest(true)} className="btn-primary text-sm py-2 px-5">
                      + Create first quest
                    </button>
                  </div>
                ) : (
                  <div>
                    {sortedQuests.map((quest) => (
                      <DashQuestRow
                        key={quest.id}
                        quest={quest}
                        onComplete={handleComplete}
                        onUncomplete={handleUncomplete}
                        onDelete={handleDelete}
                        onUpdated={handleQuestUpdated}
                      />
                    ))}
                  </div>
                )}

                {quests.length > 0 && (
                  <div className="mt-3 flex items-center justify-between">
                    <Link href="/quests" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      View all quests →
                    </Link>
                    {overdueCount > 0 && (
                      <span className="text-xs text-red-400">{overdueCount} overdue</span>
                    )}
                  </div>
                )}
              </div>

              {/* Daily Focus card */}
              <DailyFocusCard todayAtRisk={todayAtRisk} quests={quests} />

              {/* Friend activity feed — fills left column below Daily Focus */}
              <ActivityFeed />

              {/* Stats row — inside left column */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Quests Completed', value: user?.totalQuestsCompleted ?? 0, color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)',  icon: 'checkCircle' },
                  { label: 'Debt Paid',         value: allTimePaid,                  color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)',  icon: 'biceps' },
                  { label: 'Completion Rate',   value: `${completionRate}%`,             color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)', icon: 'chart' },
                  { label: 'Level',             value: `Lv ${user?.level ?? 1}`,        color: '#f9a8d4', bg: 'rgba(249,168,212,0.1)', border: 'rgba(249,168,212,0.2)', icon: 'arrowUpCircle' },
                ].map(({ label, value, color, bg, border, icon }) => (
                  <div key={label} className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ background: bg, border: `1px solid ${border}` }}>
                    <Icon name={icon} className="w-5 h-5 flex-shrink-0" color={color} />
                    <div>
                      <p className="text-xl font-bold tabular-nums leading-tight" style={{ color }}>{value}</p>
                      <p className="text-xs font-medium mt-0.5" style={{ color: '#94a3b8' }}>{label}</p>
                    </div>
                  </div>
                ))}
              </div>

            </div>

            {/* ── Right column ─────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-4">
              <DebtOverviewPanel totalOwed={totalOwed} debts={debts} />
              <DashCoinPanel totalOwed={totalOwed} coins={user?.coins ?? 0} />
              <StreakPanel streak={streak} maxStreak={user?.maxStreak ?? 0} />
              <RecentActivityPanel sessions={sessions} />
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {showAddQuest && (
        <AddQuestModal onClose={() => setShowAddQuest(false)} onQuestAdded={handleQuestAdded} />
      )}

      {showOnboarding && (
        <Onboarding
          onClose={() => setShowOnboarding(false)}
          onCreateQuest={() => setShowAddQuest(true)}
        />
      )}
    </Layout>
  );
}
