# SideQuest — Codebase Context for Claude

Gamified self-improvement app: daily goals are "quests." Missing a quest deadline accumulates debt paid off through camera-verified pushups (or other activities) via MediaPipe Pose in the browser. Completing quests earns XP and levels up the user.

> **Rebranded from PushupDebt → SideQuest.** The folder is still named `PushupDebt/` and API routes are still `/api/tasks` internally — only user-facing copy and UI have been updated. A future migration should rename the folder and API routes to `/api/quests`.

## Migration Required After Schema Change

After pulling latest, run:
```bash
cd backend && npx prisma migrate dev --name add-quest-fields
```
This adds `category`, `difficulty`, `xpReward`, `debtType`, `debtAmount` to `Task` and `xp`, `level` to `User`.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js (Pages Router) + TailwindCSS → Vercel |
| Backend | Express.js + node-cron + Prisma ORM → Railway |
| Database | PostgreSQL (Railway prod) / SQLite (`backend/prisma/dev.db`) for local |
| Auth | JWT stored in localStorage, bcryptjs |
| Email | Resend (`noreply@pushupdebt.com`) for password reset |
| Pose detection | MediaPipe Pose v0.5 loaded from CDN (not npm) |

---

## Project Layout

```
/
├── frontend/
│   ├── pages/
│   │   ├── index.js          # Dashboard — quest rows + debt panel + Daily Focus card
│   │   ├── quests.js         # All Quests — table + sidebar stat panels
│   │   ├── debt.js           # Debt Hub — debt table + payoff method cards
│   │   ├── pay/index.js      # "Pay Off Debt" method chooser (all Pay Debt buttons land here)
│   │   ├── pay/{focus,wellness,chores,custom}.js  # Payoff activity pages (timer/checklist/free-form)
│   │   ├── verify-pushups.js # Camera rep counter (MediaPipe) — the Fitness payoff method
│   │   ├── shop.js           # Coin shop — items, inventory, recent purchases
│   │   ├── progress.js, leaderboard.js, friends.js, profile.js
│   │   ├── login.js, signup.js, welcome.js
│   ├── components/
│   │   ├── Layout.js         # Nav shell (logo, nav tabs, streak/coins/level badges)
│   │   ├── AddTaskModal.js   # Create quest — category/difficulty + date + time picker
│   │   ├── Icons.js          # Shared stroke-SVG icon set + CategoryIcon
│   │   ├── PayoffShell.js    # PAYOFF_METHODS source of truth + usePayoff hook + payoff page chrome
│   │   ├── Panel.js          # Shared sidebar panel styles (PANEL_STYLE, SELECT_STYLE, PanelHeader)
│   │   └── ActivityFeed.js   # Friend activity feed (dashboard)
│   ├── contexts/
│   │   └── AuthContext.js    # JWT load via /me, loginUser/logoutUser
│   └── lib/
│       ├── api.js            # All axios calls (typed wrappers)
│       └── questMeta.js      # Category tints, difficulty styles, timeAgo
│
└── backend/
    ├── src/
    │   ├── routes/
    │   │   ├── auth.js       # signup, login, /me, username, password, forgot/reset
    │   │   ├── tasks.js      # CRUD + complete/uncomplete (soft-delete on DELETE)
    │   │   ├── debt.js       # GET debt, POST /calculate
    │   │   ├── sessions.js   # POST log pushups (drains debt), GET last 30 + allTimePushups
    │   │   ├── streak.js     # GET streak (365-day lookback) + updates maxStreak on user
    │   │   └── leaderboard.js
    │   ├── jobs/
    │   │   └── dailyDebt.js  # calculateAndUpdateDebt() + cron
    │   ├── middleware/
    │   │   └── auth.js       # JWT verify → req.userId
    │   └── lib/
    │       └── prisma.js     # Singleton Prisma client
    └── prisma/
        └── schema.prisma
```

---

## Data Model

```prisma
User
  id, email, username (optional unique), password
  timezone String @default("UTC")           // IANA tz, auto-updated on each login
  totalTasksCompleted Int @default(0)       // lifetime counter, incremented on complete, decremented on uncomplete
  maxStreak Int @default(0)                 // all-time best streak, updated by GET /api/streak
  passwordResetToken, passwordResetExpiry
  → tasks[], pushupSessions[], pushupDebts[]

Task
  id, title, completed, recurrence (none/daily/weekly)
  dueDate DateTime   // full timestamp — user picks date + time in AddTaskModal
  completedAt, deletedAt DateTime?   // deletedAt = soft-delete (row kept for 7-day leaderboard window)
  userId
  → pushupDebt? (one optional PushupDebt)

PushupDebt
  id, taskId (nullable — null when task deleted), userId
  pushupsOwed Float, daysOverdue Int
  resolved Boolean
  → task?, user

PushupSession
  id, pushupsCompleted, date, userId
```

