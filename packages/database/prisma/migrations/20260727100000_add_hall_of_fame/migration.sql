ALTER TABLE "GuildConfiguration"
ADD COLUMN "hallOfFameChannelId" TEXT;

CREATE TABLE "HallOfFameAnnouncement" (
    "id" TEXT NOT NULL,
    "captureAttemptId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HallOfFameAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HallOfFameAnnouncement_captureAttemptId_key"
ON "HallOfFameAnnouncement"("captureAttemptId");

CREATE INDEX "HallOfFameAnnouncement_status_updatedAt_idx"
ON "HallOfFameAnnouncement"("status", "updatedAt");

ALTER TABLE "HallOfFameAnnouncement"
ADD CONSTRAINT "HallOfFameAnnouncement_captureAttemptId_fkey"
FOREIGN KEY ("captureAttemptId")
REFERENCES "CaptureAttempt"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
