import { prisma } from "@rta/database";
import type { RarityConfig } from "./types";

const RARITY_CONFIG: Record<string, RarityConfig> = {
  Common: { name: "Common", xpReward: 10, dropRate: 0.5 },
  Uncommon: { name: "Uncommon", xpReward: 20, dropRate: 0.22 },
  Rare: { name: "Rare", xpReward: 40, dropRate: 0.12 },
  "Very Rare": { name: "Very Rare", xpReward: 70, dropRate: 0.07 },
  Import: { name: "Import", xpReward: 110, dropRate: 0.04 },
  Exotic: { name: "Exotic", xpReward: 160, dropRate: 0.03 },
  "Black Market": { name: "Black Market", xpReward: 250, dropRate: 0.01 },
  Limited: { name: "Limited", xpReward: 300, dropRate: 0.01 }
};

export async function getRarityIdByName(name: string): Promise<string> {
  const rarity = await prisma.rarity.findUnique({ where: { name } });
  if (!rarity) {
    throw new Error(`Rarity "${name}" not found in database`);
  }
  return rarity.id;
}

export function generatePokemonRarity(pokemon: any): string {
  // Pokémon légendaires → Black Market
  const LEGENDARY_IDS = [144, 145, 146, 149, 150, 151, 243, 244, 245, 249, 250];
  if (LEGENDARY_IDS.includes(pokemon.id)) {
    return "Black Market";
  }

  // Starters (Bulbizarre, Salamèche, Carapuce) → Rare
  const STARTER_IDS = [1, 4, 7];
  if (STARTER_IDS.includes(pokemon.id)) {
    return "Rare";
  }

  // Pikachu → Very Rare
  if (pokemon.id === 25) {
    return "Very Rare";
  }

  // Autres : Common ou Uncommon aléatoire
  return Math.random() > 0.7 ? "Uncommon" : "Common";
}

export function generateMovieRarity(movie: any): string {
  const popularity = movie.popularity || 0;

  if (popularity > 100) return "Exotic";
  if (popularity > 50) return "Rare";
  if (popularity > 20) return "Uncommon";
  return "Common";
}

export function getXpReward(rarityName: string): number {
  return RARITY_CONFIG[rarityName]?.xpReward || 10;
}

export function getDropRate(rarityName: string): number {
  return RARITY_CONFIG[rarityName]?.dropRate || 0.5;
}
