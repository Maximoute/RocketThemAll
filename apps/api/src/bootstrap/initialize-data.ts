import { prisma } from "@rta/database";
import {
  importPokemon,
  importManualPopCulture,
  importPopMovies
} from "@rta/importers";

async function initializePokemonIfNeeded() {
  try {
    const pokemonCount = await prisma.card.count({ where: { source: "pokeapi" } });
    if (pokemonCount === 0) {
      console.log("\n🚀 No Pokémon found. Starting auto-import of 1000+ Pokémon...");
      const imported = await importPokemon(10000);
      console.log(`\n✅ Pokémon auto-import complete! ${imported} cards added.\n`);
      return;
    }

    console.log(`✅ Database ready with ${pokemonCount} Pokémon cards.`);
  } catch (error) {
    console.error("⚠️  Pokémon auto-import failed:", error instanceof Error ? error.message : error);
  }
}

async function initializeManualPopIfNeeded() {
  try {
    const manualPopCount = await prisma.card.count({ where: { source: "manual", category: { not: null } } });
    if (manualPopCount === 0) {
      console.log("\n🎭 No manual pop culture cards found. Auto-importing from JSON...");
      const imported = await importManualPopCulture();
      console.log(`✅ Manual pop culture auto-import complete! ${imported} cards added.`);
      return;
    }

    console.log(`✅ Database ready with ${manualPopCount} manual pop culture cards.`);
  } catch (error) {
    console.error("⚠️  Manual pop culture auto-import failed:", error instanceof Error ? error.message : error);
  }
}

async function initializeTmdbIfNeeded() {
  if (!process.env.TMDB_API_KEY) {
    return;
  }

  try {
    const tmdbCount = await prisma.card.count({ where: { source: "tmdb" } });
    if (tmdbCount === 0) {
      console.log("\n🎬 No TMDb cards found. Auto-importing movies & series...");
      const imported = await importPopMovies(100);
      console.log(`✅ TMDb auto-import complete! ${imported} cards added.`);
      return;
    }

    console.log(`✅ Database ready with ${tmdbCount} TMDb cards.`);
  } catch (error) {
    console.error("⚠️  TMDb auto-import failed:", error instanceof Error ? error.message : error);
  }
}

export async function initializeDataIfNeeded() {
  await initializePokemonIfNeeded();
  await initializeManualPopIfNeeded();
  await initializeTmdbIfNeeded();
}