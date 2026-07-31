CREATE TYPE "BossMechanic" AS ENUM (
  'OFFERING',
  'HARMONIZATION',
  'HUNT',
  'EXPEDITION_MINION',
  'COLLECTIVE_COLLECTION'
);

CREATE TYPE "BossCategory" AS ENUM (
  'WORLD_GUARDIAN',
  'TREASURE_GUARDIAN',
  'CARD_PREDATOR',
  'WORLD_INVADER'
);

ALTER TABLE "GuildConfiguration"
ADD COLUMN "progressionBossEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "progressionBossWeekday" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "progressionBossLocalTime" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN "regularBossEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "GuildConfiguration"
ALTER COLUMN "timezone" SET DEFAULT 'Europe/Paris';

UPDATE "GuildConfiguration"
SET "timezone" = 'Europe/Paris'
WHERE "timezone" = 'UTC';

ALTER TABLE "BossRun"
ADD COLUMN "progressionKey" TEXT,
ADD COLUMN "category" "BossCategory",
ADD COLUMN "mechanic" "BossMechanic",
ADD COLUMN "objectiveSnapshot" JSONB,
ADD COLUMN "rewardSnapshot" JSONB,
ADD COLUMN "channelId" TEXT,
ADD COLUMN "messageId" TEXT;

UPDATE "BossRun"
SET
  "category" = CASE
    WHEN "definitionId" IN (SELECT "id" FROM "BossDefinition" WHERE "kind" = 'GUARDIAN')
      THEN 'WORLD_GUARDIAN'::"BossCategory"
    ELSE 'TREASURE_GUARDIAN'::"BossCategory"
  END,
  "mechanic" = 'HUNT'::"BossMechanic",
  "objectiveSnapshot" = jsonb_build_object('label', 'Contribuer à la progression du boss'),
  "rewardSnapshot" = jsonb_build_object('credits', 100, 'xp', 50);

ALTER TABLE "BossRun"
ALTER COLUMN "category" SET NOT NULL,
ALTER COLUMN "mechanic" SET NOT NULL,
ALTER COLUMN "objectiveSnapshot" SET NOT NULL,
ALTER COLUMN "rewardSnapshot" SET NOT NULL;

ALTER TABLE "BossContribution"
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "resourceKey" TEXT;

CREATE TABLE "BossPresentedResource" (
  "id" TEXT NOT NULL,
  "bossRunId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "resourceKey" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BossPresentedResource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BossPresentedResource_scopeKey_key"
ON "BossPresentedResource"("scopeKey");
CREATE INDEX "BossPresentedResource_bossRunId_createdAt_idx"
ON "BossPresentedResource"("bossRunId", "createdAt");
CREATE INDEX "BossPresentedResource_userId_createdAt_idx"
ON "BossPresentedResource"("userId", "createdAt");

ALTER TABLE "BossPresentedResource"
ADD CONSTRAINT "BossPresentedResource_bossRunId_fkey"
FOREIGN KEY ("bossRunId") REFERENCES "BossRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BossPresentedResource"
ADD CONSTRAINT "BossPresentedResource_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BossRewardGrant" (
  "id" TEXT NOT NULL,
  "bossRunId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reward" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BossRewardGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BossRewardGrant_bossRunId_userId_key"
ON "BossRewardGrant"("bossRunId", "userId");
CREATE INDEX "BossRewardGrant_userId_createdAt_idx"
ON "BossRewardGrant"("userId", "createdAt");

ALTER TABLE "BossRewardGrant"
ADD CONSTRAINT "BossRewardGrant_bossRunId_fkey"
FOREIGN KEY ("bossRunId") REFERENCES "BossRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BossRewardGrant"
ADD CONSTRAINT "BossRewardGrant_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un seul boss actif ou planifié par serveur. Les statuts terminaux restent historisés.
CREATE UNIQUE INDEX "BossRun_single_open_per_guild_key"
ON "BossRun"("guildId")
WHERE "status" IN ('SCHEDULED', 'ACTIVE');
