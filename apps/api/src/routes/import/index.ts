import { Router } from "express";
import {
  importPokemon,
  importMovies,
  importPopCulture,
  importTmdbMoviesAndSeries,
  importAnimeAndManga,
  importVideoGames,
  importManualPopCulture,
  importAllPopCulture
} from "@rta/importers";

const router = Router();

// POST /import/pokemon
router.post("/pokemon", async (req, res) => {
  try {
    const limit = req.body.limit || 151;
    console.log(`[API] Starting Pokémon import with limit: ${limit}`);
    const count = await importPokemon(limit);
    res.json({ success: true, count, message: `Imported ${count} Pokémon` });
  } catch (error) {
    console.error("[API] Pokémon import error:", error);
    res.status(500).json({ success: false, error: "Import failed" });
  }
});

// POST /import/movies — alias legacy
router.post("/movies", async (req, res) => {
  try {
    const pages = req.body.pages || 3;
    const count = await importMovies(1, pages);
    res.json({ success: true, count, message: `Imported ${count} movies/series` });
  } catch (error) {
    console.error("[API] Movies import error:", error);
    res.status(500).json({ success: false, error: "Import failed" });
  }
});

// POST /import/pop — alias legacy (TMDb only)
router.post("/pop", async (req, res) => {
  try {
    const limit = Number(req.body.limit ?? 150);
    const pages = Number(req.body.pages ?? 3);
    const count = await importPopCulture(limit, 1, pages);
    res.json({ success: true, count, message: `Imported ${count} pop culture cards` });
  } catch (error) {
    console.error("[API] Pop import error:", error);
    res.status(500).json({ success: false, error: "Import failed" });
  }
});

// POST /import/pop/movies — films et séries TMDb (category: movie | tv)
router.post("/pop/movies", async (req, res) => {
  try {
    const limit = Number(req.body.limit ?? 150);
    const pages = Number(req.body.pages ?? 3);
    const count = await importTmdbMoviesAndSeries(limit, 1, pages);
    res.json({ success: true, count, message: `Imported ${count} movie/tv cards` });
  } catch (error) {
    console.error("[API] TMDb movies import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

// POST /import/pop/anime — anime et manga Jikan
router.post("/pop/anime", async (req, res) => {
  try {
    const limit = Number(req.body.limit ?? 100);
    const pages = Number(req.body.pages ?? 4);
    const count = await importAnimeAndManga(limit, pages);
    res.json({ success: true, count, message: `Imported ${count} anime/manga cards` });
  } catch (error) {
    console.error("[API] Jikan import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

// POST /import/pop/games — jeux vidéo RAWG
router.post("/pop/games", async (req, res) => {
  try {
    const limit = Number(req.body.limit ?? 100);
    const pages = Number(req.body.pages ?? 4);
    const count = await importVideoGames(limit, pages);
    res.json({ success: true, count, message: `Imported ${count} video game cards` });
  } catch (error) {
    console.error("[API] RAWG import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

// POST /import/pop/manual — cartes JSON manuelles
router.post("/pop/manual", async (req, res) => {
  try {
    const count = await importManualPopCulture();
    res.json({ success: true, count, message: `Imported ${count} manual pop culture cards` });
  } catch (error) {
    console.error("[API] Manual pop import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

// POST /import/pop/all — import complet multi-sources
router.post("/pop/all", async (req, res) => {
  try {
    const tmdbLimit = Number(req.body.tmdbLimit ?? 150);
    const animeLimit = Number(req.body.animeLimit ?? 100);
    const gameLimit = Number(req.body.gameLimit ?? 100);
    const result = await importAllPopCulture({ tmdbLimit, animeLimit, gameLimit });
    res.json({ success: true, ...result, message: `Imported ${result.total} pop culture cards total` });
  } catch (error) {
    console.error("[API] Full pop import error:", error);
    res.status(500).json({ success: false, error: String(error instanceof Error ? error.message : error) });
  }
});

export default router;
