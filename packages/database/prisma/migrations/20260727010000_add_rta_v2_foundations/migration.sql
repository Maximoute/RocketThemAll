-- RTA V2 is introduced additively. Legacy columns and tables remain available
-- while callers move to the transactional services.

CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
CREATE TYPE "ZoneAccess" AS ENUM ('FREE', 'PREMIUM');
CREATE TYPE "DangerProfile" AS ENUM ('CALM', 'UNSTABLE', 'DANGEROUS', 'CRITICAL', 'EXTREME', 'LIMITED');
CREATE TYPE "GuildProgressState" AS ENUM ('LOCKED', 'PROGRESSING', 'BOSS_READY', 'BOSS_ACTIVE', 'BOSS_DEFEATED');
CREATE TYPE "GuildHubStatus" AS ENUM ('ACTIVE', 'REPLACED', 'DELETED');
CREATE TYPE "EncounterStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'RESOLVING', 'RESOLVED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "CaptureAttemptStatus" AS ENUM ('SUBMITTED', 'SUCCEEDED', 'FAILED', 'REJECTED');
CREATE TYPE "LedgerAsset" AS ENUM ('CREDITS', 'FRAGMENTS', 'CARD', 'ITEM', 'BOOSTER', 'XP', 'SKILL_POINT', 'GUILD_MASTERY');
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');
CREATE TYPE "ScheduledJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "ItemType" AS ENUM ('ARTIFACT', 'CONSUMABLE', 'OFFERING', 'SOUVENIR', 'BOOSTER', 'CHEST');
CREATE TYPE "SkillBranch" AS ENUM ('EXPLORER', 'HUNTER', 'COLLECTOR');
CREATE TYPE "DailyQuestStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CLAIMED', 'EXPIRED');
CREATE TYPE "BossKind" AS ENUM ('REGULAR', 'GUARDIAN');
CREATE TYPE "BossRunStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'DEFEATED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "User"
  ADD COLUMN "balanceVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User"
  ADD CONSTRAINT "User_nonnegative_balances_check"
  CHECK ("credits" >= 0 AND "fragments" >= 0 AND "xp" >= 0 AND "spawnCharges" >= 0)
  NOT VALID;

ALTER TABLE "Deck"
  ADD COLUMN "contentKey" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "retiredAt" TIMESTAMP(3),
  ADD COLUMN "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "worldId" TEXT;

ALTER TABLE "Card"
  ADD COLUMN "contentKey" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "licenseProofUrl" TEXT,
  ADD COLUMN "licenseStatus" TEXT,
  ADD COLUMN "retiredAt" TIMESTAMP(3),
  ADD COLUMN "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT';

ALTER TABLE "InventoryItem"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_quantity_check" CHECK ("quantity" >= 0) NOT VALID;

ALTER TABLE "UserBooster"
  ADD CONSTRAINT "UserBooster_quantity_check" CHECK ("quantity" >= 0) NOT VALID;

ALTER TABLE "Trade"
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "executionKey" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Trade"
  ADD CONSTRAINT "Trade_credit_values_check"
  CHECK ("user1Credits" >= 0 AND "user2Credits" >= 0)
  NOT VALID;

ALTER TABLE "AppConfig"
  ALTER COLUMN "normalVariantRate" SET DEFAULT 0.989,
  ALTER COLUMN "shinyVariantRate" SET DEFAULT 0.01,
  ALTER COLUMN "holoVariantRate" SET DEFAULT 0.001;

UPDATE "AppConfig"
SET "normalVariantRate" = 0.989,
    "shinyVariantRate" = 0.01,
    "holoVariantRate" = 0.001
WHERE "normalVariantRate" = 0.94
  AND "shinyVariantRate" = 0.05
  AND "holoVariantRate" = 0.01;

