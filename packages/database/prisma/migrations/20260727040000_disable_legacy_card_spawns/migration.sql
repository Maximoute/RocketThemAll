-- Normal cards are only encountered through /explore.
-- Boss scheduling uses BossRun and is intentionally unaffected.
UPDATE "AppConfig"
SET
  "autoSpawnEnabled" = false,
  "manualSpawnEnabled" = false,
  "forceSpawnRequestedAt" = NULL,
  "forceSpawnCardId" = NULL,
  "forceSpawnGuildId" = NULL;

UPDATE "BotGuildConfig"
SET "autoSpawnEnabled" = false;

UPDATE "SpawnLog"
SET "status" = 'cancelled'
WHERE "status" = 'active';

ALTER TABLE "AppConfig"
  ALTER COLUMN "autoSpawnEnabled" SET DEFAULT false,
  ALTER COLUMN "manualSpawnEnabled" SET DEFAULT false;

ALTER TABLE "BotGuildConfig"
  ALTER COLUMN "autoSpawnEnabled" SET DEFAULT false;

-- Keep historical rows for audit, while rejecting every future automatic card spawn.
ALTER TABLE "SpawnLog"
  ADD CONSTRAINT "SpawnLog_automatic_cards_disabled_check"
  CHECK ("spawnType" <> 'auto') NOT VALID;
