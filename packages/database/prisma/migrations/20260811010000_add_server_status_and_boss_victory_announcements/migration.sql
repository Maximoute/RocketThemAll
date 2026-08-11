ALTER TABLE "GuildConfiguration"
  ADD COLUMN "serverStatusChannelId" TEXT,
  ADD COLUMN "serverStatusEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "serverStatusMessageId" TEXT;

ALTER TABLE "BossRun"
  ADD COLUMN "victoryChannelId" TEXT,
  ADD COLUMN "victoryMessageId" TEXT;

-- Existing victories predate the central alert feature and must not flood Discord
-- when the new bot starts for the first time.
UPDATE "BossRun"
SET "victoryMessageId" = 'LEGACY'
WHERE "status" = 'DEFEATED';

CREATE INDEX "BossRun_status_victoryMessageId_idx"
  ON "BossRun"("status", "victoryMessageId");