CREATE TABLE "WorldDefinition" (
  "id" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "minLevel" INTEGER NOT NULL DEFAULT 0,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorldDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorldDefinition_position_check" CHECK ("position" BETWEEN 1 AND 9),
  CONSTRAINT "WorldDefinition_minLevel_check" CHECK ("minLevel" >= 0)
);

CREATE TABLE "ZoneDefinition" (
  "id" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "worldId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "access" "ZoneAccess" NOT NULL,
  "danger" "DangerProfile" NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ZoneDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ZoneDefinition_position_check" CHECK ("position" BETWEEN 1 AND 9)
);

CREATE TABLE "ZoneDeck" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "deckId" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ZoneDeck_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ZoneDeck_weight_check" CHECK ("weight" > 0)
);

CREATE TABLE "Guild" (
  "id" TEXT NOT NULL,
  "discordId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuildConfiguration" (
  "guildId" TEXT NOT NULL,
  "gameChannelId" TEXT,
  "adminRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "locale" TEXT NOT NULL DEFAULT 'fr',
  "premiumEnabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuildConfiguration_pkey" PRIMARY KEY ("guildId"),
  CONSTRAINT "GuildConfiguration_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "GuildMember" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActiveAt" TIMESTAMP(3),
  CONSTRAINT "GuildMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserProgress" (
  "userId" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "unspentSkillPoints" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserProgress_values_check" CHECK (
    "level" >= 1 AND "xp" >= 0 AND "unspentSkillPoints" >= 0 AND "version" >= 0
  )
);

CREATE TABLE "GuildProgress" (
  "guildId" TEXT NOT NULL,
  "state" "GuildProgressState" NOT NULL DEFAULT 'PROGRESSING',
  "frontierWorldId" TEXT,
  "mastery" INTEGER NOT NULL DEFAULT 0,
  "masteryTarget" INTEGER NOT NULL DEFAULT 0,
  "unlockedWorldCount" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuildProgress_pkey" PRIMARY KEY ("guildId"),
  CONSTRAINT "GuildProgress_values_check" CHECK (
    "mastery" >= 0 AND "masteryTarget" >= 0
    AND "unlockedWorldCount" BETWEEN 1 AND 9 AND "version" >= 0
  )
);

CREATE TABLE "GuildWorldProgress" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "worldId" TEXT NOT NULL,
  "state" "GuildProgressState" NOT NULL DEFAULT 'LOCKED',
  "mastery" INTEGER NOT NULL DEFAULT 0,
  "unlockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "GuildWorldProgress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuildWorldProgress_values_check" CHECK ("mastery" >= 0 AND "version" >= 0)
);

CREATE TABLE "GuildHub" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "status" "GuildHubStatus" NOT NULL DEFAULT 'ACTIVE',
  "activeKey" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuildHub_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuildHub_active_key_check" CHECK (
    ("status" = 'ACTIVE' AND "activeKey" = "guildId")
    OR ("status" <> 'ACTIVE' AND "activeKey" IS NULL)
  ),
  CONSTRAINT "GuildHub_revision_check" CHECK ("revision" >= 0)
);

CREATE TABLE "Encounter" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "messageId" TEXT,
  "status" "EncounterStatus" NOT NULL DEFAULT 'SCHEDULED',
  "seedHash" TEXT NOT NULL,
  "opensAt" TIMESTAMP(3) NOT NULL,
  "closesAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Encounter_window_check" CHECK ("closesAt" > "opensAt"),
  CONSTRAINT "Encounter_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "CaptureAttempt" (
  "id" TEXT NOT NULL,
  "encounterId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "CaptureAttemptStatus" NOT NULL DEFAULT 'SUBMITTED',
  "answerCorrect" BOOLEAN NOT NULL,
  "preparation" TEXT NOT NULL,
  "progressionBonus" INTEGER NOT NULL,
  "targetPenalty" INTEGER NOT NULL,
  "chancePermille" INTEGER NOT NULL,
  "randomRollMillion" INTEGER,
  "variant" "CardVariant",
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "rewardEventId" TEXT,
  CONSTRAINT "CaptureAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CaptureAttempt_preparation_check" CHECK ("preparation" IN ('none', 'partial', 'complete')),
  CONSTRAINT "CaptureAttempt_progression_check" CHECK ("progressionBonus" BETWEEN 0 AND 3),
  CONSTRAINT "CaptureAttempt_penalty_check" CHECK ("targetPenalty" BETWEEN 0 AND 20),
  CONSTRAINT "CaptureAttempt_chance_check" CHECK ("chancePermille" BETWEEN 50 AND 995),
  CONSTRAINT "CaptureAttempt_roll_check" CHECK (
    "randomRollMillion" IS NULL OR "randomRollMillion" BETWEEN 0 AND 999999
  )
);

