import axios from "axios";
import { prisma } from "../packages/database/src/index";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";

function determinePokemonRarity(baseExp: number, isShiny: boolean): string {
  if (isShiny) {
    if (baseExp >= 280) return "Black Market";
    if (baseExp >= 220) return "Exotic";
    if (baseExp >= 155) return "Import";
    if (baseExp >= 100) return "Very Rare";
    return "Rare";
  }
  if (baseExp >= 300) return "Black Market";
  if (baseExp >= 240) return "Exotic";
  if (baseExp >= 178) return "Import";
  if (baseExp >= 128) return "Very Rare";
  if (baseExp >= 90) return "Rare";
  if (baseExp >= 50) return "Uncommon";
  return "Common";
}

async function main() {
  console.log("🔄 Migrating Pokémon rarity tiers based on base_experience...\n");

  // Fetch all rarity IDs once
  const rarities = await prisma.rarity.findMany();
  const rarityMap = new Map(rarities.map((r) => [r.name, r.id]));

  // Get all Pokémon cards from DB
  const pokemonCards = await prisma.card.findMany({
    where: { source: "pokeapi" },
    select: { id: true, name: true, sourceId: true, rarityId: true }
  });

  console.log(`📊 Found ${pokemonCards.length} Pokémon cards to process...\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // Cache base_experience per pokemonId to avoid double fetching shiny+regular
  const baseExpCache = new Map<number, number>();

  for (const card of pokemonCards) {
    try {
      // sourceId is like "pokemon-25" or "pokemon-25-shiny"
      const match = card.sourceId?.match(/^pokemon-(\d+)(-shiny)?$/);
      if (!match) {
        skipped++;
        continue;
      }

      const pokemonId = parseInt(match[1], 10);
      const isShiny = !!match[2];

      // Fetch base_experience (with cache)
      if (!baseExpCache.has(pokemonId)) {
        const res = await axios.get(`${POKEAPI_BASE}/pokemon/${pokemonId}`);
        baseExpCache.set(pokemonId, res.data.base_experience ?? 0);
      }

      const baseExp = baseExpCache.get(pokemonId)!;
      const newRarityName = determinePokemonRarity(baseExp, isShiny);
      const newRarityId = rarityMap.get(newRarityName);

      if (!newRarityId) {
        console.error(`❌ Rarity "${newRarityName}" not found in DB`);
        failed++;
        continue;
      }

      if (card.rarityId === newRarityId) {
        skipped++;
        continue;
      }

      await prisma.card.update({
        where: { id: card.id },
        data: { rarityId: newRarityId }
      });

      updated++;
      console.log(`✅ ${card.name} → ${newRarityName} (base_exp: ${baseExp}${isShiny ? ", shiny" : ""})`);
    } catch (err) {
      console.error(`❌ Failed for ${card.name}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\n✨ Done! Updated: ${updated}, Skipped (no change): ${skipped}, Failed: ${failed}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
