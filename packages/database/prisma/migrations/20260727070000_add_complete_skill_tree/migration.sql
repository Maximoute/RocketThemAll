DO $$
BEGIN
  CREATE TYPE "SkillNodeKind" AS ENUM (
    'COMMON',
    'SPECIALIZATION_GATE',
    'SPECIALIZATION_UPGRADE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "SkillDefinition"
  ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "specialization" TEXT,
  ADD COLUMN IF NOT EXISTS "kind" "SkillNodeKind" NOT NULL DEFAULT 'COMMON',
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cost" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "grantsItemKey" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE "UserSkillState"
  ADD COLUMN IF NOT EXISTS "committedSpecialization" TEXT;

DROP INDEX IF EXISTS "SkillDefinition_branch_tier_idx";
CREATE INDEX IF NOT EXISTS "SkillDefinition_branch_sortOrder_idx"
  ON "SkillDefinition"("branch", "sortOrder");
