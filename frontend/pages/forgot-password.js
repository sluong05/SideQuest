import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '../lib/api';
import { Icon } from '../components/Icons';

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
          <img src="/sidequest-logo.svg" alt="SideQuest" className="h-12 w-auto mx-auto mb-3" />
          <p className="text-navy-200 text-sm mt-1">Reset your password</p>
        </div>

        <div className="card">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center"><Icon name="mail" className="w-9 h-9" color="#60a5fa" /></div>
              <h2 className="text-lg font-bold text-navy-50">Check your email</h2>
              <p className="text-navy-200 text-sm">
                If an account exists for <span className="text-navy-50 font-medium">{email}</span>,
                we sent a reset link. It expires in 1 hour.
              </p>
              <p className="text-navy-300 text-xs">
                Don't see it? Check your spam or junk folder.
              </p>
              <Link href="/login" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
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
                <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
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
