import express from "express";
import { importPokemon, importMovies } from "@rta/importers";

const router = express.Router();

router.post("/init-pokemon", async (_req, res) => {
  try {
    console.log("🚀 Manual initialization triggered for Pokémon...");
    const imported = await importPokemon(10000);
    res.json({ success: true, count: imported, message: `Pokémon initialization complete! ${imported} cards imported.` });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

export default router;
