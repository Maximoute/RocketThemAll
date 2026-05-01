ALTER TABLE "Card" ADD COLUMN "source" TEXT DEFAULT 'manual';
ALTER TABLE "Card" ADD COLUMN "sourceId" TEXT;
CREATE INDEX "Card_source_idx" ON "Card"("source");
CREATE INDEX "Card_sourceId_idx" ON "Card"("sourceId");
