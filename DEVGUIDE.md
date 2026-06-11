# SideQuest — Developer Guide

A deep dive into how the codebase is structured, how each file works, and how everything connects together.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Backend](#3-backend)
   - [Entry Point — index.js](#31-entry-point--indexjs)
   - [Auth Middleware](#32-auth-middleware)
   - [Rate Limiter Middleware](#33-rate-limiter-middleware)
   - [Database Schema](#34-database-schema)
   - [Routes](#35-routes)
   - [Cron Jobs](#36-cron-jobs)
4. [Frontend](#4-frontend)
   - [API Client — api.js](#41-api-client--apijs)
   - [Auth Context](#42-auth-context)
   - [Pages](#43-pages)
   - [Components](#44-components)
   - [Styling](#45-styling)
5. [How Features Work End-to-End](#5-how-features-work-end-to-end)
6. [Data Flow Diagrams](#6-data-flow-diagrams)

---

## 1. High-Level Overview

SideQuest is a full-stack web app with a clear separation between frontend and backend:

- **Frontend** (Next.js) — runs in the user's browser, handles all UI, talks to the backend over HTTP
- **Backend** (Node.js + Express) — handles all business logic, authentication, and database access
- **Database** (PostgreSQL via Prisma) — stores users, quests, debt records, pushup sessions, friendships, challenges, and push subscriptions

The two sides communicate exclusively through a REST API. The frontend never touches the database directly.

The app has two background processes running inside the backend: a **debt cron job** at 00:01 UTC nightly and an **email reminder cron job** on its own schedule.

---

## 2. Monorepo Structure

The repo is a monorepo — one Git repository containing both the frontend and backend as separate subdirectories. See `README.md` for the full directory tree.

### Root `package.json`

Exists only to make local development easier. Uses `concurrently` to run both servers with `npm run dev`.

Key scripts:
- `install:all` — runs `npm install` inside both `backend/` and `frontend/`
- `dev` — starts both servers concurrently (backend on :3001, frontend on :3000)
- `build` — builds the Next.js frontend for production

This root package.json is not deployed — Railway and Vercel each deploy their respective subdirectory independently.

---

## 3. Backend

### 3.1 Entry Point — `index.js`

**File:** `backend/src/index.js`

This is the first file Node.js runs. It does four things in order:

1. **Loads environment variables** from `.env` using `dotenv`
2. **Sets up Express middleware** — CORS, JSON body parsing, and rate limiters
3. **Registers all route handlers** under their URL prefixes
4. **Starts the cron jobs** and begins listening on the configured port

#### CORS

```js
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
```

CORS (Cross-Origin Resource Sharing) is a browser security mechanism that blocks requests from one domain to another unless the server explicitly allows it. Since the frontend (Vercel) and backend (Railway) are on different domains, the backend must tell the browser it's okay to accept requests from the frontend's URL.

- In production, `ALLOWED_ORIGINS` is set to the Vercel URL (e.g. `https://pushupdebt.vercel.app`)
- Locally it defaults to localhost
- `credentials: true` is required because requests include the JWT token in the Authorization header

#### Route registration

```js
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/quests',       require('./routes/quests'));
app.use('/api/debt',        require('./routes/debt'));
app.use('/api/sessions',    require('./routes/sessions'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/streak',      require('./routes/streak'));
app.use('/api/friends',     require('./routes/friends').router);
app.use('/api/users',       require('./routes/users'));
app.use('/api/challenges',  require('./routes/challenges'));
app.use('/api/push',        require('./routes/push'));
app.use('/api/shop',        require('./routes/shop'));
```

Each `require('./routes/...')` loads a file that exports an Express Router. The prefix (`/api/quests`) is prepended to every route defined inside that router. So `router.get('/')` in `quests.js` becomes `GET /api/quests/`.

Note that `friends.js` exports `{ router, getFriendIds }` — the named export `getFriendIds` is reused by `leaderboard.js`, `challenges.js`, and `shop.js`.

#### Health check

```js
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

A simple endpoint that returns `200 OK`. Useful for verifying the backend is alive without needing authentication.

---

### 3.2 Auth Middleware

**File:** `backend/src/middleware/auth.js`

This is a middleware function that protects routes requiring authentication. Any route that calls `require('../middleware/auth')` will run this function before the route handler.

What it does:
1. Reads the `Authorization` header from the request
2. Extracts the token from the `Bearer <token>` format
3. Verifies the token using `jwt.verify()` and the `JWT_SECRET` env var
4. If valid, attaches `req.userId` (the user's database ID) and calls `next()` to proceed
5. If invalid or missing, returns `401 Unauthorized`

```js
// How a protected route uses it:
router.get('/me', require('../middleware/auth'), async (req, res) => {
  // req.userId is available here because middleware set it
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  ...
});
```

The JWT token is a signed string that encodes `{ userId: 123 }`. It cannot be forged without knowing `JWT_SECRET`, so the backend can trust `req.userId` without hitting the database on every request.

---

### 3.3 Rate Limiter Middleware

**File:** `backend/src/middleware/rateLimiter.js`

Two limiters using `express-rate-limit`:

- **`authLimiter`** — applied to `/api/auth/login`, `/signup`, `/forgot-password`, `/reset-password`. Strict limit to prevent brute-force attacks.
- **`generalLimiter`** — applied to all `/api/*` routes. Looser limit to prevent abuse without blocking normal use.

Both are in-memory (no Redis), so limits reset when the backend process restarts.

---

### 3.4 Database Schema

**File:** `backend/prisma/schema.prisma`

Prisma uses this file to generate database tables (via migrations) and the JS client used in route handlers.

#### User

Stores account credentials and lifetime stats:

| Field | Purpose |
|---|---|
| `email`, `username`, `password` | Identity. Username is optional — users can sign up with email only and set a username later |
| `timezone` | IANA timezone string (e.g. `America/New_York`). Sent by the browser on signup and updated on login if changed. Used for timezone-aware debt calculation |
| `totalQuestsCompleted` | Lifetime counter incremented on `complete`, decremented on `uncomplete`. Persists through quest deletion so the leaderboard always shows an accurate all-time count |
| `maxStreak` | All-time best streak in days. Updated by `GET /api/streak` whenever the current streak exceeds it. Used for badge earning so badges aren't lost when a streak resets |
| `emailReminders` | Boolean preference for opt-in email notifications |
| `bio`, `avatar` | Profile customisation. `avatar` is stored as a base64 data URL (capped at 300 KB) |
| `coins` | Coin balance earned from surplus pushups (1 coin per pushup done when debt = 0). Spent in the shop |

#### Quest

Each quest belongs to a user (`userId` foreign key). The `recurrence` field is a string (`"none"`, `"daily"`, `"weekly"`). `completedAt` is null until completed. `deletedAt` is null until soft-deleted.

**Soft-delete**: quests are never hard-deleted via the API. Instead `deletedAt` is set to the current timestamp. This keeps completed quests in the database for 7 days so the leaderboard can count them in the `questsCompleted7d` window. All queries that list quests filter `deletedAt: null`. The nightly cron hard-deletes expired rows.

The `debt` relation is one-to-one with `onDelete: SetNull` — deleting a quest orphans its debt (sets `questId = null`) rather than deleting it.

#### Debt (table: `PushupDebt`)

Created when a quest goes overdue. Tracks:
- `amountOwed` — the current number of pushups owed (Float for precision during partial payoffs)
- `daysOverdue` — how many days past due (used to recalculate on each cron run without double-charging)
- `resolved` — set to `true` when pushups are fully paid off

`questId` is nullable — null means the quest was deleted (or the debt was created by a shop item or deletion penalty). The debt breakdown groups all null-questId debts into a single "Deleted quests" row. Deleting an incomplete quest always creates or adds to a null-questId debt (5-pushup penalty). The shop's Debt Bomb also creates a null-questId debt on the target user.

#### PayoffSession

A log entry every time a user records pushups. Used for leaderboard totals and the pushup history chart. Debt reduction happens in the sessions route handler — this table is purely a log.

#### Friendship

Tracks friend relationships between users. `status` is `"pending"` until accepted, then `"accepted"`. A unique constraint on `[requesterId, receiverId]` prevents duplicate requests.

When searching for users, pending relationships are now included in results (not filtered out) so the frontend can show the correct button state ("Request sent / Unsend") after navigating away and back.

#### Challenge

Records a competitive challenge between two users. Fields:
- `type` — `"quests"` (most quests completed) or `"pushups"` (most pushups logged)
- `durationDays` — 3, 7, 14, or 30
- `status` — `"pending"` → `"active"` (on accept) → stays active until `endDate` passes
- `startDate`, `endDate` — set when the challenged user accepts; scores are computed relative to this window

Scores are computed live at query time in `challenges.js` using `computeScore()` — nothing is stored in the row.

#### PushSubscription

Stores web push subscription objects (endpoint, p256dh key, auth key) per user. Used by the push notification job. One user can have multiple subscriptions (multiple devices/browsers).

---

### 3.5 Routes

Each route file creates an Express `Router`, defines handlers on it, and exports it. The router is mounted in `index.js`.

All route handlers follow the same pattern:
- Validate inputs early and return `400` if invalid
- Wrap database logic in `try/catch` and return `500` on unexpected errors
- Use `async/await` throughout

#### `routes/auth.js`

Handles user identity.

**POST `/api/auth/signup`**
1. Validates that email, username, and password are present and meet rules (username regex, password min length)
2. Checks the database for duplicate email or username
3. Hashes the password with `bcrypt` (10 salt rounds — slow by design, makes brute-force attacks impractical)
4. Creates the user in the database
5. Signs a JWT token with `{ userId }` expiring in 7 days
6. Returns the token and user object

**POST `/api/auth/login`**
1. Detects whether the identifier is an email (contains `@`) or username
2. Finds the user by email or username
3. Compares the submitted password against the stored hash using `bcrypt.compare`
4. If the detected timezone differs from what's stored, updates it (handles travel)
5. Signs and returns a new JWT token

**GET `/api/auth/me`** *(auth required)*
Returns the current user's full profile including `coins`, `totalQuestsCompleted`, `maxStreak`, `timezone`, `bio`, `avatar`. Used by the frontend on page load to validate the stored token and hydrate the auth context.

**PATCH `/api/auth/password`** *(auth required)*
Verifies the old password before updating to the new one.

**PATCH `/api/auth/username`** *(auth required)*
Sets or updates the username. Checks for uniqueness against other users.

**PATCH `/api/auth/profile`** *(auth required)*
Updates `bio` (capped at 160 chars) and/or `avatar` (validated as a data URL, capped at 300 KB).

**PATCH `/api/auth/notifications`** *(auth required)*
Toggles the `emailReminders` boolean.

**DELETE `/api/auth/account`** *(auth required)*
Hard-deletes the user and all their associated data (debts, sessions, quests, friendships, challenges) in dependency order.

---

#### `routes/quests.js`

Handles quest CRUD.

**GET `/api/quests`**
Accepts two optional query params:
- `?date=YYYY-MM-DD` — returns quests due on exactly that day
- `?upToDate=YYYY-MM-DD` — returns all incomplete quests + quests completed on that day

The `upToDate` query is what the dashboard uses — it shows everything you need to act on today (incomplete quests from the past and present) plus what you already finished today.

**POST `/api/quests`**
Creates a quest. Blocked if `totalOwed > 99` (debt guard). After creation, immediately calls `calculateAndUpdateDebt(userId)` — so if you create a quest with a past due date, debt is generated right away.

**PATCH `/:id/complete`**
Marks a quest complete and sets `completedAt` to now. Runs in a Prisma transaction that also increments `user.totalQuestsCompleted`.

**PATCH `/:id/uncomplete`**
Reverses a completion. Runs in a transaction that decrements `user.totalQuestsCompleted`.

**DELETE `/:id`**
Soft-deletes the quest by setting `deletedAt = now()`. If the quest was incomplete, a 5-pushup penalty is applied:
- If the quest had existing debt: sets `questId = null` on that debt and adds 5 to `amountOwed`
- If no existing debt: creates a new `Debt` with `questId = null, amountOwed = 5`

Completed quests are soft-deleted with no penalty.

---

#### `routes/debt.js`

**GET `/api/debt`**
Returns all unresolved debt records for the current user, each joined with its quest title, plus the total pushups owed.

**POST `/api/debt/calculate`**
Manually triggers debt recalculation for the current user. Called by the dashboard on mount so debt is always fresh when you open the app, without waiting for midnight.

---

#### `routes/sessions.js`

**POST `/api/sessions`**
Records a set of completed pushups and applies them toward debt.

The reduction logic:
1. Fetches all unresolved debt records, ordered by `createdAt` ascending (oldest debt first)
2. Iterates through them, subtracting from `amountOwed` until the submitted count runs out
3. When a record reaches 0, marks it `resolved: true`
4. Creates a `PayoffSession` record to log the activity
5. **If any pushups remain after all debt is cleared**, increments `user.coins` by the remainder (1 coin per surplus pushup)
6. Returns `{ session, totalOwed, coinsEarned, pushupsApplied }`

Paying oldest debt first is a design choice — it prevents debt from piling up indefinitely for old quests. Coins are only earned from surplus — there's no reward for pushups that go toward debt.

**GET `/api/sessions`**
Returns the last 30 pushup sessions plus `allTimePaid` (a Prisma aggregate of all sessions ever). Used on the dashboard progress chart and verify-pushups page.

---

#### `routes/streak.js`

**GET `/api/streak`**

Calculates the current streak: consecutive days where all quests due that day were completed and no debt was outstanding.

The algorithm:
1. Starts from today and walks backwards one day at a time
2. For each day, checks if every quest due that day has `completed: true`
3. Also checks if any unresolved debt existed (if debt was accrued that day, the streak breaks)
4. Stops counting when it finds a day that fails either check

Streak is computed fresh on each request. If the result exceeds `user.maxStreak`, it updates `maxStreak` via `updateMany` with a `lt` condition (efficient — only writes on a new best).

---

#### `routes/leaderboard.js`

**GET `/api/leaderboard?friends=true`**

Fetches all users (or only friends + self when `?friends=true`) and for each computes:
- `totalDebt` — sum of unresolved `amountOwed`
- `totalPaid` — sum of all `amount` across sessions
- `questsCompleted7d` — count of quests completed in the last 7 days (soft-deleted completed quests still count since their rows are preserved for 7 days)
- `totalQuestsCompleted` — from the `User` field (all-time lifetime counter)
- `avatar` — for display in the leaderboard rows

Sort order: 1) most `questsCompleted7d`, 2) clean (zero debt), 3) lowest debt, 4) most pushups.

---

#### `routes/friends.js`

Exports both a `router` (mounted at `/api/friends`) and a `getFriendIds(userId)` helper used by other routes.

**GET `/api/friends`**
Returns accepted friends with stats: `username`, `avatar`, `totalDebt`, `totalPaid`, `maxStreak`, `totalQuestsCompleted`.

**GET `/api/friends/requests`**
Returns pending incoming requests including the requester's `username` and `avatar`.

**GET `/api/friends/feed`**
Returns a merged, time-sorted activity feed of friends' completed quests and pushup sessions from the last 7 days (up to 50 events).

**GET `/api/friends/search?q=`**
Searches users by username. Only excludes accepted friends (and self) — users with a pending relationship are included in results, annotated with `pendingStatus: 'sent' | 'received' | null` and `friendshipId`. This lets the frontend show the correct button state (Add Friend / Request sent + Unsend / Respond) even after navigating away and back.

**POST `/api/friends/request`**
Creates a pending `Friendship` row. Optionally sends a notification email to the target if they have `emailReminders` enabled (fire-and-forget, doesn't block the response).

**PATCH `/:id/accept`** / **PATCH `/:id/decline`**
Accept sets status to `"accepted"`. Decline deletes the row.

**DELETE `/:id`**
Handles two cases: removing an accepted friend (either party can remove), or canceling a pending request you sent (only the requester can cancel).

---

#### `routes/challenges.js`

**GET `/api/challenges`**
Returns all non-declined challenges for the current user with live scores. For active challenges (and completed ones), `computeScore()` queries the DB to count quests or sum pushups within the challenge's `startDate`–`endDate` window. The `winner` field is computed client-side from scores when `endDate` has passed and status is still `"active"`.

**POST `/api/challenges`**
Creates a pending challenge. Validates that the target is an accepted friend (using `getFriendIds`), that `type` is `"quests"` or `"pushups"`, and that `durationDays` is one of `[3, 7, 14, 30]`.

**PATCH `/:id/accept`**
Sets `status = "active"`, `startDate = now`, `endDate = now + durationDays`.

**PATCH `/:id/decline`**
Sets `status = "declined"` (row kept for history, filtered from GET results).

---

#### `routes/users.js`

**GET `/api/users/:username`**
Returns a public profile: username, bio, avatar, maxStreak, totalQuestsCompleted, total pushups, and member since date. No private data (email, debt, etc.) is exposed. Auth required (must be logged in to view).

---

#### `routes/shop.js`

**GET `/api/shop/items`**
Returns the static list of available shop items. Currently:

| id | name | cost | effect |
|---|---|---|---|
| `debt_bomb` | Debt Bomb 💣 | 50 coins | Adds 10 pushups to a friend's debt |

**POST `/api/shop/buy`**
Validates the purchase and applies the effect:
1. Checks the buyer has enough `coins`
2. For `debt_bomb`: verifies `targetUsername` exists and is an accepted friend
3. Runs a Prisma `$transaction` — deducts coins from buyer and creates a `Debt` record (`questId: null, amountOwed: 10, daysOverdue: 1`) on the target atomically

Using a transaction ensures coins are never deducted without the debt being created (and vice versa).

---

#### `routes/push.js`

Manages web push subscriptions (VAPID-based).

**GET `/api/push/vapid-public-key`** — returns the public key so the browser can create a push subscription.
**POST `/api/push/subscribe`** — stores a subscription (endpoint + keys) in `PushSubscription`.
**DELETE `/api/push/unsubscribe`** — removes a subscription by endpoint.

---

### 3.6 Cron Jobs

#### `jobs/dailyDebt.js`

Exports `calculateAndUpdateDebt(userId)` and `startDebtCronJob()`.

`calculateAndUpdateDebt` is called in three contexts:
1. **Nightly cron** at 00:01 UTC (for all users)
2. **`POST /api/quests`** — immediately after quest creation
3. **`POST /api/debt/calculate`** — manual trigger from the dashboard on mount

**Steps (full nightly run only — steps 3 and 4 are skipped for per-user calls):**

1. Find all incomplete, non-deleted quests where `dueDate < now`
2. For each overdue quest: create a new `Debt` (first time) or add `5 × newDays` (subsequent runs, only charges new overdue days to preserve partial payoffs)
3. Reset completed recurring quests: advance `dueDate` by one period, set `completed = false`, delete resolved debt
4. Hard-delete expired quest rows: completed non-recurring quests older than 7 days, and soft-deleted incomplete quests

The daysOverdue calculation is timezone-aware — it uses `Intl.DateTimeFormat` to convert timestamps to the user's local calendar day before computing the difference, so midnight boundaries are counted in the user's local time, not UTC.

#### `jobs/emailReminders.js`

Sends opt-in reminder emails to users with upcoming or overdue quests. Only sends to users with `emailReminders: true`. Uses Resend.

---

## 4. Frontend

### 4.1 API Client — `api.js`

**File:** `frontend/lib/api.js`

Creates a single Axios instance shared across the entire frontend:

```js
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
});
```

A request interceptor attaches the JWT token to every outgoing request:

```js
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

All backend endpoints are wrapped in named functions so components import clean function names rather than raw Axios calls. Current groups: auth, quests, debt, sessions, streak, leaderboard, friends, users, challenges, shop, push notifications.

---

### 4.2 Auth Context

**File:** `frontend/contexts/AuthContext.js`

React Context that shares authentication state across all pages and components without prop-drilling.

The `AuthProvider` wraps the entire app in `_app.js`. It provides:
- `user` — the current user object (`null` if not logged in). Includes `coins`, `totalQuestsCompleted`, `maxStreak`, `timezone`, `bio`, `avatar` from `/api/auth/me`
- `loading` — `true` while validating the stored token on first load
- `loginUser(token, userData)` — stores the token in localStorage and sets `user` state
- `logoutUser()` — removes the token, clears `user` state, redirects to `/welcome`
- `updateUser(userData)` — merges a partial update into `user` state in-place (used after changing username, profile, or coin balance after a shop purchase)

**Token validation on mount:**
When the app first loads, AuthContext checks if a token exists in localStorage and calls `GET /api/auth/me` to verify it's still valid. If the token has expired or been tampered with, it clears it and the user is treated as logged out.

---

### 4.3 Pages

Next.js uses file-based routing — each file in `pages/` becomes a URL route.

#### `pages/index.js` — Dashboard

The main page after login. Layout is a 5-column grid (3 left + 2 right) on desktop, stacked on mobile.

On mount:
1. Calls `POST /api/debt/calculate` to refresh debt
2. Fetches quests (`upToDate=today`), debt, streak, sessions, and friends list in parallel
3. `hasFriends` controls whether the ActivityFeed renders below the grid

**Left column:** quest list, progress bar, quest stats row, "Today's Focus" card (shown when ≤ 2 quests).

**Right column:** DebtSummary component, streak milestone card (progress bar toward next of 3/7/14/30/60/100 days with earned pills), "How It Works" card.

**Progress section (full-width):** 14-day pushup bar chart (hand-rolled SVG), all-time stats row (pushups, quests, streak, member since).

**Username prompt:** If `user.username` is null, a banner prompts the user to set one.

**Debt block modal:** If total debt exceeds 99 pushups, the Add Quest button shows a blocking modal. This is an intentional mechanic.

#### `pages/login.js` / `pages/signup.js`

Standard auth forms. Signup validates username format (3–20 chars, letters/numbers/underscores) and password length client-side before hitting the API. Both send the browser's detected timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) alongside credentials.

#### `pages/profile.js`

Accessible by clicking the username in the nav bar.

Sections:
- **Badges** — 6 streak milestone badges (3/7/14/30/60/100 days). Earned state based on `user.maxStreak` (all-time best), not current streak, so badges are permanently earned. Locked badges are dimmed.
- **Account info** — email, username, timezone, live local clock
- **Change username** / **Change password** — inline forms
- **Notification preferences** — toggle email reminders
- **Delete account** — confirmation modal

#### `pages/leaderboard.js`

Two tabs: Global and Friends. Friends tab lazy-loads on first switch (`?friends=true`). Each row shows avatar (image or initial fallback), username linked to `/u/[username]`, debt/pushup stats, and a 7-day quests badge. Current user's row is highlighted in amber.

#### `pages/friends.js`

Three tabs: Friends, Requests, Find.

- **Friends** — lists accepted friends with avatar, stats, Challenge and Remove buttons. Also shows pending challenge requests and active challenges at the top.
- **Requests** — incoming pending friend requests with Accept/Decline.
- **Find** — debounced username search (300ms). Results show correct button state based on `pendingStatus` returned by the server: "Add Friend", "Request sent + Unsend", or "Respond" (switches to Requests tab). This state is server-derived — navigating away and back does not reset it.

Challenge modal: pick type (quests/pushups) and duration (3/7/14/30 days), then send.

#### `pages/shop.js`

Shows the user's coin balance prominently. Lists available items with affordability state (greyed out + "need X more coins" if insufficient). Clicking Buy opens a modal with a friend picker (shows avatar + current debt). Confirm deducts coins optimistically via `updateUser` and calls `POST /api/shop/buy`. The Debt Bomb creates 10 pushups of debt on the target immediately.

#### `pages/verify-pushups.js`

The most complex page. Uses **MediaPipe Pose** (loaded from CDN — not npm) to detect body landmarks in a webcam feed and count pushup repetitions.

**How rep counting works:**
1. MediaPipe identifies 33 body landmarks each frame (shoulders, elbows, wrists, hips, etc.)
2. Elbow angle calculated from shoulder → elbow → wrist using `Math.atan2`
3. A rep is counted when: angle drops below **90°** AND is held for ≥ **500ms** (anti-cheat — a `downSinceRef` timestamp tracks the hold; a "▼ HOLD…" badge with fill animation shows progress), then rises above **155°**
4. Back angle (shoulder → hip vs horizontal) must be < **40°** for the rep to count

**Gesture control:** Either wrist held above the shoulder for 1.5 s toggles counting on/off — no need to touch the screen while in pushup position.

**On submit:** Calls `POST /api/sessions`. The response includes `coinsEarned` — if surplus pushups earned coins, "🪙 +N coins earned!" is shown in the success card.

#### `pages/u/[username].js`

Public profile page. Fetches `GET /api/users/:username`. Shows avatar, bio, streak badges, and key stats. Accessible to any logged-in user.

#### `pages/welcome.js`

Landing page shown to logged-out users. Links to login and signup.

---

### 4.4 Components

#### `Layout.js`

Wraps every page. Renders the sticky top navigation bar with:
- **Logo** — links to dashboard
- **Streak badge** — 🔥 + streak count received as a `streak` prop; each page fetches its own streak and passes it down
- **Coin balance badge** — 🪙 + `user.coins` from AuthContext, displayed next to the streak badge
- **Dashboard**, **Leaderboard**, **Friends**, **Shop** nav links — each highlighted when active; Friends shows a red dot badge if there are pending requests
- **Username/email** — clickable link to `/profile`
- **Logout** button

#### `QuestList.js`

Renders the list of quests. Each row shows checkbox, title, due date label, recurrence badge, debt badge, and delete button.

**Delete confirmation:** Clicking delete on an incomplete quest opens an inline modal ("Deleting this quest will cost you 5 pushups. Are you sure?"). Completed quests delete immediately.

**Color coding:** Red = overdue, Yellow = due today, no highlight = future. Quests sorted: incomplete first (by due date ascending), then completed.

#### `DebtSummary.js`

Shows debt status:
- **Total owed** — large number with debt level badge (Light Debt / Risky / Debt Spiral / Pushup Bankruptcy), flavor text, and a "Pay X to drop to Y" sub-goal
- **Debt breakdown** — each unresolved debt record; null-questId debts grouped as "Deleted quests"
- **At-risk quests** — quests due today not yet completed, with a live countdown (shared `useNow()` hook — one 1-second interval, not one per quest) and debt projection

#### `AddQuestModal.js`

Modal for creating quests. Fields: title, due date (defaults to today), recurrence (None / Daily / Weekly). On submit calls `createQuest()` then the parent's `onQuestAdded` callback.

#### `ActivityFeed.js`

Friend activity feed rendered on the dashboard when `hasFriends` is true. Fetches `GET /api/friends/feed`. Displays quest completions and pushup sessions from the last 7 days in a time-sorted list.

---

### 4.5 Styling

**File:** `frontend/styles/globals.css`

The app uses **Tailwind CSS** utility classes. `globals.css` adds:

- A custom `navy` color palette (navy-50 through navy-800) for the dark background theme
- Reusable component classes via `@apply`:
  - `.btn-primary` — amber filled button
  - `.btn-secondary` — outlined button
  - `.btn-ghost` — transparent button
  - `.card` — dark rounded container with border
  - `.input` — dark styled text input
  - `.label` — form label styling

---

## 5. How Features Work End-to-End

### Creating a quest and generating debt

1. User fills out `AddQuestModal` and clicks Submit
2. Frontend calls `POST /api/quests` with `{ title, dueDate, recurrence }`
3. Backend validates (blocks if debt > 99), creates the quest
4. Backend immediately calls `calculateAndUpdateDebt(userId)` — if due date is already past, a `Debt` record is created right away
5. Frontend's `onQuestAdded` callback re-fetches quests and debt
6. Dashboard re-renders with the new quest and updated debt

### Paying off debt and earning coins

1. User opens `/verify-pushups`
2. MediaPipe loads from CDN, webcam starts, pose detection begins
3. User does pushups — each valid rep increments the counter
4. User clicks "Log X Pushups"
5. Frontend calls `POST /api/sessions` with `{ amount: X }`
6. Backend drains oldest debt first; any surplus increments `user.coins`
7. Response includes `coinsEarned` — shown as "🪙 +N coins earned!" in the success card
8. Frontend shows updated debt

### Using the shop (Debt Bomb)

1. User navigates to `/shop`
2. Sees coin balance and the Debt Bomb item (50 coins)
3. Clicks Buy → modal opens with friend picker (shows avatars + current debt)
4. Selects a friend, clicks Confirm
5. Frontend calls `POST /api/shop/buy` with `{ itemId: 'debt_bomb', targetUsername }`
6. Backend verifies friendship, runs a `$transaction`: deducts 50 coins from buyer, creates a `Debt` of 10 on target
7. Frontend optimistically updates `user.coins` via `updateUser`
8. Target sees +10 pushups on their debt the next time they load the dashboard

### Friend request flow

1. User goes to Friends → Find tab, searches by username
2. Search returns results with server-annotated `pendingStatus` and `friendshipId`
3. User clicks "Add Friend" → `POST /api/friends/request` → result updated in-place with `pendingStatus: 'sent'`
4. If user navigates away and back, search re-fetches — server returns `pendingStatus: 'sent'` again (state not lost)
5. User can click "Unsend" → `DELETE /api/friends/:friendshipId` (backend now allows canceling pending sent requests)
6. Receiver sees request in the Requests tab (with avatar) → Accept or Decline

### Midnight debt recalculation

1. At 00:01 UTC, `node-cron` fires inside the backend process
2. Calls `calculateAndUpdateDebt()` for all users
3. Overdue incomplete quests get new/updated debt records (timezone-aware day counting)
4. Completed recurring quests get their due dates advanced and completion reset
5. Stale completed non-recurring quests and soft-deleted incomplete quests are hard-deleted

### Login flow

1. User submits credentials
2. Backend validates password hash, updates timezone if changed, returns JWT token
3. Frontend stores token in `localStorage` via `loginUser()`
4. All subsequent `api.js` calls automatically include `Authorization: Bearer <token>`
5. On any page load, `AuthContext` re-validates the token against `/api/auth/me`
6. If the token is expired (>7 days), `/api/auth/me` returns 401, context clears the token, user is redirected to `/welcome`

---

## 6. Data Flow Diagrams

### Request lifecycle (authenticated)

```
User action (click)
  → Component calls api.js function
    → Axios interceptor adds JWT header
      → HTTPS request to Railway backend
        → Rate limiter middleware checks limits
          → Express router matches URL
            → Auth middleware validates JWT, sets req.userId
              → Route handler queries database via Prisma
                → PostgreSQL returns data
              → Route handler returns JSON
      → Axios receives response
    → Component updates React state
  → UI re-renders
```

### Coin earning flow

```
User submits pushups (POST /api/sessions)
  → Backend drains oldest debts first
    → remaining = amount - total debt drained
    → if remaining > 0:
        → user.coins += remaining (Prisma increment)
        → coinsEarned = remaining
  → Response: { totalOwed, coinsEarned, pushupsApplied }
  → Frontend: shows "🪙 +N coins earned!" if coinsEarned > 0
```

### Shop purchase (atomic)

```
POST /api/shop/buy { itemId: 'debt_bomb', targetUsername }
  → Verify buyer.coins >= 50
  → Verify target exists and is a friend
  → prisma.$transaction([
      user.update({ coins: { decrement: 50 } }),   // buyer loses coins
      debt.create({ userId: target.id, amountOwed: 10 }) // target gains debt
    ])
  → Both succeed or both fail — no partial state
```

### Debt recalculation (nightly)

```
00:01 UTC
  → node-cron fires inside Express process
    → For each overdue incomplete quest:
        → Compute daysOverdue (timezone-aware calendar day diff)
        → Create Debt (first time) or add 5 × newDays (subsequent)
    → For each completed recurring quest:
        → Advance dueDate, reset completed=false, delete resolved debt
    → Hard-delete expired quest rows
```

### Token lifecycle

```
Signup/Login
  → Backend signs JWT { userId, exp: 7d }
  → Frontend stores in localStorage

Every API request
  → Interceptor reads localStorage
  → Attaches as Authorization: Bearer <token>

App mount
  → AuthContext calls GET /api/auth/me
  → If 200: user (incl. coins) is set in context
  → If 401: localStorage cleared, redirect to /welcome

Logout
  → localStorage.removeItem('token')
  → user context set to null
  → Redirect to /welcome
```
