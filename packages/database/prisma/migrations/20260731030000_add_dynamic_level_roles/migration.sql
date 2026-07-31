CREATE TABLE "GuildLevelRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "minLevel" INTEGER NOT NULL,
    "maxLevel" INTEGER NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildLevelRole_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GuildLevelRole_range_check" CHECK ("minLevel" >= 0 AND "maxLevel" >= "minLevel")
);

CREATE TABLE "UserLevelRoleSync" (
    "userId" TEXT NOT NULL,
    "lastSyncedGuildDiscordId" TEXT,
    "lastSyncedMinLevel" INTEGER,
    "lastSyncedMaxLevel" INTEGER,
    "lastAttemptedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLevelRoleSync_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "GuildLevelRole_discordRoleId_key"
    ON "GuildLevelRole"("discordRoleId");
CREATE UNIQUE INDEX "GuildLevelRole_guildId_minLevel_key"
    ON "GuildLevelRole"("guildId", "minLevel");
CREATE INDEX "GuildLevelRole_guildId_maxLevel_idx"
    ON "GuildLevelRole"("guildId", "maxLevel");
CREATE INDEX "UserLevelRoleSync_lastAttemptedAt_idx"
    ON "UserLevelRoleSync"("lastAttemptedAt");

ALTER TABLE "GuildLevelRole"
    ADD CONSTRAINT "GuildLevelRole_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLevelRoleSync"
    ADD CONSTRAINT "UserLevelRoleSync_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
