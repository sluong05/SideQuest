# ⚔️ SideQuest

A productivity app where unfinished quests become debt that compounds over time. Complete your quests or pay the price — in pushups, focus time, or chores.

## Features

- **Quest management** — create one-off, daily, or weekly recurring quests with due dates
- **Quest debt** — missed deadlines generate debt: 5 pts for the first day, +5 for each additional day overdue
- **Debt levels** — Light Debt / Risky / Debt Spiral / Pushup Bankruptcy with flavor text and a "Pay X to drop to Y" goal
- **Delete penalty** — deleting an incomplete quest costs 5 pushups (confirmation required)
- **Camera-verified pushups** — MediaPipe pose detection tracks elbow angle and back position to count valid reps hands-free; anti-cheat requires holding the down position for 0.5s
- **Gesture control** — raise your hand above your shoulder and hold for 1.5 s to start/stop counting without touching the screen
- **Coin currency** — surplus pushups (done when debt is 0) earn 1 coin each; spent in the shop
- **Shop** — spend coins on items; current item: Debt Bomb (💣 50 coins) — adds 10 pushups to a friend's debt
- **Leaderboard** — ranked by quests completed in the last 7 days; filterable to friends only; shows all-time quest count and total pushups
- **Friends** — send/accept/decline friend requests by username; unsend pending requests; activity feed on dashboard; friend-only leaderboard filter
- **Challenges** — challenge friends to a quests-completed or pushups-logged competition over 3/7/14/30 days; live scores tracked
- **Streak tracking** — consecutive days with all quests completed and no unresolved debt; milestone badges at 3/7/14/30/60/100 days (earned permanently via best-ever streak)
- **Progress chart** — 14-day daily pushup bar chart on the dashboard with all-time stats
- **Public profiles** — each user has a profile at `/u/[username]` visible to anyone logged in
- **Profile page** — badges, account info, bio, avatar, change username/password, delete account
- **Push notifications** — opt-in web push for reminders (VAPID-based)
- **Email reminders** — opt-in email reminders via Resend; also used for friend request notifications and password reset

---

## Project Structure

```
sidequest/
├── backend/                  # Express API + Prisma + PostgreSQL
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema
│   │   └── migrations/       # PostgreSQL migration files
│   ├── src/
│   │   ├── index.js          # Express server entry point
│   │   ├── middleware/
│   │   │   ├── auth.js       # JWT middleware
│   │   │   └── rateLimiter.js
│   │   ├── routes/
│   │   │   ├── auth.js       # Signup / Login / Me / Change password & username / Profile
│   │   │   ├── quests.js      # CRUD + complete/uncomplete + soft-delete
│   │   │   ├── debt.js       # Debt queries
│   │   │   ├── sessions.js   # Log pushups, reduce debt, earn coins, all-time total
│   │   │   ├── streak.js     # Streak calculation + maxStreak update
│   │   │   ├── leaderboard.js
│   │   │   ├── friends.js    # Friend requests, search, feed
│   │   │   ├── challenges.js # Create, accept, decline, live scores
│   │   │   ├── users.js      # Public profile endpoint
│   │   │   ├── shop.js       # Coin shop — buy items (Debt Bomb)
│   │   │   └── push.js       # Web push subscription management
│   │   ├── jobs/
│   │   │   ├── dailyDebt.js      # Midnight cron: debt calc + recurring quest reset + cleanup
│   │   │   ├── emailReminders.js # Email reminder cron jobs
│   │   │   └── pushNotifications.js
│   │   └── lib/
│   │       ├── prisma.js     # Singleton Prisma client
│   │       └── timezone.js
│   ├── .env                  # Created from .env.example
│   └── package.json
│
├── frontend/                 # Next.js + TailwindCSS
│   ├── pages/
│   │   ├── index.js          # Dashboard (quests, debt, streak milestone, progress chart, activity feed)
│   │   ├── login.js          # Sign in (email or username)
│   │   ├── signup.js         # Create account (email + username)
│   │   ├── profile.js        # Profile: badges, account settings, change password
│   │   ├── friends.js        # Friends list, requests, search, challenges
│   │   ├── shop.js           # Coin shop
│   │   ├── leaderboard.js
│   │   ├── verify-pushups.js # Camera rep counter (mobile-friendly)
│   │   ├── welcome.js        # Landing page
│   │   ├── forgot-password.js
│   │   ├── reset-password.js
│   │   ├── offline.js
│   │   └── u/[username].js   # Public user profile
│   ├── components/
│   │   ├── Layout.js         # Top nav + wrapper (streak badge, coin balance, Shop link)
│   │   ├── QuestList.js       # Quest items with delete confirmation
│   │   ├── DebtSummary.js    # Debt display + level badge + breakdown
│   │   ├── AddQuestModal.js   # Create quest modal (with recurrence picker)
│   │   ├── ActivityFeed.js   # Friend activity feed shown on dashboard
│   │   ├── ErrorBoundary.js
│   │   └── ParticleBackground.js
│   ├── contexts/
│   │   └── AuthContext.js    # Auth state + JWT storage
│   ├── lib/
│   │   ├── api.js            # Axios API client (all endpoints)
│   │   └── usePush.js        # Web push hook
│   ├── public/
│   │   ├── manifest.json     # PWA manifest
│   │   ├── sw.js             # Service worker
│   │   └── ...
│   └── package.json
│
├── CLAUDE.md                 # Full codebase context for Claude Code sessions
├── ARCHITECTURE.md           # Architecture overview and diagram guide
├── DEPLOYMENT.md             # Railway + Vercel maintenance guide
├── DEVGUIDE.md               # Deep-dive developer guide
└── package.json              # Root: runs both servers with concurrently
```

