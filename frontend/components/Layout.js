import { useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import ParticleBackground from './ParticleBackground';
import { getFriendRequests, resendVerification } from '../lib/api';

export default function Layout({ children, streak = 0, showIdleModel = false }) {
  const { user, logoutUser } = useAuth();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [resendState, setResendState] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'

  const showVerifyBanner = user && user.emailVerified === false && !bannerDismissed;

  async function handleResend() {
    if (resendState !== 'idle') return;
    setResendState('sending');
    try {
      await resendVerification();
      setResendState('sent');
    } catch {
      setResendState('error');
    }
  }

  useEffect(() => {
    if (!user) return;
    getFriendRequests()
      .then((r) => setPendingCount(r.data.requests.length))
      .catch(() => {});
  }, [user, router.pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => { setMenuOpen(false); }, [router.pathname]);

  const navLinks = [
    { href: '/',            label: 'Dashboard' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/friends',     label: 'Friends',   badge: pendingCount },
    { href: '/shop',        label: 'Shop' },
    { href: '/profile',     label: 'Profile' },
  ];

  const activeLabel = navLinks.find((l) => l.href === router.pathname)?.label;

  return (
    <div className="min-h-screen bg-navy-600 relative">
      <ParticleBackground showIdleModel={showIdleModel} />

      {/* Top bar */}
      <header className="border-b border-amber-500/20 bg-navy-800/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <img src="/logo.png" alt="Pushup Debt" className="h-10 w-auto" />
          </Link>

          {/* Right side */}
          {user && (
            <div className="flex items-center gap-3">
              {/* Streak badge */}
              <div className="flex items-center gap-1.5 bg-navy-900/80 border border-amber-500/30 px-3 py-1.5 rounded-full">
                <img src="/Streak.svg" className="w-5 h-5" />
                <span className="text-sm font-bold text-amber-400">{streak}</span>
                <span className="text-xs text-navy-200 hidden sm:inline">day streak</span>
              </div>

              {/* Coin balance */}
              <div className="flex items-center gap-1.5 bg-navy-900/80 border border-yellow-600/30 px-3 py-1.5 rounded-full">
                <img src="/Pcoin.svg" alt="coin" className="w-5 h-5" />
                <span className="text-sm font-bold text-yellow-400">{user.coins ?? 0}</span>
              </div>

              {/* Nav dropdown */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors duration-150 ${
                    menuOpen
                      ? 'bg-navy-700 border-navy-500 text-navy-50'
                      : 'bg-navy-800 border-navy-600 text-navy-200 hover:text-navy-50 hover:border-navy-500'
                  }`}
                >
                  <span>{activeLabel ?? 'Menu'}</span>
                  {pendingCount > 0 && !menuOpen && (
                    <span className="w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {pendingCount}
                    </span>
                  )}
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-44 bg-navy-800 border border-navy-600 rounded-xl shadow-xl overflow-hidden">
                    {navLinks.map((link) => {
                      const active = router.pathname === link.href;
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={`flex items-center justify-between px-4 py-2.5 text-sm transition-colors duration-100 ${
                            active
                              ? 'bg-navy-700 text-amber-400 font-semibold'
                              : 'text-navy-200 hover:bg-navy-700/60 hover:text-navy-50'
                          }`}
                        >
                          {link.label}
                          {link.badge > 0 && (
                            <span className="w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                              {link.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                    <div className="border-t border-navy-600" />
                    <button
                      onClick={logoutUser}
                      className="w-full text-left px-4 py-2.5 text-sm text-navy-300 hover:bg-navy-700/60 hover:text-red-400 transition-colors duration-100"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </header>

      {/* Email verification banner */}
      {showVerifyBanner && (
        <div className="relative z-40 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-amber-200">
              <span className="font-semibold">Verify your email</span>
              {' — '}check your inbox for a verification link to secure your account.
            </p>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={handleResend}
                disabled={resendState !== 'idle'}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-60"
              >
                {resendState === 'idle' && 'Resend email'}
                {resendState === 'sending' && 'Sending…'}
                {resendState === 'sent' && '✓ Sent!'}
                {resendState === 'error' && 'Failed — try again'}
              </button>
              <button
                onClick={() => setBannerDismissed(true)}
                className="text-navy-400 hover:text-navy-200 transition-colors"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
