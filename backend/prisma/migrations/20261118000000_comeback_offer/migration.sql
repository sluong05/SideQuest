-- Comeback amnesty window for returning users (additive, nullable).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "comebackUntil" TIMESTAMP(3);
