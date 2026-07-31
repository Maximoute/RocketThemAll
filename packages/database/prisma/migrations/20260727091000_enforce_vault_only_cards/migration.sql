UPDATE "Card"
SET "source" = 'vault'
WHERE "source" IS NULL;

ALTER TABLE "Card"
  ALTER COLUMN "source" SET DEFAULT 'vault',
  ALTER COLUMN "source" SET NOT NULL;

ALTER TABLE "Card"
  ADD CONSTRAINT "Card_vault_source_only_check"
  CHECK ("source" = 'vault');
