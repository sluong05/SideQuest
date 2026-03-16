# PushupDebt — Developer Guide

A deep dive into how the codebase is structured, how each file works, and how everything connects together.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Backend](#3-backend)
   - [Entry Point — index.js](#31-entry-point--indexjs)
   - [Auth Middleware](#32-auth-middleware)
   - [Database Schema](#33-database-schema)
   - [Routes](#34-routes)
   - [Cron Job — dailyDebt.js](#35-cron-job--dailydebtjs)
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

PushupDebt is a full-stack web app with a clear separation between frontend and backend:

- **Frontend** (Next.js) — runs in the user's browser, handles all UI, talks to the backend over HTTP
- **Backend** (Node.js + Express) — handles all business logic, authentication, and database access
- **Database** (PostgreSQL via Prisma) — stores users, tasks, debt records, and pushup sessions

The two sides communicate exclusively through a REST API. The frontend never touches the database directly.

The app has one background process: a **cron job** running inside the backend that fires at midnight every day to recalculate pushup debt for all users.

---

## 2. Monorepo Structure

The repo is a monorepo — one Git repository containing both the frontend and backend as separate subdirectories.

```
pushup-debt/
├── backend/          # Node.js + Express API
├── frontend/         # Next.js app
└── package.json      # Root scripts to run both together
```

### Root `package.json`

The root package.json exists only to make local development easier. It uses the `concurrently` package to run both servers at the same time with `npm run dev`.

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
2. **Sets up Express middleware** — CORS and JSON body parsing
3. **Registers all route handlers** under their URL prefixes
4. **Starts the cron job** and begins listening on the configured port

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
app.use('/api/tasks',       require('./routes/tasks'));
app.use('/api/debt',        require('./routes/debt'));
app.use('/api/sessions',    require('./routes/sessions'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/streak',      require('./routes/streak'));
```

Each `require('./routes/...')` loads a file that exports an Express Router. The prefix (`/api/tasks`) is prepended to every route defined inside that router. So `router.get('/')` in `tasks.js` becomes `GET /api/tasks/`.

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

### 3.3 Database Schema

**File:** `backend/prisma/schema.prisma`

Prisma uses this file to:
- Generate the database tables (via migrations)
- Generate the TypeScript/JS client used in route handlers

There are four models:

#### User
Stores account credentials. `username` is optional — users can sign up with just email and set a username later.

#### Task
Each task belongs to a user (`userId` foreign key). The `recurrence` field is a string (`"none"`, `"daily"`, `"weekly"`) — not an enum — for simplicity. `completedAt` is null until the task is completed.

The `pushupDebt` relation is one-to-one: a task can have at most one debt record. When a task is deleted (`onDelete: Cascade`), its debt record is automatically deleted too.

#### PushupDebt
Created when a task goes overdue. Tracks:
- `pushupsOwed` — the current number of pushups owed (Float because it compounds with 10% interest)
- `daysOverdue` — how many days past due (used to recalculate on each cron run)
- `resolved` — set to `true` when pushups are fully paid off

One debt per task (`taskId @unique`). You can't have two debt records for the same task.

#### PushupSession
A log entry every time a user records pushups. Used for leaderboard totals and pushup history. Debt reduction happens in the sessions route handler, not stored here directly.

---

### 3.4 Routes

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
4. If valid, signs and returns a new JWT token

**GET `/api/auth/me`** *(auth required)*
Returns the current user's profile. Used by the frontend on page load to validate the stored token is still good.

**PATCH `/api/auth/password`** *(auth required)*
Verifies the old password before updating to the new one. Prevents someone who grabbed a logged-in session from changing the password.

**PATCH `/api/auth/username`** *(auth required)*
Sets or updates the username. Checks for uniqueness against other users (but allows keeping the same username).

---

#### `routes/tasks.js`

Handles task CRUD.

**GET `/api/tasks`**
Accepts two optional query params:
- `?date=YYYY-MM-DD` — returns tasks due on exactly that day
- `?upToDate=YYYY-MM-DD` — returns all incomplete tasks + tasks completed on that day

The `upToDate` query is what the dashboard uses — it shows everything you need to act on today (incomplete tasks from the past and present) plus what you already finished today.

Date filtering uses `gte`/`lt` to capture the full day in UTC (midnight to midnight).

**POST `/api/tasks`**
Creates a task. `dueDate` defaults to end of today if not provided. After creation, it immediately calls `calculateAndUpdateDebt()` from `dailyDebt.js` — so if you create a task with a past due date, debt is generated right away.

**PATCH `/:id/complete`**
Marks a task complete and sets `completedAt` to now.

For **recurring tasks**, this also:
1. Resets `completed` back to `false`
2. Advances `dueDate` by 1 day (daily) or 7 days (weekly) to the next occurrence
3. Deletes any existing debt record for this task (it was paid by completing it)

**PATCH `/:id/uncomplete`**
Reverses a completion — sets `completed: false`, clears `completedAt`. Lets users undo an accidental check.

**DELETE `/:id`**
Deletes the task. Because of `onDelete: Cascade` in the schema, this also deletes the associated `PushupDebt` record automatically.

---

#### `routes/debt.js`

**GET `/api/debt`**
Returns all unresolved debt records for the current user, each joined with its task title. Also calculates the total pushups owed across all records.

**GET `/api/debt/summary`**
Returns aggregate stats: total pushups owed, count of overdue tasks, and the maximum days any single task is overdue. Used by `DebtSummary` component.

**POST `/api/debt/calculate`**
Manually triggers debt recalculation for the current user. Called by the dashboard on mount so debt is always fresh when you open the app, without waiting for midnight.

---

#### `routes/sessions.js`

**POST `/api/sessions`**
Records a set of completed pushups and applies them toward debt.

The reduction logic:
1. Fetches all unresolved debt records, ordered by `createdAt` ascending (oldest debt first)
2. Iterates through them, subtracting from `pushupsOwed` until the submitted count runs out
3. When a record reaches 0, marks it `resolved: true`
4. Creates a `PushupSession` record to log the activity

Paying oldest debt first is a design choice — it prevents debt from piling up indefinitely for old tasks.

**GET `/api/sessions`**
Returns the last 30 pushup sessions for the current user. Used on the verify-pushups page to show history.

---

#### `routes/streak.js`

**GET `/api/streak`**

Calculates the current streak: consecutive days where all tasks due that day were completed and no pushup debt was outstanding.

The algorithm:
1. Starts from today and walks backwards one day at a time
2. For each day, checks if every task due that day has `completed: true`
3. Also checks if any unresolved debt existed (if debt was accrued that day, the streak breaks)
4. Stops counting when it finds a day that fails either check
5. Returns the count

This is computed fresh on each request — there's no stored streak value in the database.

---

#### `routes/leaderboard.js`

**GET `/api/leaderboard`**

Fetches all users and for each one:
- Sums their unresolved `pushupsOwed` across all debt records
- Sums their total `pushupsCompleted` across all sessions

Sorts by lowest debt first. Tiebreaker is most total pushups completed (rewards effort). Returns a sanitized view — only `id`, `username` (or masked email), debt total, and pushup total. Passwords never leave the backend.

---

### 3.5 Cron Job — `dailyDebt.js`

**File:** `backend/src/jobs/dailyDebt.js`

This file exports two things:
- `calculateAndUpdateDebt(userId)` — recalculates debt for one user
- `startDebtCronJob()` — registers the midnight cron schedule

#### `calculateAndUpdateDebt(userId)`

Called in two places:
1. From the cron job at midnight (for all users)
2. From `POST /api/tasks` (immediately after task creation)
3. From `POST /api/debt/calculate` (manual trigger from dashboard)

What it does:

**Step 1 — Find overdue incomplete tasks**
Queries all tasks where `completed: false` and `dueDate < now`.

**Step 2 — Create or update debt records**
For each overdue task:
- If no debt record exists yet: creates one with `pushupsOwed = 5 × daysOverdue`
- If a debt record already exists: recalculates `pushupsOwed = 5 × daysOverdue` (replaces, doesn't add — prevents double-counting)

**Step 3 — Reset completed recurring tasks**
Finds tasks where `completed: true` and `recurrence !== 'none'`.
- Daily: sets new `dueDate` to tomorrow at 23:59:59 UTC, resets `completed: false`, deletes debt
- Weekly: sets new `dueDate` to 7 days from now at 23:59:59 UTC, same reset

**Step 4 — Clean up completed non-recurring tasks**
Deletes tasks where `completed: true`, `recurrence === 'none'`, and `completedAt` was before today. This keeps the dashboard clean — finished one-off tasks disappear the next day.

#### `startDebtCronJob()`

Uses `node-cron` to schedule `calculateAndUpdateDebt` for every user at `0 1 0 * * *` (00:01:00 every day). The 1-second offset avoids exact midnight edge cases.

The cron job runs **inside the same Node.js process** as the Express server. It's not a separate service or worker. This is why Railway was chosen over Render — Render's free tier spins down the process after 15 minutes of inactivity, which would kill this job.

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

This means every component can call `api.get('/api/tasks')` without manually handling auth headers — the interceptor does it automatically.

All backend endpoints are wrapped in named functions (`getTasks`, `createTask`, `logPushups`, etc.) so components import clean function names rather than raw Axios calls. If an API URL ever changes, it only needs updating in one place.

---

### 4.2 Auth Context

**File:** `frontend/contexts/AuthContext.js`

React Context is used to share authentication state (the current user) across all pages and components without prop-drilling.

The `AuthProvider` wraps the entire app in `_app.js`. It provides:
- `user` — the current user object (`null` if not logged in)
- `loading` — `true` while validating the stored token on first load
- `loginUser(token, userData)` — stores the token in localStorage and sets `user` state
- `logoutUser()` — removes the token and clears `user` state
- `updateUser(userData)` — updates `user` state in-place (used after changing username)

**Token validation on mount:**
When the app first loads, AuthContext checks if a token exists in localStorage and calls `GET /api/auth/me` to verify it's still valid. If the token has expired or been tampered with, it clears it and the user is treated as logged out.

**How pages use it:**
```js
const { user, loading } = useAuth();

if (loading) return <LoadingSpinner />;
if (!user) { router.push('/login'); return null; }
```

Protected pages redirect to `/login` if no user is found.

---

### 4.3 Pages

Next.js uses file-based routing — each file in `pages/` becomes a URL route.

#### `pages/index.js` — Dashboard

The main page after login. Layout is two columns:
- **Left:** task list, task progress bar, and an "Add Task" button
- **Right:** debt summary, formula explanation, and a link to verify pushups

On mount, it:
1. Calls `POST /api/debt/calculate` to refresh debt for the current user
2. Fetches today's tasks via `GET /api/tasks?upToDate=today`
3. Fetches debt summary via `GET /api/debt/summary`

**Username prompt:** If `user.username` is null, a modal appears prompting the user to set one. This handles accounts created before the username feature was added.

**Debt block:** If total debt exceeds 99 pushups, a blocking modal appears over the dashboard. The user can't add new tasks until they reduce their debt below 99. This is an intentional design mechanic to discourage letting debt pile up.

**Task progress bar:** Calculates `completed / total` for today's tasks and shows a colored bar.

#### `pages/login.js`

Simple form that calls `POST /api/auth/login`. On success, calls `loginUser()` from AuthContext and redirects to the dashboard. Redirects away immediately if already logged in.

#### `pages/signup.js`

Form with client-side validation before submitting to `POST /api/auth/signup`:
- Username: 3–20 characters, only letters/numbers/underscores
- Password: minimum 6 characters
- Confirm password: must match

Validation happens in the component before the API call — the backend also validates, but the frontend catches obvious mistakes instantly without a network round-trip.

#### `pages/settings.js`

Two independent forms on the same page:

**Change username** — calls `PATCH /api/auth/username`. Updates the user context with `updateUser()` so the nav bar reflects the new name immediately.

**Change password** — calls `PATCH /api/auth/password` with old + new + confirm. The old password is required server-side as a security measure.

Each form has its own success/error state so they don't interfere with each other.

#### `pages/leaderboard.js`

Calls `GET /api/leaderboard` and renders a ranked list. The current user is highlighted. Users without a username are shown with a masked email (`s***@gmail.com`). This is handled backend-side.

Debt is shown in red if above 0, with a green "Clean" checkmark if at 0.

#### `pages/verify-pushups.js`

The most complex page. Uses **MediaPipe Pose** (a Google ML library loaded from CDN) to detect body landmarks in a webcam feed and count pushup repetitions.

**How rep counting works:**

1. MediaPipe identifies 33 body landmarks each frame (shoulders, elbows, wrists, hips, etc.)
2. The elbow angle is calculated from three points: shoulder → elbow → wrist using the law of cosines
3. A rep is counted when:
   - Angle drops below **85°** (down position detected)
   - Then rises above **160°** (up position detected — rep complete)
4. Back angle is calculated from shoulder → hip. If this angle exceeds **40°** from horizontal, the back is not parallel to the ground and the rep is flagged as invalid form

**Gesture control:**
If either wrist rises above the shoulder landmark for 1.5 continuous seconds, it toggles the counter on/off. This lets users start/stop counting without touching the screen while in pushup position.

**After counting:** The user enters the rep count (pre-filled from camera) and submits. This calls `POST /api/sessions` to log and apply the pushups to debt.

---

### 4.4 Components

#### `Layout.js`

Wraps every page. Renders the top navigation bar with:
- App title (links to dashboard)
- Current streak badge (fetched from `GET /api/streak`)
- Links to leaderboard and settings
- Username/email display and logout button

The streak is fetched inside Layout so it's always fresh on every navigation.

#### `TaskList.js`

Renders the list of tasks. Each task row shows:
- Checkbox to toggle complete/incomplete
- Task title
- Due date
- Recurrence badge (`Daily` / `Weekly`) if applicable
- Debt badge if the task has outstanding debt
- Delete button

**Color coding by urgency:**
- Red — overdue (past due date, not complete)
- Yellow — due today
- Green — due in the future

Tasks are sorted: incomplete first (sorted by due date ascending), then completed tasks at the bottom.

#### `DebtSummary.js`

Shows the user's debt status. Broken into sections:

- **Total owed** — large number, color shifts from green (0) → yellow → red (high debt)
- **Debt breakdown** — each unresolved debt record listed with its task name and pushups owed
- **At-risk tasks** — tasks due today that haven't been completed yet, with a projection of how much debt they'll generate if missed
- **Log pushups button** — opens `LogPushupsModal`
- **Verify with camera link** — goes to `/verify-pushups`

#### `AddTaskModal.js`

A modal dialog for creating tasks. Fields:
- Title (required)
- Due date (date picker, defaults to today)
- Recurrence (dropdown: None / Daily / Weekly)

On submit, calls `createTask()` from `api.js` and calls the parent's `onTaskAdded` callback to refresh the task list.

#### `LogPushupsModal.js`

A modal for manually logging pushups (without camera verification). Shows:
- Current total debt
- Quick-select buttons for common amounts (5, 10, 15, 20, 25, 30)
- A number input for custom amounts
- A live preview: "After logging X pushups, you'll have Y remaining"

On submit, calls `POST /api/sessions` and triggers a debt refresh in the parent.

---

### 4.5 Styling

**File:** `frontend/styles/globals.css`

The app uses **Tailwind CSS** utility classes for most styling. `globals.css` adds:

- Tailwind base/components/utilities imports
- A custom `navy` color palette (navy-50 through navy-800) used for the dark background theme
- Reusable component classes using `@apply`:
  - `.btn-primary` — blue filled button
  - `.btn-secondary` — outlined button
  - `.btn-ghost` — transparent button
  - `.card` — dark rounded container
  - `.input` — dark styled text input
  - `.label` — form label styling

These custom classes mean components write `className="btn-primary"` instead of repeating 8 Tailwind classes everywhere.

---

## 5. How Features Work End-to-End

### Creating a task and generating debt

1. User fills out `AddTaskModal` and clicks Submit
2. Frontend calls `POST /api/tasks` with `{ title, dueDate, recurrence }`
3. Backend validates and creates the task in the database
4. Backend immediately calls `calculateAndUpdateDebt(userId)` — if the due date is already past, a `PushupDebt` record is created right away
5. Frontend's `onTaskAdded` callback fires, which re-fetches tasks and debt summary
6. Dashboard re-renders showing the new task and updated debt

### Paying off debt with the camera

1. User opens `/verify-pushups`
2. MediaPipe loads from CDN, webcam starts, pose detection begins
3. User does pushups — each valid rep increments the counter
4. User clicks "Log X Pushups"
5. Frontend calls `POST /api/sessions` with `{ pushupsCompleted: X }`
6. Backend applies pushups to oldest debt first, marks resolved records
7. Frontend shows updated debt

### Midnight debt recalculation

1. At 00:01 every night, `node-cron` fires inside the backend process
2. Fetches all users from the database
3. For each user, calls `calculateAndUpdateDebt(userId)`
4. Overdue incomplete tasks get new/updated debt records
5. Completed recurring tasks get their due dates advanced
6. Stale completed non-recurring tasks are deleted

### Login flow

1. User submits credentials on `/login`
2. Backend validates password hash, returns JWT token
3. Frontend stores token in `localStorage` via `loginUser()`
4. All subsequent `api.js` calls automatically include `Authorization: Bearer <token>`
5. On any page load, `AuthContext` re-validates the token against `/api/auth/me`
6. If the token is expired (>7 days), `/api/auth/me` returns 401, context clears the token, user is redirected to login

---

## 6. Data Flow Diagrams

### Request lifecycle (authenticated)

```
User action (click)
  → Component calls api.js function
    → Axios interceptor adds JWT header
      → HTTPS request to Railway backend
        → Express router matches URL
          → Auth middleware validates JWT, sets req.userId
            → Route handler queries database via Prisma
              → PostgreSQL returns data
            → Route handler returns JSON
      → Axios receives response
    → Component updates React state
  → UI re-renders
```

### Debt recalculation (nightly)

```
00:01 UTC
  → node-cron fires inside Express process
    → Fetch all users
      → For each user:
          → Find incomplete overdue tasks
            → Upsert PushupDebt records
          → Find completed recurring tasks
            → Advance due date, reset completion, delete debt
          → Delete old completed non-recurring tasks
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
  → If 200: user is set in context
  → If 401: localStorage cleared, redirect to /login

Logout
  → localStorage.removeItem('token')
  → user context set to null
  → Redirect to /login
```