CREATE TABLE "ActionCooldown" (
  "id" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "userId" TEXT,
  "guildId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActionCooldown_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionCooldown_scope_check" CHECK ("userId" IS NOT NULL OR "guildId" IS NOT NULL),
  CONSTRAINT "ActionCooldown_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "response" JSONB,
  "responseCode" INTEGER,
  "errorCode" TEXT,
  "correlationId" TEXT,
  "lockedUntil" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdempotencyRecord_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "EconomicLedgerEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "guildId" TEXT,
  "asset" "LedgerAsset" NOT NULL,
  "assetKey" TEXT,
  "delta" INTEGER NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "correlationId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EconomicLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EconomicLedgerEntry_owner_check" CHECK ("userId" IS NOT NULL OR "guildId" IS NOT NULL),
  CONSTRAINT "EconomicLedgerEntry_balance_check" CHECK (
    "balanceAfter" = "balanceBefore" + "delta" AND "balanceAfter" >= 0
  )
);

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventVersion" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "correlationId" TEXT,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "publishedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboxEvent_values_check" CHECK ("eventVersion" > 0 AND "attempts" >= 0)
);

CREATE TABLE "ScheduledJob" (
  "id" TEXT NOT NULL,
  "queue" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "ScheduledJobStatus" NOT NULL DEFAULT 'PENDING',
  "runAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduledJob_attempts_check" CHECK (
    "attempts" >= 0 AND "maxAttempts" > 0 AND "attempts" <= "maxAttempts"
  )
);

CREATE TABLE "ItemDefinition" (
  "id" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ItemType" NOT NULL,
  "effectKey" TEXT,
  "effectParams" JSONB,
  "maxStack" INTEGER NOT NULL DEFAULT 1,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ItemDefinition_maxStack_check" CHECK ("maxStack" > 0)
);

CREATE TABLE "UserItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserItem_values_check" CHECK ("quantity" >= 0 AND "version" >= 0)
);

CREATE TABLE "EquippedArtifact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "equippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquippedArtifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EquippedArtifact_slot_check" CHECK ("slot" BETWEEN 1 AND 3)
);

CREATE TABLE "SkillDefinition" (
  "id" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "branch" "SkillBranch" NOT NULL,
  "tier" INTEGER NOT NULL,
  "maxRank" INTEGER NOT NULL DEFAULT 1,
  "prerequisites" JSONB,
  "effectKey" TEXT NOT NULL,
  "effectParams" JSONB NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SkillDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SkillDefinition_values_check" CHECK ("tier" > 0 AND "maxRank" > 0)
);

CREATE TABLE "UserSkill" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserSkill_rank_check" CHECK ("rank" >= 0)
);

CREATE TABLE "UserSkillState" (
  "userId" TEXT NOT NULL,
  "committedBranch" "SkillBranch",
  "commitmentRank" INTEGER NOT NULL DEFAULT 0,
  "resetCount" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSkillState_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserSkillState_values_check" CHECK (
    "commitmentRank" >= 0 AND "resetCount" >= 0 AND "version" >= 0
  )
);

