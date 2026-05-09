import { loadEnv } from "./loadEnv";
import { importPokemon, importAllPopCulture } from "@rta/importers";

const pokemonLimit = Number(process.argv[2] ?? "151");
const tmdbLimit = Number(process.argv[3] ?? "150");
const animeLimit = Number(process.argv[4] ?? "100");
const gameLimit = Number(process.argv[5] ?? "100");

console.log("🚀 Starting database import without Rocket League...");
console.log(`   Pokemon limit: ${pokemonLimit}`);
console.log(`   TMDb limit: ${tmdbLimit}`);
console.log(`   Anime limit: ${animeLimit}`);
console.log(`   Games limit: ${gameLimit}`);

async function main() {
  await loadEnv();

  try {
    const pokemonCount = await importPokemon(pokemonLimit);
    console.log(`\n✅ Pokémon import completed: ${pokemonCount} cards imported.`);

    const popResult = await importAllPopCulture({
      tmdbLimit,
      animeLimit,
      gameLimit,
      skipManual: false
    });

    console.log(`\n✅ Pop culture import completed:`);
    console.log(`   TMDb: ${popResult.tmdb}`);
    console.log(`   Anime: ${popResult.anime}`);
    console.log(`   Games: ${popResult.games}`);
    console.log(`   Manual: ${popResult.manual}`);
    console.log(`   Total pop culture: ${popResult.total}`);

    console.log(`\n🎉 Database import without Rocket League finished successfully.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Import failed:", error);
    process.exit(1);
  }
}

main();
