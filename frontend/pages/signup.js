import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signup } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import ParticleBackground from '../components/ParticleBackground';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError('Username must be 3–20 characters: letters, numbers, or underscores only');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/[a-zA-Z]/.test(password)) {
      setError('Password must contain at least one letter');
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number');
      return;
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      setError('Password must contain at least one special character');
      return;
    }

    setLoading(true);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await signup(email, username, password, timezone);
      loginUser(res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Sign up failed. Please try again.');
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
          <h2 className="text-lg font-bold text-navy-50 mb-6">Create Account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div>
              <label className="label">Username</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. pushup_king"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={20}
              />
              <p className="text-xs text-navy-300 mt-1">3–20 characters · letters, numbers, underscores</p>
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="Min. 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="label">Confirm Password</label>
              <input
                type="password"
                className="input"
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-navy-200 text-sm mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
              Sign in
            </Link>
          </p>

          <p className="text-center text-slate-400 text-xs mt-4">
            By signing up you agree to our{' '}
            <Link href="/terms" className="hover:text-navy-200 underline">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" className="hover:text-navy-200 underline">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
