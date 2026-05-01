import { importPokemon } from "@rta/importers";

async function main() {
  console.log("Starting Pokémon import...\n");
  try {
    const count = await importPokemon(151);
    console.log(`\n✨ Successfully imported ${count} Pokémon cards!`);
    process.exit(0);
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  }
}

main();