CREATE TABLE "QuestDefinition" (
  "id" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "objectiveKey" TEXT NOT NULL,
  "target" INTEGER NOT NULL,
  "minLevel" INTEGER NOT NULL DEFAULT 1,
  "maxLevel" INTEGER,
  "reward" JSONB NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuestDefinition_values_check" CHECK (
    "target" > 0 AND "minLevel" >= 1 AND ("maxLevel" IS NULL OR "maxLevel" >= "minLevel")
  )
);

CREATE TABLE "UserDailyQuest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "targetSnapshot" INTEGER NOT NULL,
  "rewardSnapshot" JSONB NOT NULL,
  "status" "DailyQuestStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserDailyQuest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserDailyQuest_values_check" CHECK (
    "slot" BETWEEN 0 AND 2 AND "progress" >= 0
    AND "targetSnapshot" > 0 AND "version" >= 0 AND "expiresAt" > "createdAt"
  )
);

CREATE TABLE "AchievementDefinition" (
  "id" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "objectiveKey" TEXT NOT NULL,
  "target" INTEGER NOT NULL,
  "reward" JSONB,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AchievementDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AchievementDefinition_target_check" CHECK ("target" > 0)
);

CREATE TABLE "UserAchievement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "achievementId" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "unlockedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserAchievement_values_check" CHECK ("progress" >= 0 AND "version" >= 0)
);

CREATE TABLE "BossDefinition" (
  "id" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "worldId" TEXT,
  "name" TEXT NOT NULL,
  "kind" "BossKind" NOT NULL,
  "baseTarget" INTEGER NOT NULL,
  "durationHours" INTEGER NOT NULL,
  "reward" JSONB NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BossDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BossDefinition_values_check" CHECK ("baseTarget" > 0 AND "durationHours" > 0)
);

CREATE TABLE "BossRun" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "slotKey" TEXT NOT NULL,
  "status" "BossRunStatus" NOT NULL DEFAULT 'SCHEDULED',
  "targetSnapshot" INTEGER NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "activePlayers" INTEGER NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "defeatedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BossRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BossRun_values_check" CHECK (
    "targetSnapshot" > 0 AND "progress" >= 0 AND "activePlayers" >= 0
    AND "version" >= 0 AND "endsAt" > "startsAt"
  )
);

CREATE TABLE "BossContribution" (
  "id" TEXT NOT NULL,
  "bossRunId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "destructive" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BossContribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BossContribution_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "guildId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeatureFlag_version_check" CHECK ("version" >= 0)
);

