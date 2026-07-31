ALTER TABLE "Encounter"
  ADD COLUMN "publishAfter" TIMESTAMP(3),
  ADD COLUMN "publicationClaimedAt" TIMESTAMP(3);

CREATE INDEX "Encounter_status_publishAfter_publishedAt_idx"
  ON "Encounter"("status", "publishAfter", "publishedAt");
