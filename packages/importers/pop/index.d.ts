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
export declare function importAllPopCulture(options?: {
    tmdbLimit?: number;
    animeLimit?: number;
    gameLimit?: number;
    skipManual?: boolean;
}): Promise<{
    total: number;
    tmdb: number;
    anime: number;
    games: number;
    manual: number;
}>;
