CREATE TABLE "QuestEventApplication" (
  "id" TEXT NOT NULL,
  "questId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "progressKey" TEXT,
  "increment" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuestEventApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestEventApplication_questId_eventId_key"
ON "QuestEventApplication"("questId", "eventId");

CREATE INDEX "QuestEventApplication_questId_progressKey_idx"
ON "QuestEventApplication"("questId", "progressKey");

ALTER TABLE "QuestEventApplication"
ADD CONSTRAINT "QuestEventApplication_questId_fkey"
FOREIGN KEY ("questId") REFERENCES "UserDailyQuest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
