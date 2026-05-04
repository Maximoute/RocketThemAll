-- Card metadata for flexible capture aliases and custom rarity tuning
ALTER TABLE "Card"
  ADD COLUMN "acceptedNames" JSONB,
  ADD COLUMN "spawnEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "blacklistReason" TEXT,
  ADD COLUMN "releaseYear" INTEGER,
  ADD COLUMN "rarityScore" INTEGER,
  ADD COLUMN "rarityFactors" JSONB;

-- Track rejected TMDB movies (e.g., no poster) outside the active deck
CREATE TABLE "MovieImportBlacklist" (
  "id" TEXT NOT NULL,
  "deck" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MovieImportBlacklist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MovieImportBlacklist_sourceId_key" ON "MovieImportBlacklist"("sourceId");
CREATE INDEX "MovieImportBlacklist_deck_reason_idx" ON "MovieImportBlacklist"("deck", "reason");
CREATE INDEX "MovieImportBlacklist_source_idx" ON "MovieImportBlacklist"("source");
