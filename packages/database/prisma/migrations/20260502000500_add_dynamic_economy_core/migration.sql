DO $$ BEGIN
  CREATE TYPE "BoosterTier" AS ENUM ('basic', 'rare', 'epic', 'legendary');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CardVariant" AS ENUM ('normal', 'shiny', 'holo');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "InventoryItem"
ADD COLUMN IF NOT EXISTS "variant" "CardVariant" NOT NULL DEFAULT 'normal';

DROP INDEX IF EXISTS "InventoryItem_userId_cardId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_userId_cardId_variant_key" ON "InventoryItem"("userId", "cardId", "variant");
CREATE INDEX IF NOT EXISTS "InventoryItem_userId_cardId_idx" ON "InventoryItem"("userId", "cardId");

CREATE TABLE IF NOT EXISTS "UserBooster" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "boosterType" "BoosterTier" NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserBooster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserBooster_userId_boosterType_key" ON "UserBooster"("userId", "boosterType");
CREATE INDEX IF NOT EXISTS "UserBooster_userId_idx" ON "UserBooster"("userId");

ALTER TABLE "UserBooster"
ADD CONSTRAINT "UserBooster_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TradeItem"
ALTER COLUMN "cardId" DROP NOT NULL;

ALTER TABLE "TradeItem"
ADD COLUMN IF NOT EXISTS "boosterType" "BoosterTier",
ADD COLUMN IF NOT EXISTS "variant" "CardVariant" NOT NULL DEFAULT 'normal';

CREATE TABLE IF NOT EXISTS "EconomyLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "amount" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EconomyLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EconomyLog_type_createdAt_idx" ON "EconomyLog"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "EconomyLog_userId_createdAt_idx" ON "EconomyLog"("userId", "createdAt");

ALTER TABLE "EconomyLog"
ADD CONSTRAINT "EconomyLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppConfig"
ADD COLUMN IF NOT EXISTS "legendaryBoosterPrice" INTEGER NOT NULL DEFAULT 3000,
ADD COLUMN IF NOT EXISTS "basicToRareJackpotRate" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
ADD COLUMN IF NOT EXISTS "basicToEpicJackpotRate" DOUBLE PRECISION NOT NULL DEFAULT 0.005,
ADD COLUMN IF NOT EXISTS "basicToLegendaryJackpotRate" DOUBLE PRECISION NOT NULL DEFAULT 0.001,
ADD COLUMN IF NOT EXISTS "rareToEpicJackpotRate" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
ADD COLUMN IF NOT EXISTS "rareToLegendaryJackpotRate" DOUBLE PRECISION NOT NULL DEFAULT 0.005,
ADD COLUMN IF NOT EXISTS "epicToLegendaryJackpotRate" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
ADD COLUMN IF NOT EXISTS "normalVariantRate" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
ADD COLUMN IF NOT EXISTS "shinyVariantRate" DOUBLE PRECISION NOT NULL DEFAULT 0.09,
ADD COLUMN IF NOT EXISTS "holoVariantRate" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
ADD COLUMN IF NOT EXISTS "scarcityFloor" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS "scarcityCap" DOUBLE PRECISION NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS "fusionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "boosterPrices" JSONB,
ADD COLUMN IF NOT EXISTS "basePricesByRarity" JSONB,
ADD COLUMN IF NOT EXISTS "jackpotRates" JSONB,
ADD COLUMN IF NOT EXISTS "variantRates" JSONB;
