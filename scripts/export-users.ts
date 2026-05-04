import { prisma } from "../packages/database/src/index";
import { writeFileSync } from "fs";

function sql(value: string | number | boolean | null | Date): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      inventory: true,
      boosters: true,
      userBoosters: true,
      fragmentBalances: true
    }
  });

  const lines: string[] = [
    "-- Export utilisateurs RocketThemAll",
    `-- Généré le ${new Date().toISOString()}`,
    `-- ${users.length} utilisateur(s)`,
    "",
    "BEGIN;",
    ""
  ];

  for (const user of users) {
    lines.push(
      `INSERT INTO "User" (` +
        `"id", "discordId", "username", "avatarUrl", "isAdmin", "level", "xp", "credits", "fragments", ` +
        `"lastManualSpawnAt", "spawnCharges", "lastSpawnChargeRegenAt", "lastDailyRewardAt", "createdAt"` +
      `) VALUES (` +
        `${sql(user.id)}, ${sql(user.discordId)}, ${sql(user.username)}, ${sql(user.avatarUrl)}, ` +
        `${sql(user.isAdmin)}, ${sql(user.level)}, ${sql(user.xp)}, ${sql(user.credits)}, ${sql(user.fragments)}, ` +
        `${sql(user.lastManualSpawnAt)}, ${sql(user.spawnCharges)}, ${sql(user.lastSpawnChargeRegenAt)}, ` +
        `${sql(user.lastDailyRewardAt)}, ${sql(user.createdAt)}` +
      `) ON CONFLICT ("id") DO UPDATE SET ` +
        `"username" = EXCLUDED."username", "avatarUrl" = EXCLUDED."avatarUrl", "isAdmin" = EXCLUDED."isAdmin", ` +
        `"level" = EXCLUDED."level", "xp" = EXCLUDED."xp", "credits" = EXCLUDED."credits", ` +
        `"fragments" = EXCLUDED."fragments", "spawnCharges" = EXCLUDED."spawnCharges";`
    );

    for (const item of user.inventory) {
      lines.push(
        `INSERT INTO "InventoryItem" ("id", "userId", "cardId", "variant", "quantity") VALUES (` +
          `${sql(item.id)}, ${sql(item.userId)}, ${sql(item.cardId)}, ${sql(item.variant)}, ${sql(item.quantity)}` +
        `) ON CONFLICT ("userId", "cardId", "variant") DO UPDATE SET "quantity" = EXCLUDED."quantity";`
      );
    }

    if (user.boosters) {
      const b = user.boosters;
      lines.push(
        `INSERT INTO "Booster" ("id", "userId", "common", "uncommon", "rare", "veryRare", "import", "exotic", "blackMarket", "limited") VALUES (` +
          `${sql(b.id)}, ${sql(b.userId)}, ${sql((b as any).common ?? 0)}, ${sql((b as any).uncommon ?? 0)}, ` +
          `${sql((b as any).rare ?? 0)}, ${sql((b as any).veryRare ?? 0)}, ${sql((b as any).import ?? 0)}, ` +
          `${sql((b as any).exotic ?? 0)}, ${sql((b as any).blackMarket ?? 0)}, ${sql((b as any).limited ?? 0)}` +
        `) ON CONFLICT ("userId") DO UPDATE SET ` +
          `"common" = EXCLUDED."common", "uncommon" = EXCLUDED."uncommon", "rare" = EXCLUDED."rare", ` +
          `"veryRare" = EXCLUDED."veryRare", "import" = EXCLUDED."import", "exotic" = EXCLUDED."exotic", ` +
          `"blackMarket" = EXCLUDED."blackMarket", "limited" = EXCLUDED."limited";`
      );
    }

    for (const ub of user.userBoosters) {
      lines.push(
        `INSERT INTO "UserBooster" ("id", "userId", "boosterType", "quantity") VALUES (` +
          `${sql(ub.id)}, ${sql(ub.userId)}, ${sql(ub.boosterType)}, ${sql(ub.quantity)}` +
        `) ON CONFLICT ("userId", "boosterType") DO UPDATE SET "quantity" = EXCLUDED."quantity";`
      );
    }

    for (const fb of user.fragmentBalances) {
      lines.push(
        `INSERT INTO "FragmentBalance" ("id", "userId", "deckId", "balance") VALUES (` +
          `${sql(fb.id)}, ${sql(fb.userId)}, ${sql(fb.deckId)}, ${sql(fb.balance)}` +
        `) ON CONFLICT ("userId", "deckId") DO UPDATE SET "balance" = EXCLUDED."balance";`
      );
    }

    lines.push("");
  }

  lines.push("COMMIT;");

  const outPath = "./users-export.sql";
  writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`✅ ${users.length} utilisateurs exportés dans ${outPath}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
