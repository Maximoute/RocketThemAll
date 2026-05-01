import { importPopCulture as importPopCultureFromTmdb } from "@rta/importers";

async function importPopCulture(limit: number) {
  return importPopCultureFromTmdb(limit, 1, 3);
}

async function main() {
  const argLimit = Number(process.argv[2] ?? "150");
  const limit = Number.isFinite(argLimit) && argLimit > 0 ? Math.floor(argLimit) : 150;

  console.log(`Starting pop culture import (limit=${limit}, pages=1..3)...\n`);

  try {
    const count = await importPopCulture(limit);
    console.log(`\n✨ Successfully imported ${count} pop culture cards!`);
    process.exit(0);
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  }
}

main();
