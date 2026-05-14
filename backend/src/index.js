require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { startDebtCronJob } = require('./jobs/dailyDebt');
const { startEmailReminderJobs } = require('./jobs/emailReminders');
const { authLimiter, generalLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3001;

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
app.use(express.json());

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
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/debt', require('./routes/debt'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/streak', require('./routes/streak'));
app.use('/api/friends', require('./routes/friends').router);
app.use('/api/users', require('./routes/users'));
app.use('/api/challenges', require('./routes/challenges'));
app.use('/api/push', require('./routes/push'));
app.use('/api/shop', require('./routes/shop'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start cron jobs
startDebtCronJob();
startEmailReminderJobs();

app.listen(PORT, () => {
  console.log(`Pushup Debt API running on http://localhost:${PORT}`);
});
