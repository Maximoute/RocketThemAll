ALTER TABLE "BossRun"
  ADD COLUMN "isPersistent" BOOLEAN NOT NULL DEFAULT false;

-- World guardians already in progress become permanent immediately. Their
-- objective and contributions stay untouched.
UPDATE "BossRun" AS run
SET "isPersistent" = true,
    "endsAt" = TIMESTAMP '9999-12-31 23:59:59.999',
    "objectiveSnapshot" = jsonb_set(
      run."objectiveSnapshot",
      '{specialOfferings,voidFlower,maximum}',
      '0'::jsonb,
      true
    ),
    "version" = run."version" + 1
FROM "BossDefinition" AS definition
WHERE definition."id" = run."definitionId"
  AND definition."kind" = 'GUARDIAN'
  AND run."status" IN ('SCHEDULED', 'ACTIVE');

-- Persistent guardians have no expiration job. Daily/regular boss jobs remain
-- unchanged.
UPDATE "ScheduledJob"
SET "status" = 'CANCELLED',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'boss.expire'
  AND "status" = 'PENDING'
  AND ("payload"->>'bossRunId') IN (
    SELECT run."id"
    FROM "BossRun" AS run
    WHERE run."isPersistent" = true
      AND run."status" IN ('SCHEDULED', 'ACTIVE')
  );

CREATE INDEX "BossRun_guildId_isPersistent_status_idx"
  ON "BossRun"("guildId", "isPersistent", "status");
