-- Add userId column to PushupDebt (nullable initially so we can backfill)
ALTER TABLE "PushupDebt" ADD COLUMN "userId" INTEGER;

-- Backfill userId from the related Task
UPDATE "PushupDebt" pd
SET "userId" = t."userId"
FROM "Task" t
WHERE pd."taskId" = t.id;

-- Drop any orphaned debt rows that couldn't be backfilled (shouldn't exist)
DELETE FROM "PushupDebt" WHERE "userId" IS NULL;

-- Make userId NOT NULL now that it's populated
ALTER TABLE "PushupDebt" ALTER COLUMN "userId" SET NOT NULL;

-- Add foreign key for userId -> User (cascade delete if user is deleted)
ALTER TABLE "PushupDebt" ADD CONSTRAINT "PushupDebt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Make taskId nullable (debt should survive task deletion)
ALTER TABLE "PushupDebt" ALTER COLUMN "taskId" DROP NOT NULL;

-- Replace the CASCADE delete on taskId with SET NULL
ALTER TABLE "PushupDebt" DROP CONSTRAINT "PushupDebt_taskId_fkey";
ALTER TABLE "PushupDebt" ADD CONSTRAINT "PushupDebt_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
