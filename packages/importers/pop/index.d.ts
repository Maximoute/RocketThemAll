/**
 * Point d'entrée du système pop culture multi-importers
 */
export { importTmdbMoviesAndSeries } from "./tmdbImporter";
export { importAnimeAndManga } from "./animeImporter";
export { importVideoGames } from "./videoGameImporter";
export { importManualPopCulture } from "./manualPopImporter";
export { importCinemaFilmsDeck, calculateMovieRarity } from "./cinemaFilmsImporter";
export type { ManualPopCard } from "./manualPopImporter";
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