---

## Debt Logic (Critical — read carefully)

### Formula
`pushupsOwed = 5 × daysOverdue`

- **daysOverdue = 1** the instant `now > task.dueDate` (first 5 pushups trigger immediately)
- **daysOverdue += 1** for each local midnight that passes after the due date's calendar day

### Calendar day math (timezone-aware)
```js
// In dailyDebt.js — localCalendarDay() converts a UTC timestamp to
// the user's local calendar date using Intl.DateTimeFormat
const tz = task.user?.timezone || 'UTC';
const dueDateLocalDay = localCalendarDay(dueDate, tz);
const nowLocalDay = localCalendarDay(now, tz);
const daysOverdue = 1 + Math.floor((nowLocalDay - dueDateLocalDay) / msPerDay);
```

### Incremental updates
On subsequent runs, only new days since last stored `daysOverdue` are charged:
```js
const newDays = daysOverdue - task.pushupDebt.daysOverdue;
if (newDays > 0) pushupsOwed += 5 * newDays;
```

### When debt is calculated
1. **Nightly cron** — `00:01 UTC` daily, runs `calculateAndUpdateDebt()` for all users
2. **On-demand** — triggered on dashboard load and when a new task is added (via `POST /api/debt/calculate`)

### Recurring task reset (nightly cron only)
- `daily` → next dueDate = today at 23:59:59 UTC
- `weekly` → next dueDate = original dueDate + 7 days at 23:59:59 UTC
- Resolved debt is deleted so fresh debt can accumulate

### Task deletion penalty
Deleting an **incomplete** task costs 5 pushups:
- Frontend shows a confirmation dialog: "Deleting this task will cost you 5 pushups. Are you sure?"
- Backend: if task had existing debt, adds 5 to it and sets `taskId = null`; if no existing debt, creates a new PushupDebt with `taskId = null, pushupsOwed = 5`
- Deleting a **completed** task has no penalty

### Soft-delete behaviour
Tasks are soft-deleted (`deletedAt = now()`) instead of hard-deleted so completed tasks remain countable in the leaderboard 7-day window. The nightly cron hard-deletes:
- Completed non-recurring tasks with `completedAt < 7 days ago`
- Soft-deleted incomplete tasks (no leaderboard value, purged immediately)

All task queries (dashboard, debt accumulation, recurring reset) filter `deletedAt: null`.

### Task blocking
If `totalOwed > 249`, the frontend blocks new task creation (shows a debt-block modal).

---

## Debt Levels (frontend — `debt.js DEBT_LEVELS`, dashboard variant in `index.js getDebtLevelInfo`)

Shown as a badge next to the debt total:

| Range | Label |
|---|---|
| 0 | Clear |
| 1–25 | Light Burden |
| 26–75 | Quest Debt |
| 76–125 | Debt Spiral |
| 126–175 | Quest Bankruptcy |
| 176–249 | Critical Mass |
| 250+ | Beyond Recovery (new quest creation blocked) |

---

## Auth & Timezone Flow

- **Signup/Login**: browser sends `Intl.DateTimeFormat().resolvedOptions().timeZone` alongside credentials
- **Signup**: timezone saved on user creation
- **Login**: if detected timezone ≠ stored timezone, backend updates it (handles travel)
- **`/me`**: returns `timezone`, `totalTasksCompleted`, `maxStreak`, `createdAt` so the frontend always has them in `user`
- **Profile page** (`/profile`): displays live clock, timezone, change username/password, delete account, streak badges

---

## Frontend Key Patterns

### Navigation (Layout.js)
- Tabs: Dashboard, Quests, Debt, Progress, Leaderboard, Shop (active tab highlighted)
- Right side: streak badge, coin balance, level/XP pill, account dropdown (Friends, Profile, Logout)

### Quest due labels (`formatDue` in quests.js and index.js)
Compares `date < now` (not midnight) so time-based overdue works correctly. Two display variants:
quests.js returns two lines ("Due Today" / "Today · 3:00 PM"), index.js a single label.

