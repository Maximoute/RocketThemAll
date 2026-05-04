-- Add per-guild auto spawn frequency and forced spawn target guild.
ALTER TABLE "BotGuildConfig"
ADD COLUMN IF NOT EXISTS "autoSpawnIntervalMinutes" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "AppConfig"
ADD COLUMN IF NOT EXISTS "forceSpawnGuildId" TEXT;
