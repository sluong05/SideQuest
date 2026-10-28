const rateLimit = require('express-rate-limit');

// Shared Redis store when REDIS_URL is set (multiple replicas / restarts share
// counters); in-memory otherwise. Any failure to load or reach Redis degrades to
// the memory store / passes requests rather than taking the API down.
let redisClient = null;
if (process.env.REDIS_URL) {
  try {
    const { createClient } = require('redis');
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => console.error('[RateLimit] Redis error:', err.message));
    redisClient.connect().catch((err) => console.error('[RateLimit] Redis connect failed:', err.message));
  } catch (err) {
    console.error('[RateLimit] redis unavailable, using memory store:', err.message);
    redisClient = null;
  }
}

function makeStore(prefix) {
  if (!redisClient) return undefined;
  try {
    const { RedisStore } = require('rate-limit-redis');
    return new RedisStore({
      prefix: `rl:${prefix}:`,
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
  } catch (err) {
    console.error('[RateLimit] rate-limit-redis unavailable, using memory store:', err.message);
    return undefined;
  }
}

function limiter(prefix, opts) {
  const store = makeStore(prefix);
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...opts,
    ...(store ? { store, passOnStoreError: true } : {}),
  });
}

// Strict limiter for sensitive auth endpoints (login, signup, password reset)
// 10 attempts per 15 minutes per IP
const authLimiter = limiter('auth', {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again in 15 minutes' },
});

// General limiter for all other API routes
// 200 requests per minute per IP
const generalLimiter = limiter('general', {
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please slow down' },
});

// Analytics ingestion: 60 events per minute per IP.
const eventsLimiter = limiter('events', {
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many events' },
});

module.exports = { authLimiter, generalLimiter, eventsLimiter };
