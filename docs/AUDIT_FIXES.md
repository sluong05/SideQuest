# Audit fixes — shared contract (2026-10)

Branch: `fix/audit-2026-10`. This file is the single source of truth for API shapes
used by backend, web (`frontend/`) and iOS (`../SideQuest-iOS`). **Backward
compatibility rule:** the live App Store iOS build talks to this backend, so never
remove or rename an existing request field or response field — only add.

## Backend env vars (all optional; features are off/no-op until set)
| Var | Default | Purpose |
| --- | --- | --- |
| `SITE_URL` | `https://pushupdebt.com` | Base for all links (emails, OG, share, unsubscribe). Read via `src/lib/siteConfig.js` |
| `EMAIL_FROM` | `SideQuest <noreply@pushupdebt.com>` | Sender for all mail |
| `REQUIRE_SESSION_TOKEN` | unset | `true` = reject token-less fitness sessions (flip once the iOS update is live) |
| `DEBT_MAX_DAYS` | `7` | Max overdue days charged per quest |
| `DAILY_SURPLUS_COIN_CAP` | `50` | Max surplus coins per user per local day |
| `DAILY_COMPLETION_CAP` | `30` | Completions per local day that earn XP/coins/leaderboard credit |
| `MIN_QUEST_AGE_SECONDS` | `60` | Completing a quest younger than this earns no XP/coins/leaderboard credit |
| `FREE_EDIT_MINUTES` | `15` | Free edit/delete window after creating a quest |
| `REFERRAL_COINS` | `25` | Coins to inviter and invitee when an invite signup happens |
| `POSTHOG_KEY`, `POSTHOG_HOST` | unset, `https://us.i.posthog.com` | Server-side event forwarding for `/api/events` |
| `SENTRY_DSN` | unset | Backend error reporting |
| `REDIS_URL` | unset | Shared rate-limit store (in-memory otherwise) |
| `APPLE_SIGNIN_ENABLED` / `APPLE_BUNDLE_ID` | unset / `com.steventracy.sidequest` | Enables `POST /api/auth/apple` |
| `APPLE_SERVICES_ID` | unset | Extra accepted audience for Sign in with Apple on the web |
| `GOOGLE_CLIENT_ID` | unset | Enables `POST /api/auth/google` |

## Web env vars
`NEXT_PUBLIC_SITE_URL` (default `https://pushupdebt.com`), `NEXT_PUBLIC_APP_STORE_ID` (enables App Store badge links + Smart App Banner; badge falls back to an App Store search link when unset), `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_APPLE_SERVICES_ID`. Analytics go through `POST /api/events` (no client SDK).

## Debt rules (server is authoritative)
- Charge per overdue day = `quest.debtAmount` (default 5). First charge the moment the due time passes; +1 day per local midnight.
- Chargeable days = `min(daysOverdue - frozenDays, DEBT_MAX_DAYS)`.
- While `debtFreezeUntil > now` or `pausedUntil > now`, newly elapsed overdue days are added to `debt.frozenDays` (never charged later).
- All debt writes use `increment`/conditional `updateMany`, never absolute values computed from an earlier read.
- Debt sources: `quest` (overdue), `delete` (deleting a quest outside the free window, amount = `quest.debtAmount`), `bomb` (Debt Bomb).
- **Lockout is a soft warning** at 250 pts of unresolved non-bomb debt: quest creation still succeeds, response carries `warning`.