CREATE UNIQUE INDEX "WorldDefinition_contentKey_key" ON "WorldDefinition"("contentKey");
CREATE UNIQUE INDEX "WorldDefinition_position_key" ON "WorldDefinition"("position");
CREATE INDEX "WorldDefinition_status_position_idx" ON "WorldDefinition"("status", "position");
CREATE UNIQUE INDEX "ZoneDefinition_contentKey_key" ON "ZoneDefinition"("contentKey");
CREATE UNIQUE INDEX "ZoneDefinition_worldId_position_key" ON "ZoneDefinition"("worldId", "position");
CREATE INDEX "ZoneDefinition_worldId_access_status_idx" ON "ZoneDefinition"("worldId", "access", "status");
CREATE UNIQUE INDEX "ZoneDeck_zoneId_deckId_key" ON "ZoneDeck"("zoneId", "deckId");
CREATE INDEX "ZoneDeck_deckId_idx" ON "ZoneDeck"("deckId");
CREATE UNIQUE INDEX "Guild_discordId_key" ON "Guild"("discordId");
CREATE INDEX "Guild_isActive_idx" ON "Guild"("isActive");
CREATE UNIQUE INDEX "GuildMember_guildId_userId_key" ON "GuildMember"("guildId", "userId");
CREATE INDEX "GuildMember_userId_isActive_idx" ON "GuildMember"("userId", "isActive");
CREATE INDEX "GuildMember_guildId_lastActiveAt_idx" ON "GuildMember"("guildId", "lastActiveAt");
CREATE INDEX "GuildProgress_state_idx" ON "GuildProgress"("state");
CREATE UNIQUE INDEX "GuildWorldProgress_guildId_worldId_key" ON "GuildWorldProgress"("guildId", "worldId");
CREATE INDEX "GuildWorldProgress_guildId_state_idx" ON "GuildWorldProgress"("guildId", "state");
CREATE UNIQUE INDEX "GuildHub_activeKey_key" ON "GuildHub"("activeKey");
CREATE UNIQUE INDEX "GuildHub_guildId_messageId_key" ON "GuildHub"("guildId", "messageId");
CREATE INDEX "GuildHub_guildId_status_idx" ON "GuildHub"("guildId", "status");
CREATE UNIQUE INDEX "Encounter_guildId_messageId_key" ON "Encounter"("guildId", "messageId");
CREATE INDEX "Encounter_guildId_status_closesAt_idx" ON "Encounter"("guildId", "status", "closesAt");
CREATE INDEX "Encounter_status_closesAt_idx" ON "Encounter"("status", "closesAt");
CREATE UNIQUE INDEX "CaptureAttempt_rewardEventId_key" ON "CaptureAttempt"("rewardEventId");
CREATE UNIQUE INDEX "CaptureAttempt_encounterId_userId_key" ON "CaptureAttempt"("encounterId", "userId");
CREATE INDEX "CaptureAttempt_userId_submittedAt_idx" ON "CaptureAttempt"("userId", "submittedAt");
CREATE INDEX "CaptureAttempt_encounterId_status_idx" ON "CaptureAttempt"("encounterId", "status");
CREATE UNIQUE INDEX "ActionCooldown_scopeKey_key" ON "ActionCooldown"("scopeKey");
CREATE INDEX "ActionCooldown_expiresAt_idx" ON "ActionCooldown"("expiresAt");
CREATE INDEX "ActionCooldown_userId_action_idx" ON "ActionCooldown"("userId", "action");
CREATE INDEX "ActionCooldown_guildId_action_idx" ON "ActionCooldown"("guildId", "action");
CREATE UNIQUE INDEX "IdempotencyRecord_scopeKey_key" ON "IdempotencyRecord"("scopeKey");
CREATE UNIQUE INDEX "IdempotencyRecord_scope_key_key" ON "IdempotencyRecord"("scope", "key");
CREATE INDEX "IdempotencyRecord_status_lockedUntil_idx" ON "IdempotencyRecord"("status", "lockedUntil");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
CREATE UNIQUE INDEX "EconomicLedgerEntry_operationKey_key" ON "EconomicLedgerEntry"("operationKey");
CREATE INDEX "EconomicLedgerEntry_userId_createdAt_idx" ON "EconomicLedgerEntry"("userId", "createdAt");
CREATE INDEX "EconomicLedgerEntry_guildId_createdAt_idx" ON "EconomicLedgerEntry"("guildId", "createdAt");
CREATE INDEX "EconomicLedgerEntry_referenceType_referenceId_idx" ON "EconomicLedgerEntry"("referenceType", "referenceId");
CREATE INDEX "EconomicLedgerEntry_asset_createdAt_idx" ON "EconomicLedgerEntry"("asset", "createdAt");
CREATE UNIQUE INDEX "OutboxEvent_eventId_key" ON "OutboxEvent"("eventId");
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_createdAt_idx" ON "OutboxEvent"("aggregateType", "aggregateId", "createdAt");
CREATE UNIQUE INDEX "ScheduledJob_dedupeKey_key" ON "ScheduledJob"("dedupeKey");
CREATE INDEX "ScheduledJob_queue_status_runAt_idx" ON "ScheduledJob"("queue", "status", "runAt");
CREATE INDEX "ScheduledJob_status_lockedAt_idx" ON "ScheduledJob"("status", "lockedAt");
CREATE UNIQUE INDEX "ItemDefinition_contentKey_key" ON "ItemDefinition"("contentKey");
CREATE UNIQUE INDEX "UserItem_userId_itemId_key" ON "UserItem"("userId", "itemId");
CREATE INDEX "UserItem_userId_idx" ON "UserItem"("userId");
CREATE UNIQUE INDEX "EquippedArtifact_userId_slot_key" ON "EquippedArtifact"("userId", "slot");
CREATE UNIQUE INDEX "EquippedArtifact_userId_itemId_key" ON "EquippedArtifact"("userId", "itemId");
CREATE UNIQUE INDEX "SkillDefinition_contentKey_key" ON "SkillDefinition"("contentKey");
CREATE INDEX "SkillDefinition_branch_tier_idx" ON "SkillDefinition"("branch", "tier");
CREATE UNIQUE INDEX "UserSkill_userId_skillId_key" ON "UserSkill"("userId", "skillId");
CREATE INDEX "UserSkill_userId_idx" ON "UserSkill"("userId");
CREATE UNIQUE INDEX "QuestDefinition_contentKey_key" ON "QuestDefinition"("contentKey");
CREATE INDEX "QuestDefinition_eventType_status_idx" ON "QuestDefinition"("eventType", "status");
CREATE UNIQUE INDEX "UserDailyQuest_userId_dayKey_slot_key" ON "UserDailyQuest"("userId", "dayKey", "slot");
CREATE INDEX "UserDailyQuest_userId_status_expiresAt_idx" ON "UserDailyQuest"("userId", "status", "expiresAt");
CREATE INDEX "UserDailyQuest_status_expiresAt_idx" ON "UserDailyQuest"("status", "expiresAt");
CREATE UNIQUE INDEX "AchievementDefinition_contentKey_key" ON "AchievementDefinition"("contentKey");
CREATE INDEX "AchievementDefinition_eventType_status_idx" ON "AchievementDefinition"("eventType", "status");
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");
CREATE INDEX "UserAchievement_userId_unlockedAt_idx" ON "UserAchievement"("userId", "unlockedAt");
CREATE UNIQUE INDEX "BossDefinition_contentKey_key" ON "BossDefinition"("contentKey");
CREATE INDEX "BossDefinition_kind_status_idx" ON "BossDefinition"("kind", "status");
CREATE UNIQUE INDEX "BossRun_guildId_slotKey_key" ON "BossRun"("guildId", "slotKey");
CREATE INDEX "BossRun_guildId_status_idx" ON "BossRun"("guildId", "status");
CREATE INDEX "BossRun_status_startsAt_endsAt_idx" ON "BossRun"("status", "startsAt", "endsAt");
CREATE UNIQUE INDEX "BossContribution_operationKey_key" ON "BossContribution"("operationKey");
CREATE INDEX "BossContribution_bossRunId_createdAt_idx" ON "BossContribution"("bossRunId", "createdAt");
CREATE INDEX "BossContribution_userId_createdAt_idx" ON "BossContribution"("userId", "createdAt");
CREATE UNIQUE INDEX "FeatureFlag_scopeKey_key" ON "FeatureFlag"("scopeKey");
CREATE INDEX "FeatureFlag_key_enabled_idx" ON "FeatureFlag"("key", "enabled");
CREATE INDEX "FeatureFlag_guildId_key_idx" ON "FeatureFlag"("guildId", "key");
CREATE UNIQUE INDEX "Deck_contentKey_key" ON "Deck"("contentKey");
CREATE INDEX "Deck_worldId_status_idx" ON "Deck"("worldId", "status");
CREATE UNIQUE INDEX "Card_contentKey_key" ON "Card"("contentKey");
CREATE UNIQUE INDEX "Trade_executionKey_key" ON "Trade"("executionKey");
CREATE INDEX "Trade_status_expiresAt_idx" ON "Trade"("status", "expiresAt");

