import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { login } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import ParticleBackground from '../components/ParticleBackground';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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
      <ParticleBackground />
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 2L17.5 9.5L26 10.5L20 16.5L21.5 25L14 21L6.5 25L8 16.5L2 10.5L10.5 9.5L14 2Z" fill="#3B82F6" opacity="0.9"/><circle cx="14" cy="13" r="3" fill="white" opacity="0.9"/></svg><span style={{fontSize:"1.1rem",fontWeight:"bold",letterSpacing:"0.05em",color:"#F8FAFC"}}>SIDEQUEST</span></div>
          <p className="text-navy-200 text-sm mt-1">Turn procrastination into gains</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-bold text-navy-50 mb-6">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username or Email</label>
              <input
                type="text"
                className="input"
                placeholder="username or you@example.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
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
              <Link href="/signup" className="text-blue-400 hover:text-blue-300 font-medium">
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
