-- Reconcile schema drift: these columns/tables exist in schema.prisma (and in
-- production, which was updated with `prisma db push`) but were never captured
-- in a migration, so a fresh database built from migrations alone was missing
-- them. Every statement is idempotent: it is a no-op where the object exists.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "xp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "level" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakShieldActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "debtFreezeUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushupMultiplierActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileFlair" TEXT;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "difficulty" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "xpReward" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "debtType" TEXT NOT NULL DEFAULT 'pushups';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "debtAmount" INTEGER NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS "UserItem" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserItem_userId_itemId_key" ON "UserItem"("userId", "itemId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserItem_userId_fkey') THEN
    ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
