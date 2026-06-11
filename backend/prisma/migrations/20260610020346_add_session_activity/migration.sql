-- Add activity type to pushup sessions (fitness | focus | wellness | chores | custom)
ALTER TABLE "PushupSession" ADD COLUMN "activity" TEXT NOT NULL DEFAULT 'fitness';
