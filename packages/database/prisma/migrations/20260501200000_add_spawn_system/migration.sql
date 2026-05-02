CREATE TYPE "SpawnType" AS ENUM ('auto', 'manual', 'admin');
CREATE TYPE "SpawnStatus" AS ENUM ('active', 'captured', 'expired', 'cancelled');

ALTER TABLE "User"
ADD COLUMN "lastManualSpawnAt" TIMESTAMP(3);

ALTER TABLE "AppConfig"
ADD COLUMN "autoSpawnEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "autoSpawnIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "manualSpawnEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "manualSpawnCooldownMinutes" INTEGER NOT NULL DEFAULT 120;

CREATE TABLE "SpawnLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "spawnType" "SpawnType" NOT NULL,
  "cardId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "status" "SpawnStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "capturedAt" TIMESTAMP(3),
  "capturedById" TEXT,
  CONSTRAINT "SpawnLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpawnLog_channelId_status_idx" ON "SpawnLog"("channelId", "status");
CREATE INDEX "SpawnLog_status_idx" ON "SpawnLog"("status");
CREATE INDEX "SpawnLog_createdAt_idx" ON "SpawnLog"("createdAt");

ALTER TABLE "SpawnLog"
ADD CONSTRAINT "SpawnLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SpawnLog"
ADD CONSTRAINT "SpawnLog_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SpawnLog"
ADD CONSTRAINT "SpawnLog_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
