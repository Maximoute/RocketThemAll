/**
 * Point d'entrée du système pop culture multi-importers
 */
export { importTmdbMoviesAndSeries } from "./tmdbImporter.js";
export { importAnimeAndManga } from "./animeImporter.js";
export { importVideoGames } from "./videoGameImporter.js";
export { importManualPopCulture } from "./manualPopImporter.js";
export { importCinemaFilmsDeck, calculateMovieRarity } from "./cinemaFilmsImporter.js";
export type { ManualPopCard } from "./manualPopImporter.js";

/**
 * Import complet : TMDb + Jikan + RAWG + Manuel
 * Chaque source est optionnelle si la clé API manque.
 */
export async function importAllPopCulture(options?: {
  tmdbLimit?: number;
  animeLimit?: number;
  gameLimit?: number;
  skipManual?: boolean;
}): Promise<{ total: number; tmdb: number; anime: number; games: number; manual: number }> {
  const { tmdbLimit = 150, animeLimit = 100, gameLimit = 100, skipManual = false } = options ?? {};

  let tmdb = 0, anime = 0, games = 0, manual = 0;

  // Films et séries TMDb
  try {
    const { importTmdbMoviesAndSeries } = await import("./tmdbImporter.js");
    tmdb = await importTmdbMoviesAndSeries(tmdbLimit, 1, 3);
  } catch (err) {
    console.warn(`⚠️ TMDb import ignoré : ${err instanceof Error ? err.message : err}`);
  }

  // Anime et manga Jikan
  try {
    const { importAnimeAndManga } = await import("./animeImporter.js");
    anime = await importAnimeAndManga(animeLimit, 4);
  } catch (err) {
    console.warn(`⚠️ Jikan import ignoré : ${err instanceof Error ? err.message : err}`);
  }

  // Jeux vidéo RAWG
  try {
    const { importVideoGames } = await import("./videoGameImporter.js");
    games = await importVideoGames(gameLimit, 4);
  } catch (err) {
    console.warn(`⚠️ RAWG import ignoré (RAWG_API_KEY requis) : ${err instanceof Error ? err.message : err}`);
  }

  // Cartes manuelles JSON
  if (!skipManual) {
    try {
      const { importManualPopCulture } = await import("./manualPopImporter.js");
      manual = await importManualPopCulture();
    } catch (err) {
      console.warn(`⚠️ Manual import ignoré : ${err instanceof Error ? err.message : err}`);
    }
  }

  const total = tmdb + anime + games + manual;
  console.log(`\n🌟 Import pop culture total : ${total} cartes (tmdb=${tmdb}, anime=${anime}, games=${games}, manual=${manual})`);
  return { total, tmdb, anime, games, manual };
}
