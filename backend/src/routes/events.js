const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { track, isValidEventName, sanitizeProps, sanitizeAnonId } = require('../lib/analytics');

const router = express.Router();

// POST /api/events { name, props?, anonId? } — auth optional; always 204 for a
// well-formed event (forwarded to PostHog when POSTHOG_KEY is set).
router.post('/', optionalAuth, (req, res) => {
  const { name, props, anonId } = req.body || {};
  if (!isValidEventName(name)) {
    return res.status(400).json({ error: 'Unknown event name' });
  }
  const anon = sanitizeAnonId(anonId);
  // distinct_id = userId when signed in, else the client's anonymous id.
  const distinctId = req.userId ? String(req.userId) : anon;
  if (distinctId) {
    const properties = { ...sanitizeProps(props), source: 'client' };
    if (req.userId && anon) properties.$anon_distinct_id = anon;
    track(name, distinctId, properties);
  }
  return res.status(204).end();
});

module.exports = router;
