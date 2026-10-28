require('dotenv').config();

// Fail fast if the JWT signing secret is missing or left at the example value —
// a weak/absent secret silently undermines all authentication.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.includes('change-this')) {
  console.error('[FATAL] JWT_SECRET is missing, too short (<32 chars), or still the example value. Set a strong random secret.');
  process.exit(1);
}

// Sentry must initialize before express/routes are loaded (no-op without SENTRY_DSN).
const sentry = require('./lib/sentry');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { startDebtCronJob } = require('./jobs/dailyDebt');
const { startEmailReminderJobs } = require('./jobs/emailReminders');
const { authLimiter, generalLimiter, eventsLimiter } = require('./middleware/rateLimiter');
const prisma = require('./lib/prisma');

const app = express();
const PORT = process.env.PORT || 3001;

// Behind Railway's reverse proxy — trust the first proxy hop so req.ip and
// express-rate-limit use the real client IP (X-Forwarded-For) instead of the
// proxy's address (which would collapse all users into one rate-limit bucket).
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin (native mobile apps) or from allowed origins
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// 512kb comfortably fits a base64 avatar (capped at ~300KB in the profile route)
// plus other JSON fields, while keeping the request body bounded against abuse.
app.use(express.json({ limit: '512kb' }));

// General rate limit on all API routes
app.use('/api', generalLimiter);

// Strict rate limit on sensitive auth endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/verify-email', authLimiter);
app.use('/api/auth/resend-verification', authLimiter);
app.use('/api/auth/apple', authLimiter);
app.use('/api/auth/google', authLimiter);
app.use('/api/events', eventsLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
const questsRouter = require('./routes/quests');
app.use('/api/quests', questsRouter);
app.use('/api/tasks', questsRouter); // legacy alias — remove once all clients use /api/quests
app.use('/api/debt', require('./routes/debt'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/streak', require('./routes/streak'));
app.use('/api/friends', require('./routes/friends').router);
app.use('/api/users', require('./routes/users'));
app.use('/api/challenges', require('./routes/challenges'));
app.use('/api/push', require('./routes/push'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/events', require('./routes/events'));

// Health check — includes a DB round-trip so the platform restarts/alerts on a
// dead database connection instead of reporting healthy.
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Health] DB check failed:', err.message);
    res.status(503).json({ status: 'error', db: 'unreachable', timestamp: new Date().toISOString() });
  }
});

// Error handling: Sentry's handler (when enabled) reports, then the final
// handler returns JSON instead of Express's HTML stack page.
sentry.setupErrorHandler(app);
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (err && err.message === 'Not allowed by CORS') return res.status(403).json({ error: 'Not allowed by CORS' });
  console.error('[Error]', err);
  return res.status(err.status || 500).json({ error: 'Server error' });
});

// Start cron jobs
startDebtCronJob();
startEmailReminderJobs();

app.listen(PORT, () => {
  console.log(`SideQuest API running on http://localhost:${PORT}`);
});
