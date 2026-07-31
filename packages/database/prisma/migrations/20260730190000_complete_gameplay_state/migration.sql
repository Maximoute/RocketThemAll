ALTER TABLE "Encounter"
  ADD COLUMN "eventKey" TEXT,
  ADD COLUMN "eventSpecial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "eventMetadata" JSONB;

ALTER TABLE "UserDailyQuest"
  ADD COLUMN "contextSnapshot" JSONB;

CREATE TABLE "UserGameplayState" (
  "userId" TEXT NOT NULL,
  "explorations" INTEGER NOT NULL DEFAULT 0,
  "successfulExplorations" INTEGER NOT NULL DEFAULT 0,
  "captures" INTEGER NOT NULL DEFAULT 0,
  "captureFailures" INTEGER NOT NULL DEFAULT 0,
  "sameTierFailureKey" TEXT,
  "sameTierFailureCount" INTEGER NOT NULL DEFAULT 0,
  "rareMissStreak" INTEGER NOT NULL DEFAULT 0,
  "darkHuntMissStreak" INTEGER NOT NULL DEFAULT 0,
  "momentum" INTEGER NOT NULL DEFAULT 0,
  "chainSuccesses" INTEGER NOT NULL DEFAULT 0,
  "transmutations" INTEGER NOT NULL DEFAULT 0,
  "dailyStateKey" TEXT,
  "dailyState" JSONB,
  "weeklyStateKey" TEXT,
  "weeklyState" JSONB,
  "wishlistDeckId" TEXT,
  "counters" JSONB,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserGameplayState_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserGameplayState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserGameplayState_wishlistDeckId_idx"
  ON "UserGameplayState"("wishlistDeckId");

CREATE TABLE "ArchivedCard" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArchivedCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArchivedCard_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ArchivedCard_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ArchivedCard_inventoryItemId_key" ON "ArchivedCard"("inventoryItemId");
CREATE UNIQUE INDEX "ArchivedCard_userId_slot_key" ON "ArchivedCard"("userId", "slot");
CREATE INDEX "ArchivedCard_userId_idx" ON "ArchivedCard"("userId");

CREATE TABLE "ExplorationEventCompletion" (
  "id" TEXT NOT NULL,
  "encounterId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "isSpecial" BOOLEAN NOT NULL DEFAULT false,
  "succeeded" BOOLEAN NOT NULL,
  "reward" JSONB,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExplorationEventCompletion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExplorationEventCompletion_encounterId_fkey"
    FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExplorationEventCompletion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExplorationEventCompletion_encounterId_userId_key"
  ON "ExplorationEventCompletion"("encounterId", "userId");
CREATE INDEX "ExplorationEventCompletion_userId_completedAt_idx"
  ON "ExplorationEventCompletion"("userId", "completedAt");
CREATE INDEX "ExplorationEventCompletion_userId_isSpecial_completedAt_idx"
  ON "ExplorationEventCompletion"("userId", "isSpecial", "completedAt");