## Endpoints — new or changed
### Quests
- `POST /api/quests` → `{ quest, warning? }`.
- `PATCH /api/quests/:id` body any of `{ title, description, dueDate, recurrence, category, difficulty, debtAmount, debtType }`. `title`/`description` always editable (not after completion-lock). Other fields editable while the quest is not completed AND (`now < dueDate` OR created < `FREE_EDIT_MINUTES` ago). Changing difficulty recomputes `xpReward`. → `{ quest }`; 400 `{ error, code:'EDIT_LOCKED' }` otherwise.
- `DELETE /api/quests/:id` → `{ success:true, penalty }` — penalty 0 if completed or created < `FREE_EDIT_MINUTES` ago, else `quest.debtAmount` (debt source `delete`).
- `PATCH /api/quests/:id/complete` → `{ quest, xpAwarded, coinsAwarded, leveledUp, newLevel }`. Atomic (only one concurrent request wins). Writes a `QuestCompletion` for the user's local date. XP/coins/leaderboard credit only if quest age ≥ `MIN_QUEST_AGE_SECONDS` and under `DAILY_COMPLETION_CAP`. On-time completion (now ≤ dueDate) awards **2 coins**.
- `PATCH /api/quests/:id/uncomplete` → `{ quest }`. Reverses XP (and level), coins, counters and the `QuestCompletion` row.
### Debt
- `GET /api/debt` (server recalculates this user's debt first) → existing fields **plus** `{ lockoutThreshold: 250, lockoutDebt, warning?, pausedUntil, canPause, nextPauseAvailableAt, canFreshStart, nextFreshStartAt, maxDaysCharged }`.
- `POST /api/debt/calculate` kept for old clients.
- `POST /api/debt/pause { days }` (1–14). One pause per 90 days. → `{ pausedUntil }`. `POST /api/debt/resume` → `{ pausedUntil: null }`.
- `POST /api/debt/fresh-start` → clears all unresolved debt, resets `currentStreak` to 0 (maxStreak kept). Once per 30 days. → `{ cleared, nextFreshStartAt }`.
### Payoff sessions
- `POST /api/sessions/start { activity? }` → `{ sessionToken }` (token encodes activity + start time). Old clients send no body → fitness.
- `POST /api/sessions { amount, activity, sessionToken }`:
  - fitness: token checked when present; token-less allowed unless `REQUIRE_SESSION_TOKEN`, but **token-less sessions earn no surplus coins**.
  - focus: token required; amount ≤ elapsed whole minutes since start.
  - wellness / chores: token required; ≤ 50 pts per session.
  - custom: token required; ≤ 25 pts per session and ≤ 100 pts per local day.
  - Surplus coins capped at `DAILY_SURPLUS_COIN_CAP` per local day (tracked via `PayoffSession.coinsEarned`).
  - Awards **1 XP per debt point repaid**. Runs in one transaction.
  - Response adds `{ xpEarned, coinsEarned, surplusCapped }` to existing fields.
### Streak
- `GET /api/streak` (same response shape + `graceUsedThisWeek`): computed from `QuestCompletion` + quests due each local day (deleted quests excluded). A day counts if ≥ 80% of quests due that day were completed. One free grace day per rolling 7 days. A purchased Streak Shield protects one specific day, persisted in `streakShieldDate`. Caches `User.currentStreak`.
### Shop
- Streak Shield 40 coins. Debt Discount: 25% off capped at 50 pts, usable once per 7 days. Debt Bomb/Taunt: target must have `allowChaos` and buyer must have `emailVerified` (403 `{code:'EMAIL_NOT_VERIFIED'}`); a target receives at most 3 bombs per 7 days (400 `{code:'TARGET_LIMIT'}`); bomb debt has source `bomb`.
### Challenges
- Pushups challenges count only `activity:'fitness'` sessions; scores are frozen into `challengerScore`/`challengedScore` when a challenge ends.
- `POST /api/challenges/invite-link { type, durationDays }` → `{ url }` = `${SITE_URL}/join?ref=<username>&challenge=<type>-<days>`.
### Users / social
- `GET /api/users/:id/avatar` — **no auth**; serves the stored avatar as an image with `Cache-Control: public, max-age=86400` + ETag; 404 if none.
- `GET /api/users/public/:username` — **no auth** → `{ username, bio, avatarUrl, level, xp, currentStreak, maxStreak, totalQuestsCompleted, joinedAt }`.
- `GET /api/users/:username` (auth) unchanged + `avatarUrl`.
- Leaderboard + friends list entries: `avatarUrl` (absolute API URL or null); `avatar` is now `null` in those lists (payload fix). Global board ranks the top 100 by 7-day completions.
- `GET /api/friends/invite` → `{ url }` = `${SITE_URL}/join?ref=<username>`.
### Auth
- `POST /api/auth/signup { email, password, username?, timezone?, ref?, challenge? }` — password rule: ≥ 8 chars only. `ref` = inviter username → `invitedById`, auto-accepted friendship, `REFERRAL_COINS` each. `challenge` (`pushups-7`, `quests-14`…) → pending challenge from inviter.
- JWT payload adds `tv` (tokenVersion). Middleware rejects tokens whose `tv` ≠ `user.tokenVersion` (missing `tv` treated as 0). `tokenVersion` bumps on password change, password reset and account deletion. Middleware also updates `lastActiveAt` at most once per hour.
- `POST /api/auth/apple { identityToken, fullName? }` / `POST /api/auth/google { credential }` → same shape as login `{ token, user }` + `isNew`. 501 when not configured.
- `PATCH /api/auth/notifications { emailReminders?, pushReminders? }` (existing route, extended). `PATCH /api/auth/preferences { allowChaos? }`.
- `GET|POST /api/auth/unsubscribe?token=` — one-click unsubscribe (signed token); GET returns a small HTML confirmation.
- `/api/auth/me` user adds: `pushReminders, allowChaos, pausedUntil, currentStreak, emailVerified, invitedById, avatarUrl, createdAt`.
- Wrong-password login keeps returning 401 `{ error:'Invalid credentials' }` (clients must not treat auth-route 401s as session expiry).
### Analytics / ops
- `POST /api/events { name, props?, anonId? }` (auth optional) → 204; forwards to PostHog when `POSTHOG_KEY` is set. Event names: `landing_view, signup_start, signup_complete, first_quest_created, quest_completed, first_payoff, payoff_logged, friend_added, invite_sent, invite_accepted, share_clicked, app_store_click, pause_started, fresh_start`.
- `GET /api/health` checks the DB (`SELECT 1`) → 503 on failure.

## Jobs (hourly, guarded by `src/lib/jobLock.js`)
Debt recalculation; recurring-quest reset at each user's local midnight (only when their local date is past `completedAt`'s local date); reminders in the user's local time: 08:00 morning plan, ~3h-before-due reminder (once per quest), 19:00 "streak ends tonight" (streak ≥ 3, incomplete today), 20:00 digest; onboarding nudges day 1 / day 3 for users with 0 quests; win-back at 7 and 14 days inactive. Email only to `emailVerified` users with `emailReminders`; push only with `pushReminders`. Emails carry `List-Unsubscribe` + `List-Unsubscribe-Post`. Debt push deep-links to `/pay`.
