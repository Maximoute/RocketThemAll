import { importMovies } from "@rta/importers";

async function main() {
  console.log("Starting Movies import...\n");
  try {
    const count = await importMovies(1, 3);
    console.log(`\n✨ Successfully imported ${count} movie cards!`);
    process.exit(0);
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  }
}

main();
