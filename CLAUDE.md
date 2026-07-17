# SideQuest — Codebase Context for Claude

Gamified self-improvement app: daily goals are "quests." Missing a quest deadline accumulates debt paid off through camera-verified pushups (or other activities) via MediaPipe Pose in the browser. Completing quests earns XP and levels up the user.

> **Rebranded from PushupDebt → SideQuest.** Code-level rename is complete: the folder is `SideQuest/`, API routes live at `/api/quests` (with `/api/tasks` kept as a legacy alias until all clients are updated), and the Prisma models are `Quest`, `Debt`, and `PayoffSession`. The models are mapped to the legacy DB tables (`Task`, `PushupDebt`, `PushupSession`) via `@@map`/`@map`, so **no database migration was needed** — physical table/column names are unchanged. Still on the old brand (infrastructure-bound): the `pushupdebt.com` domain (og tags), `noreply@pushupdebt.com` Resend sender, and `pushupdebt://` mobile deep-link scheme.

## Migration Required After Schema Change

After pulling latest, run:
```bash
cd backend && npx prisma migrate dev --name add-quest-fields
```
This adds `category`, `difficulty`, `xpReward`, `debtType`, `debtAmount` to the quests table and `xp`, `level` to `User`. (The later model renames — `Task`→`Quest` etc. — are `@@map`-only and generate no migration.)

The `20260616000000_add_quest_description` migration adds the optional `description` column to the `Task` table (`ALTER TABLE "Task" ADD COLUMN "description" TEXT`). Run `npx prisma migrate deploy` (prod) or `npx prisma migrate dev` (local) to apply it. Existing quests keep a NULL/blank description.

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
│   │   ├── AddQuestModal.js   # Create quest — category/difficulty + date + time picker
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
    │   │   ├── quests.js      # CRUD + complete/uncomplete (soft-delete on DELETE)
    │   │   ├── debt.js       # GET debt, POST /calculate
    │   │   ├── sessions.js   # POST log payoff (drains debt), GET last 30 + allTimePaid
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
  totalQuestsCompleted Int @default(0)       // lifetime counter, incremented on complete, decremented on uncomplete
  maxStreak Int @default(0)                 // all-time best streak, updated by GET /api/streak
  passwordResetToken, passwordResetExpiry
  → quests[], payoffSessions[], debts[]

Quest
  id, title, completed, recurrence (none/daily/weekly)
  description String?   // optional free-text detail; null for quests created before this field existed
  dueDate DateTime   // full timestamp — user picks date + time in AddQuestModal
  completedAt, deletedAt DateTime?   // deletedAt = soft-delete (row kept for 7-day leaderboard window)
  userId
  → debt? (one optional Debt)

Debt              // table: "PushupDebt" (@@map)
  id, questId (nullable — null when quest deleted), userId
  amountOwed Float, daysOverdue Int
  resolved Boolean
  → quest?, user

PayoffSession     // table: "PushupSession" (@@map)
  id, amount, date, userId
