-- Repair fields and referential actions that existed in the Prisma schema
-- but were absent from the legacy migration history.

ALTER TABLE "AppConfig"
  ADD COLUMN IF NOT EXISTS "forceSpawnCardId" TEXT,
  ALTER COLUMN "basicBoosterPrice" SET DEFAULT 1000,
  ALTER COLUMN "rareBoosterPrice" SET DEFAULT 3000,
  ALTER COLUMN "epicBoosterPrice" SET DEFAULT 10000,
  ALTER COLUMN "legendaryBoosterPrice" SET DEFAULT 30000;

ALTER TABLE "Card"
  ADD COLUMN IF NOT EXISTS "category" TEXT;

ALTER TABLE "Rarity"
  ADD COLUMN IF NOT EXISTS "catchRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

CREATE INDEX IF NOT EXISTS "Card_category_idx" ON "Card"("category");

ALTER TABLE "SpawnChargeLog"
  DROP CONSTRAINT IF EXISTS "SpawnChargeLog_userId_fkey";
ALTER TABLE "SpawnChargeLog"
  ADD CONSTRAINT "SpawnChargeLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryItem"
  DROP CONSTRAINT IF EXISTS "InventoryItem_cardId_fkey";
ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TradeItem"
  DROP CONSTRAINT IF EXISTS "TradeItem_cardId_fkey";
ALTER TABLE "TradeItem"
  ADD CONSTRAINT "TradeItem_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CaptureLog"
  DROP CONSTRAINT IF EXISTS "CaptureLog_cardId_fkey";
ALTER TABLE "CaptureLog"
  ADD CONSTRAINT "CaptureLog_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransactionLog"
  DROP CONSTRAINT IF EXISTS "TransactionLog_userId_fkey";
ALTER TABLE "TransactionLog"
  ADD CONSTRAINT "TransactionLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CollectionRewardClaim"
  DROP CONSTRAINT IF EXISTS "CollectionRewardClaim_userId_fkey",
  DROP CONSTRAINT IF EXISTS "CollectionRewardClaim_deckId_fkey";
ALTER TABLE "CollectionRewardClaim"
  ADD CONSTRAINT "CollectionRewardClaim_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CollectionRewardClaim_deckId_fkey"
  FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
