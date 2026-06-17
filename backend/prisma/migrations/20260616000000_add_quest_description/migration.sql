-- Add an optional free-text description to quests.
-- Nullable so all existing quests keep a blank (NULL) description.
-- The Quest model is @@map("Task"), so the column lives on the legacy "Task" table.
ALTER TABLE "Task" ADD COLUMN "description" TEXT;
