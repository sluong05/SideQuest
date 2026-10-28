// Server-side analytics forwarding (PostHog capture API). No-op unless
// POSTHOG_KEY is set. Never throws and never blocks the caller.
const POSTHOG_HOST = (process.env.POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');

const EVENT_NAMES = new Set([
  'landing_view', 'signup_start', 'signup_complete', 'first_quest_created',
  'quest_completed', 'first_payoff', 'payoff_logged', 'friend_added',
  'invite_sent', 'invite_accepted', 'share_clicked', 'app_store_click',
  'pause_started', 'fresh_start',
]);

const MAX_PROPS_BYTES = 4096;

function isValidEventName(name) {
  return typeof name === 'string' && EVENT_NAMES.has(name);
}

// Returns a plain, size-bounded props object (or {} for anything else).
function sanitizeProps(props) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return {};
  try {
    const json = JSON.stringify(props);
    if (json.length > MAX_PROPS_BYTES) return {};
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function sanitizeAnonId(anonId) {
  if (typeof anonId !== 'string') return null;
  const trimmed = anonId.trim();
  if (!trimmed || trimmed.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(trimmed)) return null;
  return trimmed;
}

function track(name, distinctId, properties = {}) {
  const key = process.env.POSTHOG_KEY;
  if (!key || !distinctId || typeof fetch !== 'function') return;
  const body = JSON.stringify({
    api_key: key,
    event: name,
    distinct_id: String(distinctId),
    properties: { ...properties, $lib: 'sidequest-backend' },
    timestamp: new Date().toISOString(),
  });
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(3000);
  fetch(`${POSTHOG_HOST}/capture/`, opts).catch((err) =>
    console.error('[Analytics] PostHog capture failed:', err.message)
  );
}

module.exports = { track, isValidEventName, sanitizeProps, sanitizeAnonId, EVENT_NAMES };
