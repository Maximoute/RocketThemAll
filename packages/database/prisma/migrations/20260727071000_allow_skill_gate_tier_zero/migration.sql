ALTER TABLE "SkillDefinition"
  DROP CONSTRAINT IF EXISTS "SkillDefinition_values_check";

ALTER TABLE "SkillDefinition"
  ADD CONSTRAINT "SkillDefinition_values_check"
  CHECK (
    "tier" >= 0
    AND "maxRank" > 0
    AND "sortOrder" >= 0
    AND "cost" > 0
  );