---

## Local Development Setup

### Prerequisites

- Node.js v18+
- npm v9+
- PostgreSQL (local instance or connection string)

### 1. Clone / navigate to the project

```bash
cd sidequest
```

### 2. Install all dependencies

```bash
npm run install:all
```

### 3. Configure the backend environment

Create `backend/.env`:

```
DATABASE_URL="postgresql://your-user:your-password@localhost:5432/sidequest"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
PORT=3001
RESEND_API_KEY="your-resend-key"
FRONTEND_URL="http://localhost:3000"
VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
```

### 4. Run the database migration

```bash
cd backend
npx prisma migrate dev
```

### 5. Start the app

From the root directory:

```bash
npm run dev
```

This starts both servers concurrently:
- **Backend** → http://localhost:3001
- **Frontend** → http://localhost:3000

---

## Core Mechanics

### Debt Formula

When a quest is not completed by its due date:

```
pushups = 5 × days_overdue
```

| Days Overdue | Pushups Owed |
|---|---|
| 1 day | 5 |
| 2 days | 10 |
| 3 days | 15 |

### Debt Levels

| Total Owed | Status |
|---|---|
| 0 | Debt Free |
| 1–25 | Light Debt |
| 26–75 | Risky |
| 76–150 | Debt Spiral |
| 150+ | Pushup Bankruptcy |

Each level shows a "Pay X to drop to Y" hint to give a reachable sub-goal.

### Coin Currency

Surplus pushups (done after all debt is cleared in a session) earn **1 coin per pushup**. Coins are displayed in the nav bar and spent in the Shop.

### Shop

| Item | Cost | Effect |
|---|---|---|
| 💣 Debt Bomb | 50 coins | Adds 10 pushups to a chosen friend's debt |

### Quest Deletion Penalty

Deleting an incomplete quest costs 5 pushups. A confirmation dialog appears first. Deleting a completed quest has no penalty.

### Recurring Quests

Quests can be set to **Daily** or **Weekly** at creation. After a recurring quest is completed, it automatically resets at midnight for the next period.

### Completed Quest Retention

Completed (non-recurring) quests stay on the **All Quests** page for **7 days** so they still count toward the rolling leaderboard window. The midnight cron (`dailyDebt.js`, 00:01 UTC) then hard-deletes any whose `completedAt` is more than 7 days old, so they disappear on the first nightly run after the 7-day mark. (On the **Dashboard** a completed quest drops off after the local day it was checked off — only the All Quests view keeps it for the full week.)

### Camera-Verified Pushups

