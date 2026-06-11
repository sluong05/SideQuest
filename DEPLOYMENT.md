# Deployment Maintenance Guide

## Services Overview

| Layer | Service | URL |
|---|---|---|
| Frontend | Vercel | your-app.vercel.app |
| Backend | Railway | your-app.up.railway.app |
| Database | Railway PostgreSQL plugin | (internal to Railway) |

---

## Railway — Staying Within the $5/Month Credit

Railway charges based on actual resource usage (CPU + RAM + network), not a flat fee. A small always-on Node.js app + Postgres typically runs **$2–4/month**, leaving a comfortable buffer.

### What consumes the most credit

1. **RAM** — the biggest cost driver. The backend idles at ~100–150MB, Postgres at ~50MB.
2. **CPU** — nearly zero when idle; spikes briefly during the midnight cron job.
3. **Network egress** — negligible for personal use.

### How to monitor usage

1. Go to [railway.app](https://railway.app) → your project
2. Click a service → **Metrics** tab to see live RAM/CPU graphs
3. Click **Settings → Usage** on the project to see estimated monthly cost

Railway sends an email warning before you exceed the free credit — keep an eye on your inbox.

### Tips to stay under $5/month

- **Do not add more services** (e.g. Redis, a second backend) unless necessary — each service adds to the bill.
- **Set a spending limit**: Railway Settings → Billing → set a hard cap of $5 so it cuts off rather than charges you.
- **Keep the Postgres plugin** instead of a separate managed DB — it's already included in your project's resource usage.
- If usage creeps up, check the Metrics tab for memory leaks (steadily climbing RAM over days = leak).

---

## Making Changes to the App

Both Railway and Vercel are connected to your GitHub repo and **auto-deploy on every push to `main`** — you never need to manually trigger a deployment for normal code changes.

### What triggers a redeploy

| Change type | Triggers | Manual step needed? |
|---|---|---|
| Frontend code (pages, components, styles) | Vercel redeploys | No |
| Backend code (routes, logic, cron job) | Railway redeploys | No |
| Database schema (new model/field) | Railway redeploys + runs migrations | Yes — commit the migration file first (see below) |
| New environment variable | Neither — must set in dashboard | Yes — then manually redeploy that service |

### Typical workflow for any change

```bash
# Make your changes locally, test them, then:
git add -A
git commit -m "describe what you changed"
git push
```

That's it. Vercel and Railway each detect the push and redeploy their respective services within ~1–2 minutes.

### How redeployment affects users

- **Vercel (frontend):** Zero downtime — Vercel builds the new version in the background and only swaps it in when ready. Users won't notice.
- **Railway (backend):** A brief restart (~5–15 seconds) where the API is unavailable. For personal/friend use this is fine. If someone happens to make a request during that window they'll get a network error, but refreshing will work immediately after.

### Does redeploying cost extra on Railway?

No. Railway only charges for runtime resource usage. Redeploying briefly spins down the old instance and spins up the new one — the cost difference is negligible (seconds of compute).

---

## Railway — Routine Maintenance

### Deploying backend changes

Railway auto-deploys when you push to the branch it's tracking (usually `main`). Nothing extra needed.

The `start` script runs `prisma migrate deploy` before starting, so **schema changes are applied automatically on each deploy** — just make sure you've committed the migration file.

### Adding a schema change

```bash
# From backend/
npx prisma migrate dev --name describe_your_change
git add prisma/migrations/
git commit -m "db: add <describe_your_change> migration"
git push
```

Railway picks it up and runs `prisma migrate deploy` on the next deploy.

### Checking backend health

```
GET https://your-app.up.railway.app/api/health
```

Returns `{ "status": "ok", "timestamp": "..." }` if the server is up.

### Viewing logs

Railway dashboard → your backend service → **Deployments** → click a deploy → **View Logs**.

The midnight cron job logs output here — useful for confirming debt recalculation ran.

### Restarting the backend

Railway dashboard → your service → **⋮ menu** → **Restart**. Use this if the server becomes unresponsive without redeploying.

---

## Vercel — Routine Maintenance

Vercel is free for personal projects with no practical usage limits at this scale. Auto-deploys on every push to `main`.

### Deploying frontend changes

Just push to `main` — Vercel builds and deploys automatically (~1 min build time).

### Adding/changing environment variables

Vercel dashboard → your project → **Settings → Environment Variables**.

After changing a variable, trigger a redeploy: **Deployments → ⋮ → Redeploy** (variables are baked in at build time for `NEXT_PUBLIC_*` vars).

### Checking build logs

Vercel dashboard → **Deployments** → click a deployment → **Build Logs** or **Function Logs**.

---

## Environment Variables Reference

### Railway (backend)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Auto-provided by Railway Postgres plugin — do not edit |
| `JWT_SECRET` | Long random string — rotate if compromised |
| `PORT` | `3001` |
| `ALLOWED_ORIGINS` | Your Vercel URL, e.g. `https://pushupdebt.vercel.app` |
| `RESEND_API_KEY` | API key from resend.com — used for password reset emails and friend request notifications |
| `FRONTEND_URL` | Your Vercel URL, e.g. `https://pushupdebt.vercel.app` — used to build links in emails |
| `VAPID_PUBLIC_KEY` | Web push VAPID public key — generate with `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Web push VAPID private key — keep secret, never rotate without re-subscribing all users |

### Vercel (frontend)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your Railway backend URL |

---

## If Something Breaks

| Symptom | Where to look |
|---|---|
| Frontend shows blank page / errors | Vercel → Deployments → Function Logs |
| API calls failing (network error) | Check Railway is running; check `NEXT_PUBLIC_API_URL` is correct in Vercel |
| "Server error" on signup/login | Railway logs — likely a missing env var or DB connection issue |
| Debt not recalculating overnight | Railway logs around midnight — cron job output is logged there |
| Railway service stopped | Railway dashboard → restart the service; check if you exceeded the $5 credit |
| Login/signup returning 429 | Rate limiter triggered — 10 attempts per 15 min per IP. Wait 15 min or restart the backend to clear in-memory counters |
| Password reset email not arriving | Check Railway logs for Resend errors; verify `RESEND_API_KEY` and `FRONTEND_URL` are set; remind user to check spam |
| Push notifications not arriving | Verify `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set on Railway; check that the user has granted browser notification permission |
| Coins not updating after pushups | Check that the `coins` column exists in the DB (`npx prisma migrate deploy` if not); verify the sessions route is returning `coinsEarned` |
| Shop purchase failing | Check friendship exists between buyer and target; check buyer has sufficient coins in DB |
