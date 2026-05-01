import { importVideoGames } from "../packages/importers/pop/videoGameImporter";

const limit = parseInt(process.argv[2] ?? "100", 10);
const pages = parseInt(process.argv[3] ?? "4", 10);

console.log(`🎮 Import jeux vidéo RAWG (limit=${limit}, pages=${pages})...`);
importVideoGames(limit, pages)
  .then((n) => { console.log(`✅ ${n} cartes importées`); process.exit(0); })
  .catch((err) => { console.error("❌", err); process.exit(1); });