ALTER TABLE "Deck" ADD CONSTRAINT "Deck_worldId_fkey"
  FOREIGN KEY ("worldId") REFERENCES "WorldDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ZoneDefinition" ADD CONSTRAINT "ZoneDefinition_worldId_fkey"
  FOREIGN KEY ("worldId") REFERENCES "WorldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZoneDeck" ADD CONSTRAINT "ZoneDeck_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "ZoneDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZoneDeck" ADD CONSTRAINT "ZoneDeck_deckId_fkey"
  FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildConfiguration" ADD CONSTRAINT "GuildConfiguration_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildProgress" ADD CONSTRAINT "GuildProgress_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildProgress" ADD CONSTRAINT "GuildProgress_frontierWorldId_fkey"
  FOREIGN KEY ("frontierWorldId") REFERENCES "WorldDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuildWorldProgress" ADD CONSTRAINT "GuildWorldProgress_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildWorldProgress" ADD CONSTRAINT "GuildWorldProgress_worldId_fkey"
  FOREIGN KEY ("worldId") REFERENCES "WorldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuildHub" ADD CONSTRAINT "GuildHub_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "ZoneDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CaptureAttempt" ADD CONSTRAINT "CaptureAttempt_encounterId_fkey"
  FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaptureAttempt" ADD CONSTRAINT "CaptureAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomicLedgerEntry" ADD CONSTRAINT "EconomicLedgerEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EconomicLedgerEntry" ADD CONSTRAINT "EconomicLedgerEntry_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserItem" ADD CONSTRAINT "UserItem_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "ItemDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquippedArtifact" ADD CONSTRAINT "EquippedArtifact_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquippedArtifact" ADD CONSTRAINT "EquippedArtifact_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "ItemDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_skillId_fkey"
  FOREIGN KEY ("skillId") REFERENCES "SkillDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserSkillState" ADD CONSTRAINT "UserSkillState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDailyQuest" ADD CONSTRAINT "UserDailyQuest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDailyQuest" ADD CONSTRAINT "UserDailyQuest_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "QuestDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey"
  FOREIGN KEY ("achievementId") REFERENCES "AchievementDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BossDefinition" ADD CONSTRAINT "BossDefinition_worldId_fkey"
  FOREIGN KEY ("worldId") REFERENCES "WorldDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BossRun" ADD CONSTRAINT "BossRun_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BossRun" ADD CONSTRAINT "BossRun_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "BossDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BossContribution" ADD CONSTRAINT "BossContribution_bossRunId_fkey"
  FOREIGN KEY ("bossRunId") REFERENCES "BossRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BossContribution" ADD CONSTRAINT "BossContribution_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deterministic additive backfills from the legacy global/player and guild tables.
