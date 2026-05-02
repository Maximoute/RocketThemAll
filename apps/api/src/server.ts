import express from "express";
import cors from "cors";
import cardsRoutes from "./routes/cards.routes.js";
import usersRoutes from "./routes/users.routes.js";
import tradesRoutes from "./routes/trades.routes.js";
import imagesRoutes from "./routes/images.routes.js";
import logsRoutes from "./routes/logs.routes.js";
import configRoutes from "./routes/config.routes.js";
import importRoutes from "./routes/import/index.js";
import adminRoutes from "./routes/admin.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { actionRateLimit, globalRateLimit } from "./middleware/rate-limit.js";
import { prisma } from "@rta/database";
import {
  importPokemon,
  importManualPopCulture,
  importPopMovies
} from "@rta/importers";

const app = express();
const allowedOrigin = process.env.FRONTEND_ORIGIN ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(globalRateLimit);
app.use(["/capture", "/spawn", "/images/upload", "/import"], actionRateLimit);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/cards", cardsRoutes);
app.use("/users", usersRoutes);
app.use("/trades", tradesRoutes);
app.use("/images", imagesRoutes);
app.use("/logs", logsRoutes);
app.use("/config", configRoutes);
app.use("/import", importRoutes);
app.use("/admin", adminRoutes);

app.use(errorHandler);

async function initializeIfNeeded() {
  // --- Pokémon ---
  try {
    const pokemonCount = await prisma.card.count({ where: { source: "pokeapi" } });
    if (pokemonCount === 0) {
      console.log("\n🚀 No Pokémon found. Starting auto-import of 1000+ Pokémon...");
      const imported = await importPokemon(10000);
      console.log(`\n✅ Pokémon auto-import complete! ${imported} cards added.\n`);
    } else {
      console.log(`✅ Database ready with ${pokemonCount} Pokémon cards.`);
    }
  } catch (error) {
    console.error("⚠️  Pokémon auto-import failed:", error instanceof Error ? error.message : error);
  }

  // --- Pop Culture (cartes manuelles JSON) ---
  try {
    const manualPopCount = await prisma.card.count({ where: { source: "manual", category: { not: null } } });
    if (manualPopCount === 0) {
      console.log("\n🎭 No manual pop culture cards found. Auto-importing from JSON...");
      const imported = await importManualPopCulture();
      console.log(`✅ Manual pop culture auto-import complete! ${imported} cards added.`);
    } else {
      console.log(`✅ Database ready with ${manualPopCount} manual pop culture cards.`);
    }
  } catch (error) {
    console.error("⚠️  Manual pop culture auto-import failed:", error instanceof Error ? error.message : error);
  }

  // --- Pop Culture (TMDb films/séries) ---
  if (process.env.TMDB_API_KEY) {
    try {
      const tmdbCount = await prisma.card.count({ where: { source: "tmdb" } });
      if (tmdbCount === 0) {
        console.log("\n🎬 No TMDb cards found. Auto-importing movies & series...");
        const imported = await importPopMovies(100);
        console.log(`✅ TMDb auto-import complete! ${imported} cards added.`);
      } else {
        console.log(`✅ Database ready with ${tmdbCount} TMDb cards.`);
      }
    } catch (error) {
      console.error("⚠️  TMDb auto-import failed:", error instanceof Error ? error.message : error);
    }
  }


}

const port = Number(process.env.PORT ?? 4000);

// Initialize database before starting server
initializeIfNeeded().then(() => {
  app.listen(port, () => {
    console.log(`API listening on ${port}`);
  });
}).catch(error => {
  console.error("Failed to initialize:", error);
  process.exit(1);
});
