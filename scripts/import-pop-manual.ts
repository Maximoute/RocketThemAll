import { loadEnv } from "./loadEnv";
import { importManualPopCulture } from "../packages/importers/pop/manualPopImporter";

const customPath = process.argv[2]; // facultatif : chemin vers un autre JSON

async function main() {
  await loadEnv();

  console.log(`📋 Import cartes pop culture manuelles...`);
  importManualPopCulture(customPath)
    .then((n) => { console.log(`✅ ${n} cartes importées`); process.exit(0); })
    .catch((err) => { console.error("❌", err); process.exit(1); });
}

main();
