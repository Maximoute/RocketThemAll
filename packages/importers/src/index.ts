export { importPokemon } from "./pokemonImporter.js";
export { importMovies, importPopCulture } from "./tmdbImporter.js";
export { importGames } from "./igdbImporter.js";
export { importRocketLeagueItems } from "./rocketLeagueItemsImporter.js";
export * from "./rarityService.js";
export * from "./transformService.js";
export * from "./types.js";
import { importTmdbMoviesAndSeries as importTmdbMoviesAndSeriesInternal } from "../pop/tmdbImporter.js";
import { importAnimeAndManga as importAnimeAndMangaInternal } from "../pop/animeImporter.js";
import { importVideoGames as importVideoGamesInternal } from "../pop/videoGameImporter.js";
import { importAllPopCulture as importAllPopCultureInternal } from "../pop/index.js";

// Pop culture multi-category importers
export { importTmdbMoviesAndSeries } from "../pop/tmdbImporter.js";
export { importAnimeAndManga } from "../pop/animeImporter.js";
export { importVideoGames } from "../pop/videoGameImporter.js";
export { importManualPopCulture } from "../pop/manualPopImporter.js";
export { importAllPopCulture } from "../pop/index.js";
export { importNekos } from "../pop/nekosImporter.js";
export { importCinemaFilmsDeck, calculateMovieRarity } from "../pop/cinemaFilmsImporter.js";
export type { ManualPopCard } from "../pop/manualPopImporter.js";

// Unified API naming for pop importers.
export async function importPopMovies(limit: number): Promise<number> {
	return importTmdbMoviesAndSeriesInternal(limit, 1, 3);
}

export async function importPopGames(limit: number): Promise<number> {
	return importVideoGamesInternal(limit, 4);
}

export async function importPopAnime(limit: number): Promise<number> {
	return importAnimeAndMangaInternal(limit, 4);
}

export async function importPopAll(limit: number): Promise<number> {
	const result = await importAllPopCultureInternal({
		tmdbLimit: limit,
		animeLimit: limit,
		gameLimit: limit,
		skipManual: false
	});
	return result.total;
}
