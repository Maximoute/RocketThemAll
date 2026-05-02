ALTER TABLE "User"
ADD COLUMN "spawnCharges" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN "lastSpawnChargeRegenAt" TIMESTAMP(3);

ALTER TABLE "AppConfig"
ADD COLUMN "manualSpawnMaxCharges" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN "manualSpawnRegenHours" INTEGER NOT NULL DEFAULT 6;

CREATE TABLE "SpawnChargeLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "chargesBefore" INTEGER NOT NULL,
  "chargesAfter" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpawnChargeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpawnChargeLog_userId_createdAt_idx" ON "SpawnChargeLog"("userId", "createdAt");

ALTER TABLE "SpawnChargeLog"
ADD CONSTRAINT "SpawnChargeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;