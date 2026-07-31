ALTER TABLE "Encounter"
  ADD COLUMN "initiatorResolvedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3);

DROP INDEX "Encounter_one_active_per_initiator_key";

CREATE UNIQUE INDEX "Encounter_one_private_per_initiator_key"
  ON "Encounter"("guildId", "initiatorUserId")
  WHERE
    "status" = 'ACTIVE'
    AND "initiatorUserId" IS NOT NULL
    AND "initiatorResolvedAt" IS NULL;
