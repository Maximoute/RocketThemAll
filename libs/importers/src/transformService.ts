import type { RawCard, Card } from "./types";
import { getRarityIdByName, getXpReward, getDropRate } from "./rarityService";

export async function transformPokemonToCard(pokemon: any, rawImage: string, isShiny: boolean = false): Promise<Card> {
  const rarityName = determinePokemonRarity(pokemon, isShiny);
  const rarityId = await getRarityIdByName(rarityName);

  return {
    name: pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1),
    deck: "Pokemon",
    rarityId,
    imageUrl: rawImage,
    description: `Pokémon #${pokemon.id}${isShiny ? " ✨ Shiny" : ""} - Type: ${pokemon.types.map((t: any) => t.type.name).join(", ")}`,
    xpReward: getXpReward(rarityName),
    dropRate: getDropRate(rarityName),
    source: "pokeapi",
    sourceId: `pokemon-${pokemon.id}${isShiny ? "-shiny" : ""}`
  };
}

export async function transformMovieToCard(movie: any): Promise<Card> {
  const rarityName = determineMovieRarity(movie);
  const rarityId = await getRarityIdByName(rarityName);

  return {
    name: movie.title,
    deck: "Pop Culture",
    rarityId,
    imageUrl: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
    description: movie.overview || "Popular movie",
    xpReward: getXpReward(rarityName),
    dropRate: getDropRate(rarityName),
    source: "tmdb",
    sourceId: `movie-${movie.id}`
  };
}

function determinePokemonRarity(pokemon: any, isShiny: boolean = false): string {
  const baseExp: number = pokemon.base_experience ?? 0;

  if (isShiny) {
    // Shiny Pokémon are always at least Rare, boosted by base_experience
    if (baseExp >= 280) return "Black Market";
    if (baseExp >= 220) return "Exotic";
    if (baseExp >= 155) return "Import";
    if (baseExp >= 100) return "Very Rare";
    return "Rare";
  }

  // Regular Pokémon: tier based on base_experience
  // >= 300 → Black Market (legendaries/mythicals)
  // 240-299 → Exotic (pseudo-legendaries: Dragonite, Tyranitar, etc.)
  // 178-239 → Import (strong fully evolved)
  // 128-177 → Very Rare (starters final, Eevee evos, etc.)
  // 90-127  → Rare (mid-tier evolutions)
  // 50-89   → Uncommon (basic evolutions)
  // < 50    → Common
  if (baseExp >= 300) return "Black Market";
  if (baseExp >= 240) return "Exotic";
  if (baseExp >= 178) return "Import";
  if (baseExp >= 128) return "Very Rare";
  if (baseExp >= 90) return "Rare";
  if (baseExp >= 50) return "Uncommon";
  return "Common";
}

function determineMovieRarity(movie: any): string {
  const popularity = movie.popularity || 0;
  if (popularity > 100) return "Exotic";
  if (popularity > 50) return "Rare";
  if (popularity > 20) return "Uncommon";
  return "Common";
}
