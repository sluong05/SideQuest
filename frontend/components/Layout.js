import { useAuth } from '../contexts/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children, streak = 0 }) {
  const { user, logoutUser } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-navy-600">
      {/* Top bar */}
      <header className="border-b border-navy-400 bg-navy-700/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* App name */}
          <Link href="/" className="flex items-center group">
            <img src="/logo.png" alt="Pushup Debt" className="h-10 w-auto" />
          </Link>

          {/* Right side */}
          {user && (
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Streak badge */}
              <div className="flex items-center gap-1.5 bg-navy-800 px-3 py-1.5 rounded-full">
                <span className="text-base">🔥</span>
                <span className="text-sm font-semibold text-amber-400">{streak}</span>
                <span className="text-xs text-navy-200 hidden sm:inline">day streak</span>
              </div>

              {/* Leaderboard link */}
              <Link
                href="/leaderboard"
                className={`btn-ghost text-sm hidden sm:block ${
                  router.pathname === '/leaderboard' ? 'text-amber-400' : ''
                }`}
              >
                Leaderboard
              </Link>

              {/* Settings link */}
              <Link
                href="/settings"
                className={`btn-ghost text-sm hidden sm:block ${
                  router.pathname === '/settings' ? 'text-amber-400' : ''
                }`}
              >
                Settings
              </Link>

              {/* Username / email */}
              <span className="text-sm text-navy-200 hidden md:block truncate max-w-[160px]">
                {user.username || user.email}
              </span>

              {/* Logout */}
              <button onClick={logoutUser} className="btn-ghost text-sm">
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
