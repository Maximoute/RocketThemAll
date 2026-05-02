ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "acceptedNames" JSONB;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "spawnEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "blacklistReason" TEXT;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "releaseYear" INTEGER;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "rarityScore" INTEGER;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "rarityFactors" JSONB;

CREATE TABLE IF NOT EXISTS "MovieImportBlacklist" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "MovieImportBlacklist_sourceId_key" ON "MovieImportBlacklist"("sourceId");
CREATE INDEX IF NOT EXISTS "MovieImportBlacklist_deck_reason_idx" ON "MovieImportBlacklist"("deck", "reason");
CREATE INDEX IF NOT EXISTS "MovieImportBlacklist_source_idx" ON "MovieImportBlacklist"("source");
