import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectories = [
  "apps/web/.next",
  "apps/web/.next-dev",
  "apps/api/dist",
  "apps/bot/dist",
  "apps/worker/dist",
  "apps/web/dist",
  "packages/auth/dist",
  "packages/database/dist",
  "packages/game-engine/dist",
  "packages/services/dist",
  "packages/shared/dist",
  "packages/importers",
  "node_modules/@rta/importers"
];

for (const relativeDirectory of generatedDirectories) {
  const target = path.resolve(workspaceRoot, relativeDirectory);
  const workspacePrefix = `${workspaceRoot}${path.sep}`;
  if (!target.startsWith(workspacePrefix)) {
    throw new Error(`Refus de nettoyer une cible hors workspace : ${target}`);
  }
  rmSync(target, { recursive: true, force: true });
}

console.log("Sorties de build générées nettoyées.");
