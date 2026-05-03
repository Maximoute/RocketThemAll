import { z } from "zod";
declare const tmdbMovieSchema: z.ZodObject<{
    id: z.ZodNumber;
    title: z.ZodOptional<z.ZodString>;
    poster_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    overview: z.ZodOptional<z.ZodString>;
    popularity: z.ZodOptional<z.ZodNumber>;
    vote_count: z.ZodOptional<z.ZodNumber>;
    vote_average: z.ZodOptional<z.ZodNumber>;
    release_date: z.ZodOptional<z.ZodString>;
    original_language: z.ZodOptional<z.ZodString>;
    genre_ids: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodNumber;
    title: z.ZodOptional<z.ZodString>;
    poster_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    overview: z.ZodOptional<z.ZodString>;
    popularity: z.ZodOptional<z.ZodNumber>;
    vote_count: z.ZodOptional<z.ZodNumber>;
    vote_average: z.ZodOptional<z.ZodNumber>;
    release_date: z.ZodOptional<z.ZodString>;
    original_language: z.ZodOptional<z.ZodString>;
    genre_ids: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodNumber;
    title: z.ZodOptional<z.ZodString>;
    poster_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    overview: z.ZodOptional<z.ZodString>;
    popularity: z.ZodOptional<z.ZodNumber>;
    vote_count: z.ZodOptional<z.ZodNumber>;
    vote_average: z.ZodOptional<z.ZodNumber>;
    release_date: z.ZodOptional<z.ZodString>;
    original_language: z.ZodOptional<z.ZodString>;
    genre_ids: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, z.ZodTypeAny, "passthrough">>;
type TmdbMovie = z.infer<typeof tmdbMovieSchema>;
type Bounds = {
    popularity: {
        min: number;
        max: number;
    };
    voteCount: {
        min: number;
        max: number;
    };
    voteAverage: {
        min: number;
        max: number;
    };
    age: {
        min: number;
        max: number;
    };
};
type MovieRarityResult = {
    rarityScore: number;
    rarityFactors: {
        age: number;
        known_score: number;
        mainstream_score: number;
        classic_score: number;
        acronym_boost: number;
        classic_boost: number;
        masterpiece_boost: number;
        cult_boost: number;
        recent_penalty: number;
        obscure_old_penalty: number;
    };
};
export declare function calculateMovieRarity(movie: TmdbMovie & {
    releaseYear: number;
}, bounds: Bounds, acceptedNames: string[]): MovieRarityResult;
export declare function importCinemaFilmsDeck(limit?: number, maxPages?: number): Promise<{
    imported: number;
    blacklisted: number;
    skipped: number;
}>;
export {};
