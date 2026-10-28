import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { login } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import ParticleBackground from '../components/ParticleBackground';
import OAuthButtons from '../components/OAuthButtons';
import { PageMeta } from '../lib/site';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, loginUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push('/');
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await login(identifier, password, timezone);
      loginUser(res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy-600 relative overflow-hidden flex items-center justify-center p-4">
      <PageMeta
        title="Sign in"
        description="Sign in to SideQuest to check today's quests, your streak and any debt you owe."
        path="/login"
      />
      <ParticleBackground />
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/sidequest-logo.svg" alt="SideQuest" className="h-12 w-auto mx-auto mb-3" />
          <p className="text-navy-200 text-sm mt-1">Welcome back, questor</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-bold text-navy-50 mb-6">Sign In</h2>

          <div className="mb-4">
            <OAuthButtons mode="login" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username or Email</label>
              <input
                type="text"
                className="input"
                placeholder="username or you@example.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-16"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-navy-300 hover:text-navy-100 px-2 py-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center text-sm">
            <p className="text-navy-200">
              No account?{' '}
              <Link href={{ pathname: '/signup', query: router.query?.ref ? { ref: router.query.ref, ...(router.query.challenge ? { challenge: router.query.challenge } : {}) } : {} }} className="text-blue-400 hover:text-blue-300 font-medium">
                Sign up
              </Link>
            </p>
            <p>
              <Link href="/forgot-password" className="text-navy-300 hover:text-navy-100">
                Forgot your password?
              </Link>
            </p>
            <p>
              <Link href="/welcome" className="text-navy-300 hover:text-navy-100">
                ← Back to home
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
