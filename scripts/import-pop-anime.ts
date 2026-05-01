import { importAnimeAndManga } from "../packages/importers/pop/animeImporter";

const limit = parseInt(process.argv[2] ?? "100", 10);
const pages = parseInt(process.argv[3] ?? "4", 10);

console.log(`🎌 Import anime/manga Jikan (limit=${limit}, pages=${pages})...`);
importAnimeAndManga(limit, pages)
  .then((n) => { console.log(`✅ ${n} cartes importées`); process.exit(0); })
  .catch((err) => { console.error("❌", err); process.exit(1); });
