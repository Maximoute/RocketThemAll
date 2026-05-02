import { importCinemaFilmsDeck } from "@rta/importers";

const limit = parseInt(process.argv[2] ?? "120", 10);
const pages = parseInt(process.argv[3] ?? "8", 10);

console.log(`🎬 Import deck cinema_films (limit=${limit}, pages=${pages})...`);
importCinemaFilmsDeck(limit, pages)
  .then((result) => {
    console.log(`✅ Imported: ${result.imported}`);
    console.log(`🚫 Blacklisted (missing image): ${result.blacklisted}`);
    console.log(`⏭️ Skipped: ${result.skipped}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌", error);
    process.exit(1);
  });
