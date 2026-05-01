import axios from "axios";
import { transformPokemonToCard } from "./transformService";
import { prisma } from "@rta/database";
import type { Card } from "./types";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";

async function getPokemonFrenchName(pokemonId: number): Promise<string> {
  try {
    const response = await axios.get(`${POKEAPI_BASE}/pokemon-species/${pokemonId}`);
    const species: PokemonSpeciesResponse = response.data;
    const frenchName = species.names.find((n) => n.language.name === "fr")?.name;
    return frenchName || "";
  } catch {
    return "";
  }
}

interface PokemonApiResponse {
  id: number;
  name: string;
  types: Array<{ type: { name: string } }>;
  sprites: { other: { "official-artwork": { front_default: string } } };
}

interface PokemonSpeciesResponse {
  names: Array<{ name: string; language: { name: string } }>;
}

interface PokemonFormResponse {
  forms: Array<{
    name: string;
    is_main_series: boolean;
  }>;
  sprites: {
    front_default?: string;
    front_shiny?: string;
  };
}

async function getShinyImage(pokemonId: number): Promise<string | null> {
  try {
    const response = await axios.get(`${POKEAPI_BASE}/pokemon/${pokemonId}`);
    const data = response.data;
    return data.sprites?.front_shiny || data.sprites?.other?.["official-artwork"]?.front_shiny || null;
  } catch {
    return null;
  }
}

export async function importPokemon(limit: number = 10000): Promise<number> {
  console.log(`🔄 Importing ALL Pokémon + Shiny variants from PokéAPI...`);

  try {
    // Get total count first
    const countResponse = await axios.get(`${POKEAPI_BASE}/pokemon?limit=1`);
    const totalPokemon = Math.min(countResponse.data.count, limit);
    
    console.log(`📊 Found ${totalPokemon} Pokémon to import...`);

    let imported = 0;
    let page = 0;
    const pageSize = 50;

    while (page * pageSize < totalPokemon) {
      const offset = page * pageSize;
      const response = await axios.get(`${POKEAPI_BASE}/pokemon?limit=${pageSize}&offset=${offset}`);
      const pokemonList = response.data.results;

      for (const pokemon of pokemonList) {
        try {
          const pokemonDetails = await axios.get(pokemon.url);
          const data: PokemonApiResponse = pokemonDetails.data;

          // Get French name
          const frenchName = await getPokemonFrenchName(data.id);
          const displayName = frenchName || (data.name.charAt(0).toUpperCase() + data.name.slice(1));

          // Import regular form
          const regularExists = await prisma.card.findFirst({
            where: { 
              name: displayName,
              source: "pokeapi"
            }
          });

          if (!regularExists) {
            const imageUrl =
              data.sprites?.other?.["official-artwork"]?.front_default ||
              `https://raw.githubusercontent.com/PokeAPI/sprites/master/pokemon/${data.id}.png`;

            const card = await transformPokemonToCard(data, imageUrl, false);

            await prisma.card.create({
              data: {
                name: displayName,
                deckId: (await prisma.deck.findUnique({ where: { name: "Pokemon" } }))!.id,
                rarityId: card.rarityId,
                imageUrl: card.imageUrl,
                description: card.description,
                xpReward: card.xpReward,
                dropRate: card.dropRate,
                source: card.source,
                sourceId: card.sourceId
              }
            });

            imported++;
            console.log(`✅ Imported: ${displayName}`);
          }

          // Import Shiny variant
          const shinyName = `${displayName} ✨ Shiny`;
          const shinyExists = await prisma.card.findFirst({
            where: { 
              name: shinyName,
              source: "pokeapi"
            }
          });

          if (!shinyExists) {
            const shinyImageUrl = await getShinyImage(data.id);
            
            if (shinyImageUrl) {
              const shinyCard = await transformPokemonToCard(data, shinyImageUrl, true);

              await prisma.card.create({
                data: {
                  name: shinyName,
                  deckId: (await prisma.deck.findUnique({ where: { name: "Pokemon" } }))!.id,
                  rarityId: shinyCard.rarityId,
                  imageUrl: shinyCard.imageUrl,
                  description: shinyCard.description,
                  xpReward: shinyCard.xpReward,
                  dropRate: shinyCard.dropRate,
                  source: shinyCard.source,
                  sourceId: shinyCard.sourceId
                }
              });

              imported++;
              console.log(`💎 Imported: ${shinyName}`);
            }
          }
        } catch (error) {
          console.error(`❌ Failed to import ${pokemon.name}:`, error instanceof Error ? error.message : error);
        }
      }

      page++;
    }

    console.log(`\n✨ Pokémon import complete! ${imported} new cards added.`);
    return imported;
  } catch (error) {
    console.error("❌ PokéAPI Error:", error instanceof Error ? error.message : error);
    throw error;
  }
}
