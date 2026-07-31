ALTER TABLE "QuestDefinition"
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "AchievementDefinition"
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "BossDefinition"
  ADD COLUMN "metadata" JSONB;
