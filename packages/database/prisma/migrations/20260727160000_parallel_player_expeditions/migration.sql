ALTER TABLE "Encounter"
  ADD COLUMN "initiatorUserId" TEXT;

ALTER TABLE "Encounter"
  ADD CONSTRAINT "Encounter_initiatorUserId_fkey"
  FOREIGN KEY ("initiatorUserId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "Encounter_guildId_initiatorUserId_status_closesAt_idx"
  ON "Encounter"("guildId", "initiatorUserId", "status", "closesAt");

CREATE UNIQUE INDEX "Encounter_one_active_per_initiator_key"
  ON "Encounter"("guildId", "initiatorUserId")
  WHERE "status" = 'ACTIVE' AND "initiatorUserId" IS NOT NULL;
