// Optional Sentry error reporting. Everything here is a no-op unless SENTRY_DSN
// is set and @sentry/node loads (it needs Node >= 20.19 / 22.12).
let Sentry = null;

if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'production',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
      sendDefaultPii: false,
    });
    console.log('[Sentry] initialized');
  } catch (err) {
    console.error('[Sentry] failed to initialize:', err.message);
    Sentry = null;
  }
}

// Register after all routes, before any custom error handler.
function setupErrorHandler(app) {
  if (Sentry && typeof Sentry.setupExpressErrorHandler === 'function') {
    Sentry.setupExpressErrorHandler(app);
  }
}

function captureException(err, context) {
  if (!Sentry) return;
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // never let reporting break the caller
  }
}

module.exports = { setupErrorHandler, captureException, isEnabled: () => !!Sentry };
