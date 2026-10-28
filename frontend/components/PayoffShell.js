import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from './Layout';
import { Icon } from './Icons';
import { useAuth } from '../contexts/AuthContext';
import { getDebt, getStreak, logPayoff, startPayoffSession, trackEvent } from '../lib/api';

// Server-side per-session caps (docs/AUDIT_FIXES.md → Payoff sessions)
export const SESSION_CAPS = { wellness: 50, chores: 50, custom: 25 };
export const CUSTOM_DAILY_CAP = 100;

// Single source of truth for debt payoff methods, used by the Debt Hub,
// the /pay chooser page, and anywhere else that offers "Pay Debt".
export const PAYOFF_METHODS = [
  { id: 'fitness',  label: 'Fitness',  icon: 'dumbbell', color: '#60a5fa', bg: 'rgba(37,99,235,0.12)',  border: 'rgba(59,130,246,0.3)',  desc: 'Camera-verified reps',   rate: '1 rep = 1 pt',       href: '/verify-pushups' },
  { id: 'focus',    label: 'Focus',    icon: 'target',   color: '#34d399', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)',  desc: 'Timed deep work',        rate: '1 min = 1 pt',       href: '/pay/focus' },
  { id: 'wellness', label: 'Wellness', icon: 'heart',    color: '#4ade80', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',   desc: 'Breathe, stretch, walk', rate: '1 min = 1 pt',       href: '/pay/wellness' },
  { id: 'chores',   label: 'Chores',   icon: 'home',     color: '#fb923c', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)',  desc: 'Clean & organize',       rate: '2–12 pts per chore', href: '/pay/chores' },
  { id: 'custom',   label: 'Custom',   icon: 'pencil',   color: '#c084fc', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)',  desc: 'Make your own',          rate: 'up to 25 pts/session', href: '/pay/custom' },
];

// Shared state + submit flow for all debt payoff pages.
// submitPoints(n) logs n pts against debt via the sessions API
// (oldest debt drains first; coins awarded server-side — 1 per 5 pts of
// debt repaid, plus surplus coins when there's no debt left to pay).
// `activity` tags the session so feeds can show what kind of effort it was.
//
// Every activity needs a server session token from startPayoffSession(activity).
// The token encodes the start time, so timed activities (focus) must call
// beginSession() when the timer starts. Pass { autoStart: true } to fetch one
// on mount (untimed activities); a fresh token is fetched after each submit.
export function usePayoff(activity = 'fitness', { autoStart = false } = {}) {
  const { user, loading: authLoading, updateUser } = useAuth();
  const router = useRouter();

  const [totalOwed, setTotalOwed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { paid, remaining, coinsEarned, xpEarned } | { error }
  const [sessionError, setSessionError] = useState('');
  const tokenRef = useRef(null);

  const beginSession = useCallback(async () => {
    setSessionError('');
    try {
      const r = await startPayoffSession(activity);
      tokenRef.current = r.data.sessionToken;
      return tokenRef.current;
    } catch (err) {
      tokenRef.current = null;
      const msg = err.response?.data?.error || 'Could not start a session — check your connection and try again.';
      setSessionError(msg);
      return null;
    }
  }, [activity]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    Promise.all([getDebt(), getStreak()])
      .then(([d, s]) => {
        setTotalOwed(d.data.totalOwed);
        setStreak(s.data.streak);
      })
      .catch(() => {});
  }, [user]);

  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn || !autoStart || tokenRef.current) return;
    beginSession();
  }, [signedIn, autoStart, beginSession]);

  async function submitPoints(points) {
    const pts = Math.floor(points);
    if (submitting || pts < 1) return;
    setSubmitting(true);
    try {
      // Untimed activities can safely fetch a token now if the mount-time one failed
      let token = tokenRef.current;
      if (!token && activity !== 'focus') token = await beginSession();
      if (!token) {
        setResult({ error: activity === 'focus'
          ? 'This focus session was not registered with the server, so it cannot be logged. Start a new session.'
          : 'Could not start a session — check your connection and try again.' });
        return;
      }
      const resp = await logPayoff(pts, activity, token);
      tokenRef.current = null; // one token per logged session
      const { totalOwed: remaining, coinsEarned = 0, xpEarned = 0, surplusCapped } = resp.data;
      setTotalOwed(remaining);
      if (coinsEarned > 0 || xpEarned > 0) {
        updateUser({ ...user, coins: (user.coins ?? 0) + coinsEarned, xp: (user.xp ?? 0) + xpEarned });
      }
      setResult({ paid: pts, remaining, coinsEarned, xpEarned, surplusCapped });
      trackEvent('payoff_logged', { activity, amount: pts });
      if (autoStart) beginSession(); // ready for the next one
    } catch (err) {
      setResult({ error: err.response?.data?.error || 'Failed to log progress. Try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return { user, authLoading, totalOwed, streak, submitting, result, setResult, submitPoints, beginSession, sessionError };
}

// Page chrome: back link, icon + title header, debt pill, centered column.
export function PayoffShell({ user, authLoading, streak, totalOwed, icon, color, title, subtitle, sessionError, children }) {
  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050A14' }}>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Layout streak={streak}>
      <div className="max-w-3xl mx-auto">
        <Link
          href="/debt"
          className="sq-link-muted inline-flex items-center gap-1.5 min-h-[44px] text-xs font-semibold transition-colors mb-2"
        >
          <Icon name="arrowLeft" className="w-3.5 h-3.5" color="currentColor" />
          Back to Debt Hub
        </Link>

        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: color.bg,
                border: `1px solid ${color.border}`,
                boxShadow: `0 0 18px ${color.glow}`,
              }}
            >
              <Icon name={icon} className="w-6 h-6" color={color.main} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f8fafc' }}>{title}</h1>
              <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>{subtitle}</p>
            </div>
          </div>
          <div
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl flex-shrink-0"
            style={totalOwed > 0
              ? { background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)' }
              : { background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)' }
            }
          >
            <Icon name={totalOwed > 0 ? 'clock' : 'check'} className="w-4 h-4" color={totalOwed > 0 ? '#f87171' : '#4ade80'} />
            <span className="text-sm font-bold tabular-nums" style={{ color: totalOwed > 0 ? '#f87171' : '#4ade80' }}>
              {totalOwed > 0 ? `${totalOwed} pts owed` : 'Debt free'}
            </span>
          </div>
        </div>

        {sessionError && (
          <p role="alert" className="mb-4 text-xs text-red-300 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            {sessionError}
          </p>
        )}

        {children}
      </div>
    </Layout>
  );
}

