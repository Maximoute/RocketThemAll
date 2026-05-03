import { importRocketLeagueItems } from "../packages/importers/src/rocketLeagueItemsImporter";

async function main() {
  const limitArg = Number(process.argv[2] ?? "");
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : undefined;
  console.log("Starting Rocket League items import...\n");
  try {
    const result = await importRocketLeagueItems({ limit });
    console.log(
      `\nDone. created=${result.created}, updated=${result.updated}, blacklisted=${result.blacklisted}, skipped=${result.skipped}`
    );
    process.exit(0);
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  }
}

main();