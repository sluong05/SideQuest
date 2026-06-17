-- Indexes for hot query paths (cron debt scan, leaderboard aggregates, streak,
-- dashboard). Tables use their legacy physical names (Task / PushupDebt /
-- PushupSession) per the @@map in schema.prisma.

CREATE INDEX "Task_userId_deletedAt_idx" ON "Task"("userId", "deletedAt");
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX "Task_completedAt_idx" ON "Task"("completedAt");

CREATE INDEX "PushupDebt_userId_resolved_idx" ON "PushupDebt"("userId", "resolved");

CREATE INDEX "PushupSession_userId_idx" ON "PushupSession"("userId");
CREATE INDEX "PushupSession_date_idx" ON "PushupSession"("date");
