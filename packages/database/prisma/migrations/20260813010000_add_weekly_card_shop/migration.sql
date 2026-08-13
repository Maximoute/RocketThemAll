CREATE TABLE "WeeklyCardOffer" (
  "id" TEXT NOT NULL,
  "weekKey" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "cardId" TEXT NOT NULL,
  "rarityName" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "circulationSnapshot" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyCardOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WeeklyCardOffer_slot_check" CHECK ("slot" BETWEEN 0 AND 5),
  CONSTRAINT "WeeklyCardOffer_price_check" CHECK ("price" > 0),
  CONSTRAINT "WeeklyCardOffer_circulation_check" CHECK ("circulationSnapshot" >= 0),
  CONSTRAINT "WeeklyCardOffer_window_check" CHECK ("startsAt" < "endsAt")
);

CREATE TABLE "WeeklyCardPurchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "priceSnapshot" INTEGER NOT NULL,
  "operationKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyCardPurchase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WeeklyCardPurchase_price_check" CHECK ("priceSnapshot" > 0)
);

CREATE UNIQUE INDEX "WeeklyCardOffer_weekKey_slot_key"
  ON "WeeklyCardOffer"("weekKey", "slot");
CREATE UNIQUE INDEX "WeeklyCardOffer_weekKey_cardId_key"
  ON "WeeklyCardOffer"("weekKey", "cardId");
CREATE INDEX "WeeklyCardOffer_weekKey_startsAt_endsAt_idx"
  ON "WeeklyCardOffer"("weekKey", "startsAt", "endsAt");
CREATE INDEX "WeeklyCardOffer_cardId_idx"
  ON "WeeklyCardOffer"("cardId");

CREATE UNIQUE INDEX "WeeklyCardPurchase_operationKey_key"
  ON "WeeklyCardPurchase"("operationKey");
CREATE UNIQUE INDEX "WeeklyCardPurchase_userId_offerId_key"
  ON "WeeklyCardPurchase"("userId", "offerId");
CREATE INDEX "WeeklyCardPurchase_userId_createdAt_idx"
  ON "WeeklyCardPurchase"("userId", "createdAt");
CREATE INDEX "WeeklyCardPurchase_offerId_idx"
  ON "WeeklyCardPurchase"("offerId");

CREATE INDEX "InventoryItem_cardId_idx"
  ON "InventoryItem"("cardId");

ALTER TABLE "WeeklyCardOffer"
  ADD CONSTRAINT "WeeklyCardOffer_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyCardPurchase"
  ADD CONSTRAINT "WeeklyCardPurchase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyCardPurchase"
  ADD CONSTRAINT "WeeklyCardPurchase_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "WeeklyCardOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
