ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Card_deletedAt_idx" ON "Card"("deletedAt");
