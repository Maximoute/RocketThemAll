CREATE TABLE "FragmentBalance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rarityId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "FragmentBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FragmentBalance_userId_rarityId_key" ON "FragmentBalance"("userId", "rarityId");
CREATE INDEX "FragmentBalance_userId_idx" ON "FragmentBalance"("userId");
CREATE INDEX "FragmentBalance_rarityId_idx" ON "FragmentBalance"("rarityId");

ALTER TABLE "FragmentBalance"
ADD CONSTRAINT "FragmentBalance_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FragmentBalance"
ADD CONSTRAINT "FragmentBalance_rarityId_fkey"
FOREIGN KEY ("rarityId") REFERENCES "Rarity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
