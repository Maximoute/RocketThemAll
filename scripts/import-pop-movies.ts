import { importTmdbMoviesAndSeries } from "../packages/importers/pop/tmdbImporter";

const limit = parseInt(process.argv[2] ?? "150", 10);
const pages = parseInt(process.argv[3] ?? "3", 10);

console.log(`🎬 Import films/séries TMDb (limit=${limit}, pages=${pages})...`);
importTmdbMoviesAndSeries(limit, 1, pages)
  .then((n) => { console.log(`✅ ${n} cartes importées`); process.exit(0); })
  .catch((err) => { console.error("❌", err); process.exit(1); });
