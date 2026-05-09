import { loadEnv } from "./loadEnv";
import { importGames } from "@rta/importers";

async function main() {
  await loadEnv();

  console.log("Starting Games import...\n");
  try {
    const count = await importGames();
    console.log(`\n✨ Successfully imported ${count} game cards!`);
    process.exit(0);
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  }
}

main();
