import { Router } from "express";
import { z } from "zod";
import {
  importPokemon,
  importPopMovies,
  importPopAnime,
  importPopGames,
  importPopAll,
  importAllPopCulture,
  importManualPopCulture,
  importNekos,
  importCinemaFilmsDeck
} from "@rta/importers";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { importRateLimit } from "../../middleware/rate-limit.js";
import { validateBody } from "../../utils/validate.js";
import { logError } from "../../utils/logger.js";

const router = Router();

const MAX_IMPORT_LIMIT = 100;
const IMPORT_TIMEOUT_MS = 120_000;

const limitSchema = z.object({
  limit: z.number().int().min(1).max(MAX_IMPORT_LIMIT).default(MAX_IMPORT_LIMIT),
  pages: z.number().int().min(1).max(10).optional()
}).strict();

const popAllSchema = z.object({
  tmdbLimit: z.number().int().min(1).max(MAX_IMPORT_LIMIT).default(MAX_IMPORT_LIMIT),
  animeLimit: z.number().int().min(1).max(MAX_IMPORT_LIMIT).default(MAX_IMPORT_LIMIT),
  gameLimit: z.number().int().min(1).max(MAX_IMPORT_LIMIT).default(MAX_IMPORT_LIMIT)
}).strict();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  return new Promise<T>((resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("Import timeout exceeded")), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch(reject)
      .finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      });
  });
}

async function runImportWithRetry<T>(task: () => Promise<T>, label: string): Promise<T> {
  const MAX_RETRIES = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await withTimeout(task(), IMPORT_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      logError("Import attempt failed", {
        label,
        attempt,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Import failed");
}

router.use(requireAuth, requireAdmin, importRateLimit);

// POST /import/pokemon
router.post("/pokemon", async (req, res) => {
  try {
    const payload = validateBody(limitSchema.partial(), req);
    const limit = payload.limit ?? MAX_IMPORT_LIMIT;
    console.log(`[API] Starting Pokémon import with limit: ${limit}`);
    const count = await runImportWithRetry(() => importPokemon(limit), "pokemon");
    res.json({ success: true, count, message: `Imported ${count} Pokémon` });
  } catch (error) {
    console.error("[API] Pokémon import error:", error);
    res.status(500).json({ success: false, error: "Import failed" });
  }
});

// POST /import/movies — alias legacy
router.post("/movies", async (req, res) => {
  try {
    const payload = validateBody(limitSchema.partial(), req);
    const limit = payload.limit ?? MAX_IMPORT_LIMIT;
    const count = await runImportWithRetry(() => importPopMovies(limit), "pop/movies");
    res.json({ success: true, count, message: `Imported ${count} movies/series` });
  } catch (error) {
    console.error("[API] Movies import error:", error);
    res.status(500).json({ success: false, error: "Import failed" });
  }
});

// POST /import/pop — alias legacy (TMDb only)
router.post("/pop", async (req, res) => {
  try {
    const payload = validateBody(limitSchema.partial(), req);
    const limit = payload.limit ?? MAX_IMPORT_LIMIT;
    const count = await runImportWithRetry(() => importPopMovies(limit), "pop");
    res.json({ success: true, count, message: `Imported ${count} pop culture cards` });
  } catch (error) {
    console.error("[API] Pop import error:", error);
    res.status(500).json({ success: false, error: "Import failed" });
  }
});

// POST /import/pop/movies — films et séries TMDb (category: movie | tv)
router.post("/pop/movies", async (req, res) => {
  try {
    const payload = validateBody(limitSchema.partial(), req);
    const limit = payload.limit ?? MAX_IMPORT_LIMIT;
    const count = await runImportWithRetry(() => importPopMovies(limit), "pop/movies");
    res.json({ success: true, count, message: `Imported ${count} movie/tv cards` });
  } catch (error) {
    console.error("[API] TMDb movies import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

// POST /import/pop/cinema-films — deck dédié cinema_films
router.post("/pop/cinema-films", async (req, res) => {
  try {
    const payload = validateBody(limitSchema.partial(), req);
    const limit = payload.limit ?? MAX_IMPORT_LIMIT;
    const pages = payload.pages ?? 8;
    const result = await runImportWithRetry(() => importCinemaFilmsDeck(limit, pages), "pop/cinema-films");
    res.json({ success: true, ...result, message: `Imported ${result.imported} cinema films cards` });
  } catch (error) {
    console.error("[API] cinema_films import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

// POST /import/pop/anime — anime et manga Jikan
router.post("/pop/anime", async (req, res) => {
  try {
    const payload = validateBody(limitSchema.partial(), req);
    const limit = payload.limit ?? MAX_IMPORT_LIMIT;
    const count = await runImportWithRetry(() => importPopAnime(limit), "pop/anime");
    res.json({ success: true, count, message: `Imported ${count} anime/manga cards` });
  } catch (error) {
    console.error("[API] Jikan import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

// POST /import/pop/games — jeux vidéo RAWG
router.post("/pop/games", async (req, res) => {
  try {
    const payload = validateBody(limitSchema.partial(), req);
    const limit = payload.limit ?? MAX_IMPORT_LIMIT;
    const count = await runImportWithRetry(() => importPopGames(limit), "pop/games");
    res.json({ success: true, count, message: `Imported ${count} video game cards` });
  } catch (error) {
    console.error("[API] RAWG import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

// POST /import/pop/manual — cartes JSON manuelles
router.post("/pop/manual", async (req, res) => {
  try {
    const count = await runImportWithRetry(() => importManualPopCulture(), "pop/manual");
    res.json({ success: true, count, message: `Imported ${count} manual pop culture cards` });
  } catch (error) {
    console.error("[API] Manual pop import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

// POST /import/pop/nekos — images neko via nekos.best
router.post("/pop/nekos", async (req, res) => {
  try {
    const payload = validateBody(limitSchema.partial(), req);
    const limit = payload.limit ?? MAX_IMPORT_LIMIT;
    const count = await runImportWithRetry(() => importNekos(limit), "pop/nekos");
    res.json({ success: true, count, message: `Imported ${count} neko cards` });
  } catch (error) {
    console.error("[API] Nekos import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

// POST /import/pop/all — import complet multi-sources
router.post("/pop/all", async (req, res) => {
  try {
    const payload = validateBody(popAllSchema.partial(), req);
    const tmdbLimit = payload.tmdbLimit ?? MAX_IMPORT_LIMIT;
    const animeLimit = payload.animeLimit ?? MAX_IMPORT_LIMIT;
    const gameLimit = payload.gameLimit ?? MAX_IMPORT_LIMIT;
    const result = await runImportWithRetry<{ total: number; tmdb: number; anime: number; games: number; manual: number }>(
      () => importAllPopCulture({ tmdbLimit, animeLimit, gameLimit }),
      "pop/all"
    );
    res.json({ success: true, ...result, message: `Imported ${result.total} pop culture cards total` });
  } catch (error) {
    console.error("[API] Full pop import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

export default router;
