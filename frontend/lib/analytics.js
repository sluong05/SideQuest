// Lightweight first-party analytics. Events go to POST /api/events (the
// backend forwards to PostHog when configured) — no client SDK.
import { trackEvent } from './api';

const ANON_KEY = 'sq_anon_id';
const ATTR_KEY = 'sq_attribution';
const INVITE_KEY = 'sq_invite';
const ONCE_PREFIX = 'sq_evt_once_';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

function isBrowser() {
  return typeof window !== 'undefined';
}

function randomId() {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getAnonId() {
  if (!isBrowser()) return undefined;
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

// First-touch attribution: stores utm_* / ref / referrer on the first visit
// only. Also remembers an invite (ref + challenge) for the current session so
// signup can attach it even if the visitor browses around first.
export function captureRef() {
  if (!isBrowser()) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const challenge = params.get('challenge');
    if (ref) {
      try {
        sessionStorage.setItem(INVITE_KEY, JSON.stringify({ ref, challenge: challenge || null }));
      } catch { /* ignore */ }
    }
    if (!localStorage.getItem(ATTR_KEY)) {
      const data = { landing: window.location.pathname, at: new Date().toISOString() };
      UTM_KEYS.forEach((k) => { const v = params.get(k); if (v) data[k] = v.slice(0, 120); });
      if (ref) data.ref = ref.slice(0, 40);
      if (document.referrer && !document.referrer.startsWith(window.location.origin)) {
        data.referrer = document.referrer.slice(0, 200);
      }
      localStorage.setItem(ATTR_KEY, JSON.stringify(data));
    }
  } catch { /* storage blocked */ }
  return getAttribution();
}

export function getAttribution() {
  if (!isBrowser()) return null;
  try {
    return JSON.parse(localStorage.getItem(ATTR_KEY) || 'null');
  } catch {
    return null;
  }
}

export function getStoredInvite() {
  if (!isBrowser()) return null;
  try {
    return JSON.parse(sessionStorage.getItem(INVITE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function storeInvite(ref, challenge) {
  if (!isBrowser() || !ref) return;
  try {
    sessionStorage.setItem(INVITE_KEY, JSON.stringify({ ref, challenge: challenge || null }));
  } catch { /* ignore */ }
}

export function clearStoredInvite() {
  if (!isBrowser()) return;
  try { sessionStorage.removeItem(INVITE_KEY); } catch { /* ignore */ }
}

export function track(name, props = {}) {
  if (!isBrowser() || !name) return Promise.resolve();
  const attr = getAttribution();
  const merged = { path: window.location.pathname, ...props };
  if (attr) {
    UTM_KEYS.forEach((k) => { if (attr[k] && merged[k] === undefined) merged[k] = attr[k]; });
    if (attr.ref && merged.ref === undefined) merged.ref = attr.ref;
  }
  return trackEvent(name, merged, getAnonId());
}

// Fire an event at most once per browser (per key).
export function trackOnce(name, props = {}, key = name) {
  if (!isBrowser()) return Promise.resolve();
  try {
    const k = ONCE_PREFIX + key;
    if (localStorage.getItem(k)) return Promise.resolve();
    localStorage.setItem(k, '1');
  } catch { /* still track */ }
  return track(name, props);
}
