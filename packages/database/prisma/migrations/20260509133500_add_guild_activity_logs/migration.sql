CREATE TABLE "GuildActivityLog" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "guildName" TEXT,
  "channelId" TEXT,
  "userId" TEXT,
  "discordUserId" TEXT,
  "username" TEXT,
  "category" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT,
  "summary" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuildActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GuildActivityLog_guildId_createdAt_idx" ON "GuildActivityLog"("guildId", "createdAt");
CREATE INDEX "GuildActivityLog_category_createdAt_idx" ON "GuildActivityLog"("category", "createdAt");
CREATE INDEX "GuildActivityLog_action_createdAt_idx" ON "GuildActivityLog"("action", "createdAt");
CREATE INDEX "GuildActivityLog_discordUserId_createdAt_idx" ON "GuildActivityLog"("discordUserId", "createdAt");
