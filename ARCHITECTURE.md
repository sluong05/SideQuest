# SideQuest — Architecture

## Overview

The app is split into three deployment boundaries: the user's browser, Vercel (frontend), and Railway (backend + database).

---

## Boundaries and Components

### User's Browser
- **Next.js Frontend** — the app the user sees and interacts with
- **localStorage** — where the JWT token is stored after login

### Vercel
- Hosts the **Next.js Frontend**
- Serves the built frontend to the user's browser over HTTPS

### Railway
- **Node.js & Express Backend** — handles all API routes (auth, quests, debt, sessions, leaderboard, streak, friends, challenges, shop, push notifications, public profiles)
- **node-cron jobs** — run *inside* the backend process: debt recalculation at 00:01 UTC nightly, email reminders on their own schedule
- **Prisma ORM** — sits between the backend and the database; translates backend calls into SQL queries
- **PostgreSQL Database** — stores all data (users, quests, debt, sessions, friendships, challenges, push subscriptions)

---

## How Data Flows

### A user making a request (e.g. loading their quests)

1. User opens the app in their browser → Vercel serves the Next.js Frontend
2. Frontend reads the JWT token from localStorage
3. Frontend sends an HTTPS API call to the Railway backend with the JWT token in the `Authorization` header
4. Backend validates the token, processes the request, and calls Prisma
5. Prisma translates the call into a SQL query and sends it to PostgreSQL
6. PostgreSQL returns the data → Prisma → Backend → Frontend → renders in the browser

### The midnight cron job

1. At 00:01 UTC, the node-cron scheduler (running inside the backend process) fires automatically
2. The backend queries all incomplete, overdue quests via Prisma
3. For each quest, it calculates or updates the debt owed
4. Recurring completed quests have their due dates advanced and completion reset
5. Expired quest rows are hard-deleted
6. Prisma writes all updates to PostgreSQL

### Login / Signup

1. User submits credentials → Frontend sends POST to `/api/auth/signup` or `/api/auth/login`
2. Backend hashes the password (bcrypt) and creates the user, or validates the existing user
3. Backend signs a JWT token with the `JWT_SECRET` env var and returns it
4. Frontend stores the token in localStorage
5. All subsequent requests include this token in the header

### Earning and spending coins

1. User logs pushups via `POST /api/sessions`
2. Backend drains oldest debt first; any surplus pushups increment `user.coins` (1 per pushup)
3. User visits `/shop`, picks a Debt Bomb item, selects a friend
4. Frontend calls `POST /api/shop/buy`
5. Backend verifies friendship, deducts coins, and creates a `Debt` record on the target user — all in a single Prisma transaction

---

## Diagram Description (for redrawing)

Draw three boundary boxes side by side:

```
[ User's Browser ]        [ Vercel ]        [ Railway ]
```

**User's Browser box** contains:
- A browser window icon
- Inside it: "Next.js Frontend" box
- Below the browser: "localStorage" box
- Arrow from Next.js Frontend → localStorage labeled "stores token"
- Arrow from localStorage → Next.js Frontend labeled "reads token"

**Vercel box** contains:
- The same browser window / Next.js Frontend (Vercel hosts it, browser runs it)
- Label the outer box "Vercel"

**Railway box** contains (top to bottom, all vertically stacked):
- "node-cron jobs — 00:01 UTC nightly + email reminders (inside backend)" — pill/label at the top with a clock icon
- Arrow pointing DOWN into the backend box
- "Node.js & Express Backend" box — main box, receives both the cron trigger and API calls
- Arrow DOWN labeled "reads/writes data"
- "Prisma ORM" box
- Arrow DOWN labeled "SQL queries"
- "PostgreSQL Database" box (styled blue)

**Between the two sides:**
- Arrow from "Next.js Frontend" → "Node.js & Express Backend" labeled "API Calls (HTTPS) + JWT token in header"

---

## Key Rules to Keep in Mind

- The cron jobs are **not separate services** — they run inside the same Node.js process as the Express backend. Do not draw them as their own boxes at the same level as the backend.
- **Prisma is not a separate server** — it's a library inside the backend. It sits between the backend and Postgres in the diagram to show the abstraction layer, but it has no network boundary of its own.
- **localStorage lives in the browser**, not inside Vercel's servers. It should be inside the "User's Browser" boundary, not "Vercel".
- There is only **one PostgreSQL database** box.
- The **shop transaction** (deduct coins + create debt) is a single Prisma `$transaction` call — both operations succeed or both fail atomically.
