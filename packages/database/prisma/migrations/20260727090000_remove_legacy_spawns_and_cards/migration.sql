-- Preserve the configured game channel before removing the legacy guild table.
UPDATE "GuildConfiguration" AS configuration
SET "gameChannelId" = legacy."spawnChannelId"
FROM "Guild" AS guild, "BotGuildConfig" AS legacy
WHERE configuration."guildId" = guild."id"
  AND legacy."guildId" = guild."discordId"
  AND configuration."gameChannelId" IS NULL
  AND legacy."spawnChannelId" IS NOT NULL;

-- The Vault catalog is now the only card source. Remove all historical import
-- and automatic/manual appearance infrastructure instead of keeping it dormant.
DROP TABLE IF EXISTS "SpawnChargeLog";
DROP TABLE IF EXISTS "SpawnLog";
DROP TABLE IF EXISTS "MovieImportBlacklist";
DROP TABLE IF EXISTS "BotGuildConfig";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "lastManualSpawnAt",
  DROP COLUMN IF EXISTS "spawnCharges",
  DROP COLUMN IF EXISTS "lastSpawnChargeRegenAt";

ALTER TABLE "Card"
  DROP COLUMN IF EXISTS "spawnEnabled",
  DROP COLUMN IF EXISTS "blacklistReason";

ALTER TABLE "AppConfig"
  DROP COLUMN IF EXISTS "spawnIntervalS",
  DROP COLUMN IF EXISTS "captureCooldownS",
  DROP COLUMN IF EXISTS "spawnChannelId",
  DROP COLUMN IF EXISTS "forceSpawnRequestedAt",
  DROP COLUMN IF EXISTS "forceSpawnCardId",
  DROP COLUMN IF EXISTS "forceSpawnGuildId",
  DROP COLUMN IF EXISTS "autoSpawnEnabled",
  DROP COLUMN IF EXISTS "autoSpawnIntervalMinutes",
  DROP COLUMN IF EXISTS "manualSpawnEnabled",
  DROP COLUMN IF EXISTS "manualSpawnCooldownMinutes",
  DROP COLUMN IF EXISTS "manualSpawnMaxCharges",
  DROP COLUMN IF EXISTS "manualSpawnRegenHours";

DROP TYPE IF EXISTS "SpawnStatus";
DROP TYPE IF EXISTS "SpawnType";
