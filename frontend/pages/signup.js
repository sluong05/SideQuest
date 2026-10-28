import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signupWithInvite } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import ParticleBackground from '../components/ParticleBackground';
import OAuthButtons from '../components/OAuthButtons';
import { PageMeta } from '../lib/site';
import { track, captureRef, getStoredInvite, storeInvite, clearStoredInvite } from '../lib/analytics';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function firstParam(v) {
  return Array.isArray(v) ? v[0] : v;
}

export default function Signup() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState(null); // { ref, challenge }
  const { user, loginUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push('/');
  }, [user]);

  // Invite context from the URL (?ref=&challenge=) or from /join earlier in
  // this session.
  useEffect(() => {
    if (!router.isReady) return;
    captureRef();
    const ref = firstParam(router.query.ref);
    const challenge = firstParam(router.query.challenge);
    if (ref) {
      storeInvite(ref, challenge);
      setInvite({ ref, challenge: challenge || null });
    } else {
      setInvite(getStoredInvite());
    }
    track('signup_start', { invited: !!(ref || getStoredInvite()?.ref) });
  }, [router.isReady]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const trimmedUsername = username.trim();
    if (trimmedUsername && !USERNAME_RE.test(trimmedUsername)) {
      setError('Username must be 3–20 characters: letters, numbers, or underscores');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const fields = { email: email.trim(), password, timezone };
      if (trimmedUsername) fields.username = trimmedUsername;
      if (invite?.ref) fields.ref = invite.ref;
      if (invite?.challenge) fields.challenge = invite.challenge;
      const res = await signupWithInvite(fields);
      track('signup_complete', { method: 'email', invited: !!invite?.ref, hasUsername: !!trimmedUsername });
      clearStoredInvite();
      loginUser(res.data.token, { user: res.data.user });
    } catch (err) {
      setError(err.response?.data?.error || 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy-600 relative overflow-hidden flex items-center justify-center p-4">
      <PageMeta
        title="Create your free account"
        description="Join SideQuest free. Turn goals into quests with real deadlines — miss one and pay it back with pushups, focus time or chores."
        path="/signup"
      />
      <ParticleBackground />
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/sidequest-logo.svg" alt="SideQuest" className="h-12 w-auto mx-auto mb-3" />
          <p className="text-navy-200 text-sm mt-1">Miss a deadline? You owe pushups.</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-bold text-navy-50 mb-1">Create Account</h2>
          {invite?.ref ? (
            <p className="text-sm text-blue-300 mb-5">
              <span className="font-semibold">{invite.ref}</span> invited you
              {invite.challenge ? ' to a challenge' : ''} — you'll be friends as soon as you sign up.
            </p>
          ) : (
            <p className="text-sm text-navy-300 mb-5">Free, and it takes about 20 seconds.</p>
          )}

          <div className="mb-4">
            <OAuthButtons mode="signup" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="signup-password">Password</label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-16"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
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

            <div>
              <label className="label" htmlFor="signup-username">
                Username <span className="text-navy-400 font-normal">(optional)</span>
              </label>
              <input
                id="signup-username"
                type="text"
                className="input"
                placeholder="e.g. quest_king"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                maxLength={20}
              />
              <p className="text-xs text-navy-300 mt-1">You can pick one later. Friends find you by it.</p>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Free Account'}
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
