import express from "express";
import { importPokemon } from "@rta/importers";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { importRateLimit } from "../middleware/rate-limit.js";
import { z } from "zod";
import { validateBody } from "../utils/validate.js";

const router = express.Router();
const initPokemonSchema = z.object({
  limit: z.number().int().min(1).max(100).default(100)
}).strict();

router.post("/init-pokemon", requireAuth, requireAdmin, importRateLimit, async (req, res) => {
  try {
    const payload = validateBody(initPokemonSchema.partial(), req);
    const limit = payload.limit ?? 100;
    console.log("🚀 Manual initialization triggered for Pokémon...");
    const imported = await importPokemon(limit);
    res.json({ success: true, count: imported, message: `Pokémon initialization complete! ${imported} cards imported.` });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

export default router;
