-- The former partial index allowed only one open boss per guild, which made a
-- persistent guardian block the independent daily boss. The persistence flag
-- is the stable discriminator used by the domain for these two parallel slots.
DROP INDEX IF EXISTS "BossRun_single_open_per_guild_key";

CREATE UNIQUE INDEX "BossRun_single_open_per_kind_per_guild_key"
ON "BossRun"("guildId", "isPersistent")
WHERE "status" IN ('SCHEDULED', 'ACTIVE');
