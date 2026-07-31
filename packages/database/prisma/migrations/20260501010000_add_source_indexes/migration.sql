-- CreateIndex
-- These indexes were already introduced by 20260430230000_add_import_fields.
-- IF NOT EXISTS keeps clean replays safe without changing an existing index.
CREATE INDEX IF NOT EXISTS "Card_source_idx" ON "Card"("source");
CREATE INDEX IF NOT EXISTS "Card_sourceId_idx" ON "Card"("sourceId");
