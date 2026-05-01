import { importPokemon } from "@rta/importers";

async function initializeDatabase() {
  try {
    console.log("🚀 Initializing Pokémon database...");
    const imported = await importPokemon(10000);
    console.log(`✅ Initialization complete! ${imported} cards imported.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Initialization failed:", error);
    process.exit(1);
  }
}

initializeDatabase();