// Post-submit success / error panel.
export function PayoffResult({ result, onReset }) {
  if (result.error) {
    return (
      <div className="card text-center py-10">
        <p role="alert" className="text-sm font-bold text-red-400 mb-2 px-4">{result.error}</p>
        <button onClick={onReset} className="btn-secondary mt-3 text-sm min-h-[44px] px-5">Try Again</button>
      </div>
    );
  }

  const clearedAll = result.remaining === 0;
  return (
    <div className="card text-center py-10">
      <div
        className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
        style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', boxShadow: '0 0 22px rgba(34,197,94,0.25)' }}
      >
        <Icon name="check" className="w-7 h-7" color="#4ade80" strokeWidth={2.2} />
      </div>
      <p className="text-xl font-bold mb-1" style={{ color: '#f8fafc' }}>
        −{result.paid} pts paid off
      </p>
      <p className="text-sm mb-1" style={{ color: clearedAll ? '#4ade80' : '#94a3b8' }}>
        {clearedAll ? "You're completely debt-free!" : `${result.remaining} pts still owed.`}
      </p>
      {(result.xpEarned > 0 || result.coinsEarned > 0) && (
        <div className="flex items-center justify-center gap-3 mt-2 flex-wrap">
          {result.xpEarned > 0 && (
            <span className="text-sm font-bold text-blue-400">+{result.xpEarned} XP</span>
          )}
          {result.coinsEarned > 0 && (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-yellow-400">
              <img src="/coin.png" alt="" width={16} height={16} className="w-4 h-4" />
              +{result.coinsEarned} {result.coinsEarned === 1 ? 'coin' : 'coins'}
            </span>
          )}
        </div>
      )}
      {result.surplusCapped && (
        <p className="text-[11px] mt-1.5" style={{ color: '#94A3B8' }}>Daily bonus-coin limit reached — more coins tomorrow.</p>
      )}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-6 px-4">
        <Link href="/debt" className="btn-primary text-sm min-h-[44px] px-5">Back to Debt Hub</Link>
        <button onClick={onReset} className="btn-secondary text-sm min-h-[44px] px-5">Log More</button>
      </div>
    </div>
  );
}

export function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
