-- Le serveur principal est une donnée administrable et non une variable d'environnement.
ALTER TABLE "Guild"
ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- Le Hall of Fame peut être activé indépendamment pour chaque serveur.
ALTER TABLE "GuildConfiguration"
ADD COLUMN "hallOfFameEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Rocket Them All est le serveur principal initial demandé.
UPDATE "Guild"
SET "isPrimary" = ("discordId" = '1505371908621729954');

-- Une seule guilde peut être principale à la fois, sans interdire plusieurs valeurs false.
CREATE UNIQUE INDEX "Guild_single_primary_key"
ON "Guild" ("isPrimary")
WHERE "isPrimary" = true;

CREATE INDEX "Guild_isPrimary_idx" ON "Guild"("isPrimary");
