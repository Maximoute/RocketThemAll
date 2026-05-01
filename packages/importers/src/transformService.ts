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
  // Shiny variants are MUCH rarer
  if (isShiny) {
    const LEGENDARY_IDS = [144, 145, 146, 149, 150, 151, 243, 244, 245, 249, 250];
    if (LEGENDARY_IDS.includes(pokemon.id)) return "Black Market";
    return "Exotic";
  }

  const LEGENDARY_IDS = [144, 145, 146, 149, 150, 151, 243, 244, 245, 249, 250];
  if (LEGENDARY_IDS.includes(pokemon.id)) return "Black Market";

  const STARTER_IDS = [1, 4, 7];
  if (STARTER_IDS.includes(pokemon.id)) return "Rare";

  if (pokemon.id === 25) return "Very Rare";

  return Math.random() > 0.7 ? "Uncommon" : "Common";
}

function determineMovieRarity(movie: any): string {
  const popularity = movie.popularity || 0;
  if (popularity > 100) return "Exotic";
  if (popularity > 50) return "Rare";
  if (popularity > 20) return "Uncommon";
  return "Common";
}