### Quest skip confirmation (quests.js `QuestCard`, index.js `DashQuestRow`)
Skipping/deleting an **incomplete** quest shows a confirm modal warning it adds +debtAmount pts of debt.

### Debt payoff flow
- Every "Pay Debt" button routes to `/pay` (method chooser)
- `PAYOFF_METHODS` in components/PayoffShell.js is the single source of truth for the five methods:
  Fitness → /verify-pushups (camera), Focus/Wellness/Chores/Custom → /pay/* pages
- All payoff pages submit via `usePayoff(activity)` → POST /api/sessions (oldest debt first, surplus → coins)
- /pay/focus accepts `?quest=<id>` (from the dashboard Daily Focus card) and offers to mark that quest complete after the session

### Streak milestone card (`index.js`, right column)
Milestones: 3, 7, 14, 30, 60, 100 days. Shows:
- Progress bar toward next milestone
- "X days until your Y-day badge"
- Earned milestone pills

### Progress section (`index.js`, full-width below main grid)
- 14-day pushup bar chart (SVG, no library, today's bar highlighted orange)
- All-time stats row: total pushups, total tasks completed, current streak, member since

### Camera rep counter (`verify-pushups.js`)
- MediaPipe Pose loaded from CDN
- Elbow angle < 85° = "down" position, > 160° = "up" position
- **Anti-cheat**: must hold the down position (elbow < 90°) for ≥ 500ms before the rep can be counted — prevents bouncing. A "▼ HOLD…" badge with a fill-progress animation shows during the hold.
- Back angle < 40° = parallel (required for rep to count)
- Gesture: raise wrist above shoulder for 1.5s → start/stop counting
- Ding sound (`DingSound.mp3`) on each counted rep
- On submit: `POST /api/sessions` which drains oldest debt first

### Profile page (`/profile`)
- Avatar initial, username/email header, member since date
- **Badges section**: 6 streak milestone badges (3, 7, 14, 30, 60, 100 days) — earned state based on `user.maxStreak` (all-time best), not current streak. Locked badges shown dimmed.
- Account info, change username, change password, delete account (same as old settings page)
- Settings page (`/settings`) has been deleted — all functionality lives at `/profile`

---

## API Routes Reference

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/signup` | No | email, username, password, timezone |
| POST | `/api/auth/login` | No | identifier (email or username), password, timezone |
| GET | `/api/auth/me` | Yes | returns full user incl. timezone, totalTasksCompleted, maxStreak |
| PATCH | `/api/auth/username` | Yes | set/change username |
| PATCH | `/api/auth/password` | Yes | change password (requires old) |
| POST | `/api/auth/forgot-password` | No | sends reset email via Resend |
| POST | `/api/auth/reset-password` | No | token + new password |
| DELETE | `/api/auth/account` | Yes | hard delete all user data |
| GET | `/api/tasks` | Yes | `?date=` or `?upToDate=` filter (excludes soft-deleted) |
| POST | `/api/tasks` | Yes | title, dueDate (ISO string), recurrence |
| PATCH | `/api/tasks/:id/complete` | Yes | mark done + increment user.totalTasksCompleted |
| PATCH | `/api/tasks/:id/uncomplete` | Yes | unmark + decrement user.totalTasksCompleted |
| DELETE | `/api/tasks/:id` | Yes | soft-delete; 5-pushup penalty if incomplete |
| GET | `/api/debt` | Yes | unresolved debts + totalOwed (soft-deleted task refs nulled out) |
| POST | `/api/debt/calculate` | Yes | on-demand debt recalc for user |
| POST | `/api/sessions` | Yes | log pushups (pushupsCompleted) |
| GET | `/api/sessions` | Yes | last 30 sessions + allTimePushups aggregate |
| GET | `/api/streak` | Yes | current streak; updates user.maxStreak if new best |
| GET | `/api/leaderboard` | Yes | all users ranked; includes tasksCompleted7d + totalTasksCompleted |

---

## Local Dev

```bash
# Backend (port 3001)
cd backend && npm run dev

# Frontend (port 3000)
cd frontend && npm run dev
```

Backend `.env` needs: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `FRONTEND_URL`

For local dev, set `DATABASE_URL="file:./dev.db"` and change schema `provider` to `"sqlite"` temporarily.
