-- Audit fixes (2026-10): auth revocation, streak/pause/fresh-start state,
-- per-debt freeze tracking, completion history, cron idempotency.

ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "streakShieldDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "currentStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "pausedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastPauseAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastFreshStartAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pushReminders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "allowChaos" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "invitedById" INTEGER;
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

ALTER TABLE "PushupDebt" ADD COLUMN "frozenDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PushupDebt" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'quest';

ALTER TABLE "PushupSession" ADD COLUMN "coinsEarned" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Challenge" ADD COLUMN "challengerScore" INTEGER;
ALTER TABLE "Challenge" ADD COLUMN "challengedScore" INTEGER;
CREATE INDEX "Challenge_challengerId_idx" ON "Challenge"("challengerId");
CREATE INDEX "Challenge_challengedId_idx" ON "Challenge"("challengedId");

CREATE TABLE "QuestCompletion" (
    "id" SERIAL NOT NULL,
    "questId" INTEGER,
    "userId" INTEGER NOT NULL,
    "localDate" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestCompletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestCompletion_questId_localDate_key" ON "QuestCompletion"("questId", "localDate");
CREATE INDEX "QuestCompletion_userId_localDate_idx" ON "QuestCompletion"("userId", "localDate");
ALTER TABLE "QuestCompletion" ADD CONSTRAINT "QuestCompletion_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestCompletion" ADD CONSTRAINT "QuestCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill history from quests that are currently completed (UTC date is the best available).
INSERT INTO "QuestCompletion" ("questId", "userId", "localDate", "completedAt")
SELECT "id", "userId", to_char("completedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD'), "completedAt"
FROM "Task" WHERE "completed" = true AND "completedAt" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE "JobRun" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JobRun_name_runKey_key" ON "JobRun"("name", "runKey");
