import { useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import ParticleBackground from './ParticleBackground';
import { Icon } from './Icons';
import { getFriendRequests, resendVerification, getUnseenNotifications, markNotificationsSeen } from '../lib/api';

function SideQuestLogo() {
  return (
    <Link href="/" className="flex items-center group flex-shrink-0">
      <img
        src="/sidequest-logo-navbar.svg"
        alt="SideQuest"
        className="h-7 w-auto group-hover:opacity-90 transition-opacity"
      />
    </Link>
  );
}

// Popup for taunts / debt bombs received while (or since last being) in the app.
// Polls unseen events every 30s and shows them once; dismiss marks them seen.
function IncomingEventsPopup({ user }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const check = () =>
      getUnseenNotifications()
        .then((r) => { if (alive && r.data.notifications.length > 0) setEvents(r.data.notifications); })
        .catch(() => {});
    check();
    const id = setInterval(check, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [user]);

  if (!user || events.length === 0) return null;

  function dismiss() {
    markNotificationsSeen(events.map((e) => e.id)).catch(() => {});
    setEvents([]);
  }

  const hasBomb = events.some((e) => e.type === 'debt_bomb');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center"
        style={{
          background: 'var(--bg-card-alt)',
          border: `1px solid ${hasBomb ? 'rgba(248,113,113,0.4)' : 'rgba(59,130,246,0.3)'}`,
        }}
      >
        <div className="text-4xl mb-2">{hasBomb ? '💣' : '📣'}</div>
        <h2 className="text-lg font-bold text-navy-50 mb-4">
          {hasBomb ? 'You have been bombed with debt!' : 'You have been taunted!'}
        </h2>
        <div className="space-y-2 mb-5 max-h-60 overflow-y-auto">
          {events.map((e) => (
            <div
              key={e.id}
              className="rounded-lg px-3 py-2.5 text-sm text-left text-navy-100"
              style={{
                background: 'rgba(15,26,46,0.8)',
                border: `1px solid ${e.type === 'debt_bomb' ? 'rgba(248,113,113,0.25)' : 'rgba(59,130,246,0.2)'}`,
              }}
            >
              <span className="mr-1.5">{e.type === 'debt_bomb' ? '💣' : '📣'}</span>
              {e.message}
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={dismiss} className="btn-secondary flex-1 min-h-[44px] text-sm">Dismiss</button>
          {hasBomb && (
            <Link href="/pay" onClick={dismiss} className="btn-primary flex-1 min-h-[44px] text-sm flex items-center justify-center">
              Pay it off
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Navigation model ─────────────────────────────────────────────────────────
// Five areas shared by the mobile tab bar and the desktop nav.
const NAV_AREAS = [
  { key: 'today',  href: '/',        label: 'Today',  icon: 'home',  match: (p) => p === '/' },
  { key: 'quests', href: '/quests',  label: 'Quests', icon: 'list',  match: (p) => p === '/quests' },
  { key: 'pay',    href: '/debt',    label: 'Pay',    icon: 'coins', match: (p) => p === '/debt' || p === '/verify-pushups' || p.startsWith('/pay') },
  { key: 'social', href: '/friends', label: 'Social', icon: 'users', match: (p) => p === '/friends' || p === '/leaderboard' || p === '/shop' || p.startsWith('/u/') },
  { key: 'me',     href: '/profile', label: 'Me',     icon: 'user',  match: (p) => p === '/profile' || p === '/progress' },
];

// Secondary destinations — always reachable from the account menu
const MENU_LINKS = [
  { href: '/friends',     label: 'Friends',     icon: 'users' },
  { href: '/leaderboard', label: 'Leaderboard', icon: 'trophy' },
  { href: '/shop',        label: 'Shop',        icon: 'gift' },
  { href: '/progress',    label: 'Progress',    icon: 'chart' },
  { href: '/profile',     label: 'Profile',     icon: 'user' },
];

function CountBadge({ n, className = '' }) {
  if (!n) return null;
  return (
    <span className={`min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ${className}`}>
      {n > 9 ? '9+' : n}
    </span>
  );
}

// Fixed bottom tab bar shown below the lg breakpoint
function MobileTabBar({ pathname, pendingCount }) {
  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 backdrop-blur-md safe-bottom"
      style={{ background: 'rgba(6,12,24,0.96)', borderTop: '1px solid rgba(59,130,246,0.15)' }}
    >
      <ul className="flex items-stretch max-w-xl mx-auto">
        {NAV_AREAS.map((area) => {
          const active = area.match(pathname);
          const badge = area.key === 'social' ? pendingCount : 0;
          return (
            <li key={area.key} className="flex-1">
              <Link
                href={area.href}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] w-full select-none"
                style={{ color: active ? '#60a5fa' : '#94a3b8', WebkitTapHighlightColor: 'transparent' }}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: '#3b82f6' }} />
                )}
                <span className="relative">
                  <Icon name={area.icon} className="w-6 h-6" color="currentColor" strokeWidth={active ? 2.1 : 1.8} />
                  {badge > 0 && <CountBadge n={badge} className="absolute -top-1.5 -right-2.5" />}
                </span>
                <span className={`text-[11px] leading-none ${active ? 'font-bold' : 'font-medium'}`}>{area.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function Layout({ children, streak = 0, showIdleModel = false, disableBackground = false }) {
  const { user, logoutUser } = useAuth();
  const router = useRouter();
  const pathname = router.pathname;
  const [pendingCount, setPendingCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [resendState, setResendState] = useState('idle');

  const showVerifyBanner = user && user.emailVerified === false && !bannerDismissed;

  async function handleResend() {
    if (resendState !== 'idle') return;
    setResendState('sending');
    try { await resendVerification(); setResendState('sent'); }
    catch { setResendState('error'); }
  }

  useEffect(() => {
    if (!user) return;
    getFriendRequests().then((r) => setPendingCount(r.data.requests.length)).catch(() => {});
  }, [user, pathname]);

  useEffect(() => {
    function handleClick(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    }
    function handleKey(e) { if (e.key === 'Escape') setMoreOpen(false); }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick, { passive: true });
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-page)' }}>
      <ParticleBackground showIdleModel={showIdleModel} disabled={disableBackground} />

      {/* Top nav */}
      <header
        className="sticky top-0 z-50 backdrop-blur-md"
        style={{
          background: 'rgba(6,12,24,0.92)',
          borderBottom: '1px solid rgba(59,130,246,0.12)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div
          className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-6"
          style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}
        >
          <SideQuestLogo />

          {user && (
            <>
              {/* Primary areas — desktop */}
              <nav aria-label="Primary" className="hidden lg:flex items-center gap-0.5 flex-1">
                {NAV_AREAS.map((area) => {
                  const active = area.match(pathname);
                  const badge = area.key === 'social' ? pendingCount : 0;
                  return (
                    <Link
                      key={area.key}
                      href={area.href}
                      aria-current={active ? 'page' : undefined}
                      className={`relative flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-lg transition-all duration-150 font-medium ${active ? '' : 'sq-nav-link'}`}
                      style={active ? { color: '#ffffff', background: 'rgba(59,130,246,0.12)' } : undefined}
                    >
                      {area.label}
                      {badge > 0 && <CountBadge n={badge} />}
                      {active && (
                        <span
                          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                          style={{ background: '#3b82f6' }}
                        />
                      )}
                    </Link>
                  );
                })}
              </nav>

              {/* Right badges */}
              <div className="flex items-center gap-2 ml-auto lg:ml-0 flex-shrink-0">
                {/* Streak */}
                <div
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-sm"
                  style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)' }}
                  aria-label={`${streak} day streak`}
                >
                  <Icon name="flame" className="w-3.5 h-3.5" color="#fb923c" />
                  <span className="font-bold text-orange-400 text-xs">{streak}</span>
                </div>

                {/* Coins */}
                <div
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-sm"
                  style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }}
                  aria-label={`${user.coins ?? 0} coins`}
                >
                  <img src="/coin.png" alt="" width={14} height={14} className="w-3.5 h-3.5" />
                  <span className="font-bold text-yellow-400 text-xs">{user.coins ?? 0}</span>
                </div>

                {/* Level + XP */}
                {user.level !== undefined && (
                  <div
                    className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}
                  >
                    <span className="text-xs font-bold text-blue-400">Lv {user.level ?? 1}</span>
                    <span className="text-[11px] text-slate-400">{user.xp ?? 0} XP</span>
                  </div>
                )}

                {/* Account menu */}
                <div className="relative" ref={moreRef}>
                  <button
                    onClick={() => setMoreOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    aria-label="Account menu"
                    className="flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-2.5 rounded-lg text-sm transition-colors"
                    style={{
                      background: moreOpen ? 'rgba(59,130,246,0.15)' : 'rgba(13,31,56,0.8)',
                      border: `1px solid ${moreOpen ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.15)'}`,
                      color: '#94a3b8',
                    }}
                  >
                    <span className="text-xs font-medium hidden lg:inline">
                      {user.username ?? user.email?.split('@')[0] ?? 'Account'}
                    </span>
                    {/* Avatar circle */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                      style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}
                    >
                      {(user.username ?? user.email ?? 'U')[0].toUpperCase()}
                    </div>
                    {pendingCount > 0 && <CountBadge n={pendingCount} className="hidden lg:flex" />}
                    <svg className={`w-3 h-3 transition-transform duration-150 ${moreOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {moreOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-56 rounded-xl shadow-2xl overflow-hidden py-1"
                      style={{ background: 'rgba(8,15,32,0.98)', border: '1px solid rgba(59,130,246,0.2)', backdropFilter: 'blur(12px)' }}
                    >
                      {MENU_LINKS.map(({ href, label, icon }) => {
                        const active = pathname === href;
                        return (
                          <Link
                            key={href}
                            href={href}
                            role="menuitem"
                            className={`flex items-center gap-3 px-4 min-h-[44px] text-sm transition-colors ${active ? '' : 'sq-nav-link'}`}
                            style={active ? { color: '#60a5fa' } : undefined}
                          >
                            <Icon name={icon} className="w-4 h-4 flex-shrink-0" color="currentColor" />
                            <span className="flex-1">{label}</span>
                            {label === 'Friends' && <CountBadge n={pendingCount} />}
                          </Link>
                        );
                      })}
                      <div className="my-1" style={{ borderTop: '1px solid rgba(59,130,246,0.1)' }} />
                      <button
                        role="menuitem"
                        onClick={logoutUser}
                        className="w-full flex items-center gap-3 text-left px-4 min-h-[44px] text-sm text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Icon name="arrowLeft" className="w-4 h-4 flex-shrink-0" color="currentColor" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Email verification banner */}
      {showVerifyBanner && (
        <div className="relative z-40 pl-4 pr-1 py-1" style={{ background: 'rgba(59,130,246,0.08)', borderBottom: '1px solid rgba(59,130,246,0.2)' }}>
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-blue-200 py-1.5 flex-1 min-w-[12rem]">
              <span className="font-semibold">Verify your email</span>
              {' — '}check your inbox to secure your SideQuest account.
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleResend}
                disabled={resendState !== 'idle'}
                className="min-h-[44px] px-3 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-60"
              >
                {resendState === 'idle' && 'Resend email'}
                {resendState === 'sending' && 'Sending…'}
                {resendState === 'sent' && '✓ Sent!'}
                {resendState === 'error' && 'Failed — try again'}
              </button>
              <button
                onClick={() => setBannerDismissed(true)}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-navy-200 transition-colors"
                aria-label="Dismiss email verification banner"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page content */}
      {/* No z-index here: page modals (z-50) must stack above the header and tab bar */}
      <main className={`relative max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 ${user ? 'main-with-tabbar' : 'pb-6'}`}>
        {children}
      </main>

      {user && <MobileTabBar pathname={pathname} pendingCount={pendingCount} />}

      <IncomingEventsPopup user={user} />
    </div>
  );
}
