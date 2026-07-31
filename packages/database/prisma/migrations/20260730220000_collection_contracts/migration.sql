CREATE TYPE "CollectionContractType" AS ENUM ('SEARCH', 'DONATION');
CREATE TYPE "CollectionContractStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "CollectionContract" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "fulfilledByUserId" TEXT,
  "cardId" TEXT NOT NULL,
  "type" "CollectionContractType" NOT NULL,
  "status" "CollectionContractStatus" NOT NULL DEFAULT 'OPEN',
  "rewardCredits" INTEGER NOT NULL DEFAULT 0,
  "channelId" TEXT,
  "messageId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectionContract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollectionContract_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CollectionContract_requesterUserId_fkey"
    FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CollectionContract_fulfilledByUserId_fkey"
    FOREIGN KEY ("fulfilledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CollectionContract_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CollectionContract_guildId_status_createdAt_idx"
  ON "CollectionContract"("guildId", "status", "createdAt");
CREATE INDEX "CollectionContract_requesterUserId_status_idx"
  ON "CollectionContract"("requesterUserId", "status");
CREATE INDEX "CollectionContract_fulfilledByUserId_completedAt_idx"
  ON "CollectionContract"("fulfilledByUserId", "completedAt");
CREATE INDEX "CollectionContract_status_expiresAt_idx"
  ON "CollectionContract"("status", "expiresAt");
CREATE INDEX "CollectionContract_cardId_status_idx"
  ON "CollectionContract"("cardId", "status");
