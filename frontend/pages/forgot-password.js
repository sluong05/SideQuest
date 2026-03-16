import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '../lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await forgotPassword(email);
      setSubmitted(true);
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
          <p className="text-navy-200 text-sm mt-1">Reset your password</p>
        </div>

        <div className="card">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">📬</div>
              <h2 className="text-lg font-bold text-navy-50">Check your email</h2>
              <p className="text-navy-200 text-sm">
                If an account exists for <span className="text-navy-50 font-medium">{email}</span>,
                we sent a reset link. It expires in 1 hour.
              </p>
              <Link href="/login" className="text-amber-400 hover:text-amber-300 text-sm font-medium">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-navy-50 mb-2">Forgot password</h2>
              <p className="text-navy-200 text-sm mb-6">
                Enter your email and we'll send you a reset link.
              </p>

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

                {error && (
                  <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 px-3 py-2 rounded-lg">
                    {error}
                  </p>
                )}

                <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>

              <p className="text-center text-navy-200 text-sm mt-6">
                <Link href="/login" className="text-amber-400 hover:text-amber-300 font-medium">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