The verify-pushups page uses **MediaPipe Pose** (loaded via CDN) to:
- Track elbow angle — rep counts when angle drops below **90°** and is held for ≥ **500ms** (anti-cheat), then returns above **155°**
- Verify back position — the shoulder-to-hip line must be within **40°** of horizontal
- Gesture control — raise either wrist above the shoulder and hold for **1.5 s** to start or stop counting hands-free

### Friends & Challenges

Find friends by username. Accept/decline requests. Once connected, you can:
- View each other on the friends-only leaderboard
- Send a **Debt Bomb** from the shop
- Challenge each other to a quests-completed or pushups-logged competition over a set duration

### Streak & Badges

Counts consecutive days where all quests were completed with no unresolved debt. Milestone badges unlock at 3, 7, 14, 30, 60, and 100 days. Badges are based on `maxStreak` (your all-time best) so they're permanently earned even if your streak resets.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Create account (email, username, password, timezone) |
| POST | `/api/auth/login` | No | Login with email or username |
| GET | `/api/auth/me` | Yes | Get current user (incl. coins, totalQuestsCompleted, maxStreak) |
| PATCH | `/api/auth/username` | Yes | Set or update username |
| PATCH | `/api/auth/password` | Yes | Change password (requires current password) |
| PATCH | `/api/auth/profile` | Yes | Update bio and avatar |
| PATCH | `/api/auth/notifications` | Yes | Toggle email reminders preference |
| POST | `/api/auth/forgot-password` | No | Send password reset email |
| POST | `/api/auth/reset-password` | No | Reset password via token |
| DELETE | `/api/auth/account` | Yes | Hard-delete account and all data |
| GET | `/api/quests` | Yes | List quests (`?date=` or `?upToDate=`) |
| POST | `/api/quests` | Yes | Create quest (supports `recurrence: none\|daily\|weekly`) |
| PATCH | `/api/quests/:id/complete` | Yes | Mark quest complete |
| PATCH | `/api/quests/:id/uncomplete` | Yes | Undo quest completion |
| DELETE | `/api/quests/:id` | Yes | Soft-delete quest (5-pushup penalty if incomplete) |
| GET | `/api/debt` | Yes | List unresolved debts + total |
| POST | `/api/debt/calculate` | Yes | Trigger on-demand recalculation |
| POST | `/api/sessions` | Yes | Log pushups (drains debt; surplus earns coins) |
| GET | `/api/sessions` | Yes | Pushup history (last 30) + allTimePaid |
| GET | `/api/streak` | Yes | Current streak |
| GET | `/api/leaderboard` | Yes | All users ranked (`?friends=true` for friends-only) |
| GET | `/api/friends` | Yes | List accepted friends with stats |
| GET | `/api/friends/requests` | Yes | Pending incoming friend requests |
| GET | `/api/friends/feed` | Yes | Friend activity feed (last 7 days) |
| GET | `/api/friends/search` | Yes | Search users by username (returns pending status) |
| POST | `/api/friends/request` | Yes | Send friend request by username |
| PATCH | `/api/friends/:id/accept` | Yes | Accept incoming request |
| PATCH | `/api/friends/:id/decline` | Yes | Decline incoming request |
| DELETE | `/api/friends/:id` | Yes | Remove accepted friend or cancel sent request |
| GET | `/api/users/:username` | Yes | Public profile |
| GET | `/api/challenges` | Yes | All challenges for current user (with live scores) |
| POST | `/api/challenges` | Yes | Create a challenge |
| PATCH | `/api/challenges/:id/accept` | Yes | Accept a challenge |
| PATCH | `/api/challenges/:id/decline` | Yes | Decline a challenge |
| GET | `/api/shop/items` | Yes | List available shop items |
| POST | `/api/shop/buy` | Yes | Purchase a shop item |
| GET | `/api/push/vapid-public-key` | No | VAPID public key for push subscription |
| POST | `/api/push/subscribe` | Yes | Register push subscription |
| DELETE | `/api/push/unsubscribe` | Yes | Remove push subscription |
| GET | `/api/health` | No | Health check |

---

## Database Commands

```bash
cd backend

# Open Prisma Studio (visual DB browser)
npm run db:studio

# Create a new migration after schema changes
npx prisma migrate dev --name describe_your_change

# Apply migrations (runs automatically on Railway deploy)
npx prisma migrate deploy

# Regenerate Prisma client after schema changes
npm run db:generate
```
