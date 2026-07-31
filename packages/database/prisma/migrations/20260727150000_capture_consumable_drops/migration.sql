ALTER TABLE "AppConfig"
  ADD COLUMN "captureConsumableDropRate" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  ADD COLUMN "captureConsumableCommonWeight" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "captureConsumableUncommonWeight" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "captureConsumableRareWeight" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "captureConsumableEpicWeight" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "captureConsumableLegendaryWeight" INTEGER NOT NULL DEFAULT 1;