```

`Quest` is mapped to the legacy `"Task"` table. Renamed columns keep their old physical names via `@map` (e.g. `amountOwed` → `pushupsOwed`, `questId` → `taskId`, `amount` → `pushupsCompleted`, `totalQuestsCompleted` → `totalTasksCompleted`).

---

## Debt Logic (Critical — read carefully)

### Formula
`amountOwed = 5 × daysOverdue`

- **daysOverdue = 1** the instant `now > quest.dueDate` (first 5 pts trigger immediately)
- **daysOverdue += 1** for each local midnight that passes after the due date's calendar day

### Calendar day math (timezone-aware)
```js
// In dailyDebt.js — localCalendarDay() converts a UTC timestamp to
// the user's local calendar date using Intl.DateTimeFormat
const tz = quest.user?.timezone || 'UTC';
const dueDateLocalDay = localCalendarDay(dueDate, tz);
const nowLocalDay = localCalendarDay(now, tz);
const daysOverdue = 1 + Math.floor((nowLocalDay - dueDateLocalDay) / msPerDay);
```

### Incremental updates
On subsequent runs, only new days since last stored `daysOverdue` are charged:
```js
const newDays = daysOverdue - quest.debt.daysOverdue;
if (newDays > 0) amountOwed += 5 * newDays;
```

### When debt is calculated
1. **Nightly cron** — `00:01 UTC` daily, runs `calculateAndUpdateDebt()` for all users
2. **On-demand** — triggered on dashboard load and when a new quest is added (via `POST /api/debt/calculate`)

### Recurring quest reset (nightly cron only)
- `daily` → next dueDate = today at 23:59:59 UTC
- `weekly` → next dueDate = original dueDate + 7 days at 23:59:59 UTC
- Resolved debt is deleted so fresh debt can accumulate

### Quest deletion penalty
Deleting an **incomplete** quest costs 5 pts of debt:
- Frontend shows a confirmation modal warning it adds debt before skipping/deleting
- Backend: if quest had existing debt, adds 5 to it and sets `questId = null`; if no existing debt, creates a new Debt with `questId = null, amountOwed = 5`
- Deleting a **completed** quest has no penalty

### Soft-delete behaviour
Quests are soft-deleted (`deletedAt = now()`) instead of hard-deleted so completed quests remain countable in the leaderboard 7-day window. The nightly cron hard-deletes:
- Completed non-recurring quests with `completedAt < 7 days ago`
- Soft-deleted incomplete quests (no leaderboard value, purged immediately)

All quest queries (dashboard, debt accumulation, recurring reset) filter `deletedAt: null`.

### Quest blocking
If `totalOwed > 249`, the frontend blocks new quest creation (shows a debt-block modal).

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
- **`/me`**: returns `timezone`, `totalQuestsCompleted`, `maxStreak`, `createdAt` so the frontend always has them in `user`
- **Profile page** (`/profile`): displays live clock, timezone, change username/password, delete account, streak badges

---

## Frontend Key Patterns

### Navigation (Layout.js)
- Tabs: Dashboard, Quests, Debt, Progress, Leaderboard, Shop (active tab highlighted)
- Right side: streak badge, coin balance, level/XP pill, account dropdown (Friends, Profile, Logout)

### Quest due labels (`formatDue` in quests.js and index.js)
Compares `date < now` (not midnight) so time-based overdue works correctly. Two display variants:
quests.js returns two lines ("Due Today" / "Today · 3:00 PM"), index.js a single label.

### Quest detail / description (`components/QuestDetailModal.js`)
Every quest row (quests.js `QuestCard` + index.js `DashQuestRow`) has a "Read Quest" button that opens `QuestDetailModal` — a read-only card showing title, description, due date, status, difficulty, recurrence, XP, and debt. Inside it, an **"Edit Quest"** button flips the description into an editable textarea (**only the description is editable**); Save calls `PATCH /api/quests/:id` via `updateQuestDescription`. The optional description is also captured at creation time in `AddQuestModal` (and shown in its live preview). Pages keep their local `quests` state in sync through an `onUpdated(updatedQuest)` callback. Quests created before this feature have a blank description.

### Quest skip confirmation (quests.js `QuestCard`, index.js `DashQuestRow`)
Skipping/deleting an **incomplete** quest shows a confirm modal warning it adds +debtAmount pts of debt.

### Completion locking (one-day undo window)
A completed quest can only be un-completed on the same local day it was checked off. After local midnight:
- **Dashboard**: the quest disappears (server `?upToDate=` filter + client-side re-filter in `loadData` for tabs left open across midnight)
- **All Quests page**: row shows a "Locked" pill instead of Undo; checkbox is disabled
- **Backend**: `PATCH /api/quests/:id/uncomplete` returns 400 if `completedAt` is before the user's local midnight (timezone-aware via `localMidnightUTC`)

### Debt payoff flow
- Every "Pay Debt" button routes to `/pay` (method chooser)
- `PAYOFF_METHODS` in components/PayoffShell.js is the single source of truth for the five methods:
  Fitness → /verify-pushups (camera), Focus/Wellness/Chores/Custom → /pay/* pages
- All payoff pages submit via `usePayoff(activity)` → POST /api/sessions (oldest debt first; see Coin Economy below)
- **Payoff actions are always available, even when debt-free** — the Debt Hub method grid and dashboard panels surface them regardless of `totalOwed`, so users can log work purely to earn coins. There is no debt-gating on the activity pages themselves.
- /pay/focus accepts `?quest=<id>` (from the dashboard Daily Focus card) and offers to mark that quest complete after the session

### Coin Economy (backend `sessions.js`)
Coins are earned **only** through payoff sessions (quest completion grants XP, not coins). For each session:
- **Debt repayment** → `floor(debtRepaid / 5)` coins (1 coin per 5 pts of debt actually cleared, `debtRepaid = drainPower − remaining`)
- **Surplus** → when there's no/insufficient debt, leftover effort converts 1:1 to coins, capped at the raw amount logged (`min(remaining, floored)`)
- Total `coinsEarned = debtCoins + surplusCoins`; response also returns the `debtCoins`/`surplusCoins` breakdown
- The `payoffMultiplierActive` shop item doubles `drainPower` for debt draining (and thus can inflate `debtRepaid`); the surplus cap still uses the raw logged amount
- There is **no "coins locked while in debt"** behaviour — that older framing was removed when debt repayment started earning coins. Spending in the shop is gated only by coin balance.

### Streak milestone card (`index.js`, right column)
Milestones: 3, 7, 14, 30, 60, 100 days. Shows:
- Progress bar toward next milestone
- "X days until your Y-day badge"
- Earned milestone pills

### Progress section (`index.js`, full-width below main grid)
- 14-day pushup bar chart (SVG, no library, today's bar highlighted orange)
- All-time stats row: total pushups, total quests completed, current streak, member since

### Camera rep counter (`verify-pushups.js`)
- MediaPipe Pose loaded from CDN
- Elbow angle < 85° = "down" position, > 160° = "up" position
- **Anti-cheat**: must hold the down position (elbow < 90°) for ≥ 500ms before the rep can be counted — prevents bouncing. A "▼ HOLD…" badge with a fill-progress animation shows during the hold.
- Back angle < 40° = parallel (required for rep to count)
- **Orientation check**: wrist must be below the shoulder in the image (`wr.y > sh.y`) for either rep transition — blocks "backwards pushups" done lying on your back pressing hands upward
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
| GET | `/api/auth/me` | Yes | returns full user incl. timezone, totalQuestsCompleted, maxStreak |
| PATCH | `/api/auth/username` | Yes | set/change username |
| PATCH | `/api/auth/password` | Yes | change password (requires old) |
| POST | `/api/auth/forgot-password` | No | sends reset email via Resend |
| POST | `/api/auth/reset-password` | No | token + new password |
| DELETE | `/api/auth/account` | Yes | hard delete all user data |
| GET | `/api/quests` | Yes | `?date=` or `?upToDate=` filter (excludes soft-deleted) |
| POST | `/api/quests` | Yes | title, description (optional), dueDate (ISO string), recurrence |
| PATCH | `/api/quests/:id` | Yes | edit quest description only (other fields ignored) |
| PATCH | `/api/quests/:id/complete` | Yes | mark done + increment user.totalQuestsCompleted |
| PATCH | `/api/quests/:id/uncomplete` | Yes | unmark + decrement user.totalQuestsCompleted; rejected (400) if completed on a previous local day — completions lock at local midnight |
| DELETE | `/api/quests/:id` | Yes | soft-delete; 5-pushup penalty if incomplete |
| GET | `/api/debt` | Yes | unresolved debts + totalOwed (soft-deleted quest refs nulled out) |
| POST | `/api/debt/calculate` | Yes | on-demand debt recalc for user |
| POST | `/api/sessions` | Yes | log payoff (amount); drains oldest debt first, awards coins (1 per 5 pts repaid + 1 per surplus pt) |
| GET | `/api/sessions` | Yes | last 30 sessions + allTimePaid aggregate |
| GET | `/api/streak` | Yes | current streak; updates user.maxStreak if new best |
| GET | `/api/leaderboard` | Yes | all users ranked; includes questsCompleted7d + totalQuestsCompleted |

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
