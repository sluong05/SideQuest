require('dotenv').config();

// Fail fast if the JWT signing secret is missing or left at the example value —
// a weak/absent secret silently undermines all authentication.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.includes('change-this')) {
  console.error('[FATAL] JWT_SECRET is missing, too short (<32 chars), or still the example value. Set a strong random secret.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { startDebtCronJob } = require('./jobs/dailyDebt');
const { startEmailReminderJobs } = require('./jobs/emailReminders');
const { authLimiter, generalLimiter } = require('./middleware/rateLimiter');

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start cron jobs
startDebtCronJob();
startEmailReminderJobs();

app.listen(PORT, () => {
  console.log(`SideQuest API running on http://localhost:${PORT}`);
});
