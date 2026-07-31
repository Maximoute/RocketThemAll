-- The guild configuration model predated its first ALTER migration, but its
-- table was missing from the migration history. Keep this repair additive so
-- existing installations that already created the table remain compatible.
CREATE TABLE IF NOT EXISTS "BotGuildConfig" (
  "guildId" TEXT NOT NULL,
  "guildName" TEXT NOT NULL,
  "spawnChannelId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "allowedDecks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BotGuildConfig_pkey" PRIMARY KEY ("guildId")
);
