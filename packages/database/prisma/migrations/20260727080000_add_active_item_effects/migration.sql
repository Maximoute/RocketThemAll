CREATE TABLE "UserItemEffect" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "effectKey" TEXT NOT NULL,
  "targetKey" TEXT,
  "remainingUses" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 0,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserItemEffect_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserItemEffect_values_check" CHECK ("remainingUses" >= 0 AND "version" >= 0)
);

CREATE UNIQUE INDEX "UserItemEffect_userId_effectKey_key"
  ON "UserItemEffect"("userId", "effectKey");
CREATE INDEX "UserItemEffect_userId_remainingUses_idx"
  ON "UserItemEffect"("userId", "remainingUses");
CREATE INDEX "UserItemEffect_expiresAt_idx"
  ON "UserItemEffect"("expiresAt");

ALTER TABLE "UserItemEffect"
  ADD CONSTRAINT "UserItemEffect_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserItemEffect"
  ADD CONSTRAINT "UserItemEffect_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "ItemDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
