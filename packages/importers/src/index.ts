export { importPokemon } from "./pokemonImporter";
export { importMovies, importPopCulture } from "./tmdbImporter";
export { importGames } from "./igdbImporter";
export { importRocketLeagueItems } from "./rocketLeagueItemsImporter";
export * from "./rarityService";
export * from "./transformService";
export * from "./types";
import { importTmdbMoviesAndSeries as importTmdbMoviesAndSeriesInternal } from "../pop/tmdbImporter";
import { importAnimeAndManga as importAnimeAndMangaInternal } from "../pop/animeImporter";
import { importVideoGames as importVideoGamesInternal } from "../pop/videoGameImporter";
import { importAllPopCulture as importAllPopCultureInternal } from "../pop/index";

// Pop culture multi-category importers
export { importTmdbMoviesAndSeries } from "../pop/tmdbImporter";
export { importAnimeAndManga } from "../pop/animeImporter";
export { importVideoGames } from "../pop/videoGameImporter";
export { importManualPopCulture } from "../pop/manualPopImporter";
export { importAllPopCulture } from "../pop/index";
export { importNekos } from "../pop/nekosImporter";
export { importCinemaFilmsDeck, calculateMovieRarity } from "../pop/cinemaFilmsImporter";
export type { ManualPopCard } from "../pop/manualPopImporter";

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
