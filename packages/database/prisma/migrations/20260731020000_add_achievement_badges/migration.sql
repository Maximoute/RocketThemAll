-- Players may display at most three unlocked achievement badges. The limit is
-- enforced transactionally by AchievementService because PostgreSQL CHECK
-- constraints cannot count sibling rows.
CREATE TABLE "AchievementBadgeSelection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementBadgeSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AchievementBadgeRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementBadgeRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AchievementBadgeSelection_userId_achievementId_key"
    ON "AchievementBadgeSelection"("userId", "achievementId");
CREATE INDEX "AchievementBadgeSelection_userId_selectedAt_idx"
    ON "AchievementBadgeSelection"("userId", "selectedAt");
CREATE UNIQUE INDEX "AchievementBadgeRole_discordRoleId_key"
    ON "AchievementBadgeRole"("discordRoleId");
CREATE UNIQUE INDEX "AchievementBadgeRole_guildId_achievementId_key"
    ON "AchievementBadgeRole"("guildId", "achievementId");
CREATE INDEX "AchievementBadgeRole_guildId_idx"
    ON "AchievementBadgeRole"("guildId");

ALTER TABLE "AchievementBadgeSelection"
    ADD CONSTRAINT "AchievementBadgeSelection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AchievementBadgeSelection"
    ADD CONSTRAINT "AchievementBadgeSelection_achievementId_fkey"
    FOREIGN KEY ("achievementId") REFERENCES "AchievementDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AchievementBadgeRole"
    ADD CONSTRAINT "AchievementBadgeRole_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AchievementBadgeRole"
    ADD CONSTRAINT "AchievementBadgeRole_achievementId_fkey"
    FOREIGN KEY ("achievementId") REFERENCES "AchievementDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