INSERT INTO "UserProgress" ("userId", "level", "xp", "unspentSkillPoints", "version", "updatedAt")
SELECT "id", GREATEST("level", 1), GREATEST("xp", 0), GREATEST("level" - 1, 0), 0, CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "Guild" ("id", "discordId", "name", "isActive", "createdAt", "updatedAt")
SELECT 'legacy-guild:' || "guildId", "guildId", "guildName", "isActive", "createdAt", "updatedAt"
FROM "BotGuildConfig"
ON CONFLICT ("discordId") DO NOTHING;

INSERT INTO "GuildConfiguration" (
  "guildId", "gameChannelId", "adminRoleIds", "timezone", "locale",
  "premiumEnabled", "version", "updatedAt"
)
SELECT g."id", legacy."spawnChannelId", ARRAY[]::TEXT[], 'UTC', 'fr', false, 0, CURRENT_TIMESTAMP
FROM "BotGuildConfig" legacy
JOIN "Guild" g ON g."discordId" = legacy."guildId"
ON CONFLICT ("guildId") DO NOTHING;

INSERT INTO "GuildProgress" (
  "guildId", "state", "mastery", "masteryTarget", "unlockedWorldCount", "version", "updatedAt"
)
SELECT "id", 'PROGRESSING', 0, 0, 1, 0, CURRENT_TIMESTAMP
FROM "Guild"
ON CONFLICT ("guildId") DO NOTHING;
