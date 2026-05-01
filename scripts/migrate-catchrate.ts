import { prisma } from "../packages/database/src/index";

async function main() {
const catchRates: Record<string, number> = {
  Common: 1.0,
  Uncommon: 0.85,
  Rare: 0.65,
  "Very Rare": 0.45,
  Import: 0.30,
  Exotic: 0.15,
  "Black Market": 0.08,
  Limited: 0.05,
};

// Add column if not exists
await prisma.$executeRawUnsafe(
  `ALTER TABLE "Rarity" ADD COLUMN IF NOT EXISTS "catchRate" FLOAT NOT NULL DEFAULT 1.0`
);
console.log("✅ Colonne catchRate ajoutée (ou déjà présente)");

// Set values per rarity
for (const [name, rate] of Object.entries(catchRates)) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Rarity" SET "catchRate" = $1 WHERE name = $2`,
    rate,
    name
  );
}
console.log("✅ Taux de capture définis");

// Verify
const rows = await prisma.$queryRawUnsafe<Array<{ name: string; weight: number; catchRate: number }>>(
  `SELECT name, weight, "catchRate" FROM "Rarity" ORDER BY weight DESC`
);
console.table(rows);

await prisma.$disconnect();
}
main().catch(console.error);
