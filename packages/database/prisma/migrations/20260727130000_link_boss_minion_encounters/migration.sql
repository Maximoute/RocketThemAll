ALTER TABLE "Encounter"
ADD COLUMN "bossRunId" TEXT,
ADD COLUMN "bossMinion" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Encounter_bossRunId_bossMinion_idx"
ON "Encounter"("bossRunId", "bossMinion");

ALTER TABLE "Encounter"
ADD CONSTRAINT "Encounter_bossRunId_fkey"
FOREIGN KEY ("bossRunId") REFERENCES "BossRun"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
