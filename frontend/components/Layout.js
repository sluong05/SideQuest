import { useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import ParticleBackground from './ParticleBackground';
import { getFriendRequests, resendVerification } from '../lib/api';

function SideQuestLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
      <svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2L17.5 9.5L26 10.5L20 16.5L21.5 25L14 21L6.5 25L8 16.5L2 10.5L10.5 9.5L14 2Z" fill="#3B82F6" opacity="0.9"/>
        <path d="M14 5L16.5 10.5L23 11.3L18.5 15.8L19.5 22L14 19L8.5 22L9.5 15.8L5 11.3L11.5 10.5L14 5Z" fill="#1d4ed8" opacity="0.6"/>
        <circle cx="14" cy="13" r="3" fill="white" opacity="0.9"/>
      </svg>
      <span className="font-bold text-base tracking-widest text-navy-50 group-hover:text-blue-400 transition-colors uppercase">
        SideQuest
      </span>
    </Link>
  );
}

const NAV_LINKS = [
  { href: '/',            label: 'Dashboard' },
  { href: '/quests',      label: 'Quests' },
  { href: '/debt',        label: 'Debt' },
  { href: '/progress',    label: 'Progress' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/shop',        label: 'Shop' },
];
const MORE_LINKS = [
  { href: '/friends', label: 'Friends' },
  { href: '/profile', label: 'Profile' },
];

export default function Layout({ children, streak = 0, showIdleModel = false }) {
  const { user, logoutUser } = useAuth();
  const router = useRouter();
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
  }, [user, router.pathname]);

  useEffect(() => {
    function handleClick(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => { setMoreOpen(false); }, [router.pathname]);

  return (
    <div className="min-h-screen bg-navy-600 relative">
      <ParticleBackground showIdleModel={showIdleModel} />

      {/* Top nav */}
      <header
        className="sticky top-0 z-50 backdrop-blur-md"
        style={{ background: 'rgba(6,12,24,0.92)', borderBottom: '1px solid rgba(59,130,246,0.12)' }}
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
          <SideQuestLogo />

          {user && (
            <>
              {/* Horizontal nav tabs — desktop */}
              <nav className="hidden lg:flex items-center gap-0.5 flex-1">
                {NAV_LINKS.map(({ href, label }) => {
                  const active = router.pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className="relative px-3.5 py-1.5 text-sm rounded-lg transition-all duration-150 font-medium"
                      style={{
                        color: active ? '#ffffff' : '#64748b',
                        background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#cbd5e1'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#64748b'; }}
                    >
                      {label}
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
                >
                  <span className="text-xs">🔥</span>
                  <span className="font-bold text-orange-400 text-xs">{streak}</span>
                </div>

                {/* Coins */}
                <div
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-sm"
                  style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }}
                >
                  <img src="/Pcoin.svg" alt="coin" className="w-3.5 h-3.5" />
                  <span className="font-bold text-yellow-400 text-xs">{user.coins ?? 0}</span>
                </div>

                {/* Level + XP */}
                {user.level !== undefined && (
                  <div
                    className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}
                  >
                    <span className="text-xs font-bold text-blue-400">Lv {user.level ?? 1}</span>
                    <span className="text-[11px] text-navy-400">{user.xp ?? 0} XP</span>
                  </div>
                )}

                {/* More / mobile menu */}
                <div className="relative" ref={moreRef}>
                  <button
                    onClick={() => setMoreOpen((o) => !o)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors"
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
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}
                    >
                      {(user.username ?? user.email ?? 'U')[0].toUpperCase()}
                    </div>
                    {pendingCount > 0 && (
                      <span className="w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {pendingCount}
                      </span>
                    )}
                    <svg className={`w-3 h-3 transition-transform duration-150 ${moreOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {moreOpen && (
                    <div
                      className="absolute right-0 mt-2 w-44 rounded-xl shadow-2xl overflow-hidden"
                      style={{ background: 'rgba(8,15,32,0.98)', border: '1px solid rgba(59,130,246,0.2)', backdropFilter: 'blur(12px)' }}
                    >
                      {/* Mobile: show all nav links */}
                      <div className="lg:hidden">
                        {NAV_LINKS.map(({ href, label }) => (
                          <Link
                            key={href}
                            href={href}
                            className="block px-4 py-2.5 text-sm transition-colors"
                            style={{ color: router.pathname === href ? '#60a5fa' : '#94a3b8' }}
                          >
                            {label}
                          </Link>
                        ))}
                        <div style={{ borderTop: '1px solid rgba(59,130,246,0.1)' }} />
                      </div>
                      {/* Always: more links */}
                      {MORE_LINKS.map(({ href, label }) => (
                        <Link
                          key={href}
                          href={href}
                          className="flex items-center justify-between px-4 py-2.5 text-sm transition-colors"
                          style={{ color: router.pathname === href ? '#60a5fa' : '#94a3b8' }}
                        >
                          {label}
                          {label === 'Friends' && pendingCount > 0 && (
                            <span className="w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                              {pendingCount}
                            </span>
                          )}
                        </Link>
                      ))}
                      <div style={{ borderTop: '1px solid rgba(59,130,246,0.1)' }} />
                      <button
                        onClick={logoutUser}
                        className="w-full text-left px-4 py-2.5 text-sm text-navy-400 hover:text-red-400 transition-colors"
                      >
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
        <div className="relative z-40 px-4 py-2" style={{ background: 'rgba(59,130,246,0.08)', borderBottom: '1px solid rgba(59,130,246,0.2)' }}>
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-blue-200">
              <span className="font-semibold">Verify your email</span>
              {' — '}check your inbox to secure your SideQuest account.
            </p>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={handleResend}
                disabled={resendState !== 'idle'}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-60"
              >
                {resendState === 'idle' && 'Resend email'}
                {resendState === 'sending' && 'Sending…'}
                {resendState === 'sent' && '✓ Sent!'}
                {resendState === 'error' && 'Failed — try again'}
              </button>
              <button onClick={() => setBannerDismissed(true)} className="text-navy-400 hover:text-navy-200 transition-colors" aria-label="Dismiss">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page content */}
      <main className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
