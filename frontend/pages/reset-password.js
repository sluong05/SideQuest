import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { resetPassword } from '../lib/api';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) {
      const { token: t } = router.query;
      if (!t) {
        setError('Invalid reset link. Please request a new one.');
      } else {
        setToken(t);
      }
    }
  }, [router.isReady, router.query]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      return setError('Password must be at least 6 characters');
    }
    if (password !== confirm) {
      return setError('Passwords do not match');
    }

    setLoading(true);

    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💪</div>
          <h1 className="text-2xl font-bold text-navy-50">Pushup Debt</h1>
          <p className="text-navy-200 text-sm mt-1">Set a new password</p>
        </div>

        <div className="card">
          {success ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <h2 className="text-lg font-bold text-navy-50">Password updated</h2>
              <p className="text-navy-200 text-sm">You can now sign in with your new password.</p>
              <Link href="/login" className="btn-primary block w-full py-3 text-center">
                Sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-navy-50 mb-6">Choose a new password</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">New password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <label className="label">Confirm new password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="••••••••"
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

                <button
                  type="submit"
                  className="btn-primary w-full py-3"
                  disabled={loading || !token}
                >
                  {loading ? 'Updating...' : 'Reset password'}
                </button>
              </form>

              <p className="text-center text-navy-200 text-sm mt-6">
                <Link href="/forgot-password" className="text-amber-400 hover:text-amber-300 font-medium">
                  Request a new link
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
