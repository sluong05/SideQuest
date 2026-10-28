import { useEffect, useRef, useState } from 'react';
import { signInWithGoogle, signInWithApple } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { track } from '../lib/analytics';
import { SITE_URL } from '../lib/site';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID || '';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

const scriptPromises = {};
function loadScript(src) {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (scriptPromises[src]) return scriptPromises[src];
  scriptPromises[src] = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing && existing.dataset.loaded) { resolve(); return; }
    const s = existing || document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = () => { delete scriptPromises[src]; reject(new Error(`Failed to load ${src}`)); };
    if (!existing) document.head.appendChild(s);
  });
  return scriptPromises[src];
}

export function oauthEnabled() {
  return !!(GOOGLE_CLIENT_ID || APPLE_SERVICES_ID);
}

// Google + Apple sign-in. Each button renders only when its env var is set.
// On success the token is stored exactly like a password login.
export default function OAuthButtons({ mode = 'login', onError }) {
  const { loginUser } = useAuth();
  const googleRef = useRef(null);
  const [busy, setBusy] = useState(null); // 'google' | 'apple' | null
  const [error, setError] = useState('');

  function report(msg) {
    setError(msg);
    onError?.(msg);
  }

  function finish(res, provider) {
    const { token, user, isNew } = res.data || {};
    if (!token) throw new Error('No token returned');
    if (isNew) track('signup_complete', { method: provider });
    loginUser(token, { user });
  }

  // ── Google Identity Services ──────────────────────────────────────────────
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadScript(GIS_SRC)
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !googleRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: 'popup',
          callback: async (resp) => {
            if (!resp?.credential) { report('Google sign-in was cancelled.'); return; }
            setBusy('google');
            setError('');
            try {
              const res = await signInWithGoogle(resp.credential);
              finish(res, 'google');
            } catch (err) {
              report(err.response?.status === 501
                ? 'Google sign-in is not available right now.'
                : (err.response?.data?.error || 'Google sign-in failed. Please try again.'));
            } finally {
              setBusy(null);
            }
          },
        });
        const width = Math.min(googleRef.current.offsetWidth || 320, 400);
        window.google.accounts.id.renderButton(googleRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'rectangular',
          text: mode === 'signup' ? 'signup_with' : 'continue_with',
          width,
        });
      })
      .catch(() => { if (!cancelled) report('Could not load Google sign-in.'); });
    return () => { cancelled = true; };
  }, [mode]);

  // ── Sign in with Apple (JS SDK popup) ─────────────────────────────────────
  async function handleApple() {
    if (busy) return;
    setBusy('apple');
    setError('');
    try {
      await loadScript(APPLE_SRC);
      if (!window.AppleID?.auth) throw new Error('Apple SDK unavailable');
      window.AppleID.auth.init({
        clientId: APPLE_SERVICES_ID,
        scope: 'name email',
        redirectURI: `${SITE_URL}/login`,
        usePopup: true,
      });
      const data = await window.AppleID.auth.signIn();
      const idToken = data?.authorization?.id_token;
      if (!idToken) throw new Error('No identity token');
      const n = data?.user?.name;
      const fullName = n ? [n.firstName, n.lastName].filter(Boolean).join(' ') || undefined : undefined;
      const res = await signInWithApple(idToken, fullName);
      finish(res, 'apple');
    } catch (err) {
      // Popup closed by user → silent
      if (err?.error === 'popup_closed_by_user' || err?.error === 'user_cancelled_authorize') {
        setError('');
      } else if (err?.response?.status === 501) {
        report('Sign in with Apple is not available right now.');
      } else {
        report(err?.response?.data?.error || 'Apple sign-in failed. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  }

  if (!GOOGLE_CLIENT_ID && !APPLE_SERVICES_ID) return null;

  return (
    <div className="space-y-2.5">
      {APPLE_SERVICES_ID && (
        <button
          type="button"
          onClick={handleApple}
          disabled={!!busy}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-opacity"
          style={{ background: '#fff', color: '#000', opacity: busy && busy !== 'apple' ? 0.6 : 1, minHeight: 44 }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M16.37 12.62c-.02-2.3 1.88-3.4 1.97-3.46-1.07-1.57-2.74-1.78-3.33-1.8-1.42-.14-2.77.83-3.49.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.29-1.61 2.8-.41 6.94 1.16 9.21.77 1.11 1.68 2.36 2.88 2.31 1.16-.05 1.6-.75 3-.75 1.4 0 1.79.75 3.01.73 1.25-.02 2.04-1.13 2.8-2.25.88-1.29 1.24-2.54 1.26-2.6-.03-.01-2.42-.93-2.47-3.72zM14.08 5.87c.64-.78 1.07-1.85.95-2.92-.92.04-2.03.61-2.69 1.38-.59.68-1.11 1.77-.97 2.82 1.03.08 2.07-.52 2.71-1.28z" />
          </svg>
          {busy === 'apple' ? 'Connecting…' : mode === 'signup' ? 'Sign up with Apple' : 'Continue with Apple'}
        </button>
      )}
      {GOOGLE_CLIENT_ID && (
        <div className="relative" style={{ minHeight: 44 }}>
          <div ref={googleRef} className="w-full flex justify-center" />
          {busy === 'google' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-navy-800/80 text-sm text-navy-100">
              Signing in…
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
      <div className="flex items-center gap-3 py-1" aria-hidden="true">
        <div className="flex-1 h-px" style={{ background: 'rgba(59,130,246,0.15)' }} />
        <span className="text-[11px] uppercase tracking-widest text-slate-500">or</span>
        <div className="flex-1 h-px" style={{ background: 'rgba(59,130,246,0.15)' }} />
      </div>
    </div>
  );
}
