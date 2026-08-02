ALTER TABLE "GuildConfiguration"
  ADD COLUMN "bossAnnouncementChannelId" TEXT,
  ADD COLUMN "bossAnnouncementEnabled" BOOLEAN NOT NULL DEFAULT false;
