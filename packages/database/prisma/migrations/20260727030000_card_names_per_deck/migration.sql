DROP INDEX IF EXISTS "Card_name_key";

CREATE UNIQUE INDEX "Card_deckId_name_key" ON "Card"("deckId", "name");
