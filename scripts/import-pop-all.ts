import { loadEnv } from "./loadEnv";
import { importAllPopCulture } from "../packages/importers/pop/index";

async function main() {
  await loadEnv();

  const tmdbLimit = parseInt(process.argv[2] ?? "150", 10);
  const animeLimit = parseInt(process.argv[3] ?? "100", 10);
  const gameLimit = parseInt(process.argv[4] ?? "100", 10);

  console.log("🌟 Import pop culture COMPLET (TMDb + Jikan + RAWG + Manuel)...");
  console.log(`   TMDb: ${tmdbLimit} | Anime: ${animeLimit} | Games: ${gameLimit}`);

  try {
    const result = await importAllPopCulture({ tmdbLimit, animeLimit, gameLimit });
    console.log(`\n✅ Import terminé :`);
    console.log(`   Films/séries (TMDb) : ${result.tmdb}`);
    console.log(`   Anime/manga (Jikan) : ${result.anime}`);
    console.log(`   Jeux vidéo (RAWG)   : ${result.games}`);
    console.log(`   Manuelles (JSON)    : ${result.manual}`);
    console.log(`   TOTAL               : ${result.total}`);
    process.exit(0);
  } catch (err) {
    console.error("❌", err);
    process.exit(1);
  }
}

main();
