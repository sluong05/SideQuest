import { useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import ParticleBackground from './ParticleBackground';
import { getFriendRequests } from '../lib/api';

export default function Layout({ children, streak = 0, showIdleModel = false }) {
  const { user, logoutUser } = useAuth();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getFriendRequests()
      .then((r) => setPendingCount(r.data.requests.length))
      .catch(() => {});
  }, [user, router.pathname]);

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
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Streak badge */}
              <div className="flex items-center gap-1.5 bg-navy-900/80 border border-amber-500/30 px-3 py-1.5 rounded-full">
                <span className="text-base">🔥</span>
                <span className="text-sm font-bold text-amber-400">{streak}</span>
                <span className="text-xs text-navy-200 hidden sm:inline">day streak</span>
              </div>

              {/* Coin balance */}
              <div className="flex items-center gap-1.5 bg-navy-900/80 border border-yellow-600/30 px-3 py-1.5 rounded-full">
                <img src="/Pcoin.svg" alt="coin" className="w-5 h-5" />
                <span className="text-sm font-bold text-yellow-400">{user.coins ?? 0}</span>
              </div>

              {/* Dashboard link */}
              <Link
                href="/"
                className={`btn-ghost text-sm hidden sm:block ${
                  router.pathname === '/' ? 'text-amber-400' : ''
                }`}
              >
                Dashboard
              </Link>

              {/* Leaderboard link */}
              <Link
                href="/leaderboard"
                className={`btn-ghost text-sm hidden sm:block ${
                  router.pathname === '/leaderboard' ? 'text-amber-400' : ''
                }`}
              >
                Leaderboard
              </Link>

              {/* Friends link */}
              <Link
                href="/friends"
                className={`btn-ghost text-sm hidden sm:block relative ${
                  router.pathname === '/friends' ? 'text-amber-400' : ''
                }`}
              >
                Friends
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </Link>

              {/* Shop link */}
              <Link
                href="/shop"
                className={`btn-ghost text-sm hidden sm:block ${
                  router.pathname === '/shop' ? 'text-amber-400' : ''
                }`}
              >
                Shop
              </Link>

              {/* Username / email — links to profile */}
              <Link
                href="/profile"
                className={`text-sm hidden md:block truncate max-w-[160px] transition-colors hover:text-amber-400 ${
                  router.pathname === '/profile' ? 'text-amber-400' : 'text-navy-300'
                }`}
              >
                {user.username || user.email}
              </Link>

              {/* Logout */}
              <button onClick={logoutUser} className="btn-ghost text-sm">
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
