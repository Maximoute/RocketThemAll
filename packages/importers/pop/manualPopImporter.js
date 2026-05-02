/**
 * Manual pop importer — lit data/pop-culture-manual.json
 * Gère : meme, music, internet, comics, sport, manual
 */
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { prisma } from "@rta/database";
import { getRarityIdByName } from "../src/rarityService";
// Résolution relative au fichier importer (packages/importers/pop/)
// → remonter 3 niveaux pour atteindre la racine du monorepo
const _dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_DATA_PATH = join(_dirname, "../../../data/pop-culture-manual.json");
const rarityXp = {
    Common: 10, Uncommon: 20, Rare: 40, "Very Rare": 70, Import: 110,
    Exotic: 160, "Black Market": 250, Limited: 300
};
const rarityDrop = {
    Common: 0.6, Uncommon: 0.25, Rare: 0.1, "Very Rare": 0.07, Import: 0.04,
    Exotic: 0.03, "Black Market": 0.01, Limited: 0.01
};
export async function importManualPopCulture(dataFilePath) {
    const filePath = dataFilePath || MONOREPO_DATA_PATH;
    let cards;
    try {
        const raw = readFileSync(filePath, "utf-8");
        cards = JSON.parse(raw);
    }
    catch (err) {
        throw new Error(`Cannot read manual pop JSON at ${filePath}: ${err}`);
    }
    const deck = await prisma.deck.findUnique({ where: { name: "Pop Culture" } });
    if (!deck)
        throw new Error("Deck 'Pop Culture' not found");
    let imported = 0;
    for (const card of cards) {
        if (!card.name || !card.category || !card.rarity) {
            console.warn(`⚠️ Carte ignorée (champs manquants): ${JSON.stringify(card)}`);
            continue;
        }
        const source = card.source || "manual";
        const sourceId = `manual-${card.category}-${card.name.toLowerCase().replace(/\s+/g, "-")}`;
        const exists = await prisma.card.findFirst({ where: { source, sourceId } });
        if (exists) {
            console.log(`⏭️ ${card.name} déjà présent, skipping...`);
            continue;
        }
        let rarityId;
        try {
            rarityId = await getRarityIdByName(card.rarity);
        }
        catch {
            console.warn(`⚠️ Rareté inconnue "${card.rarity}" pour "${card.name}", utilisation de Common`);
            rarityId = await getRarityIdByName("Common");
        }
        const collision = await prisma.card.findUnique({ where: { name: card.name } });
        const cardName = collision ? `${card.name} (${card.category})` : card.name;
        await prisma.card.create({
            data: {
                name: cardName,
                deckId: deck.id,
                rarityId,
                imageUrl: card.imageUrl ?? null,
                description: card.description ?? null,
                xpReward: rarityXp[card.rarity] ?? 10,
                dropRate: rarityDrop[card.rarity] ?? 0.6,
                source,
                sourceId,
                category: card.category
            }
        });
        imported++;
        console.log(`✅ [manual] ${cardName} (${card.category}) | ${card.rarity}`);
    }
    console.log(`📋 Manual pop import terminé : ${imported} nouvelles cartes`);
    return imported;
}
