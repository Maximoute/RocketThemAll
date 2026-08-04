import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const contextDirectory = path.join(root, "docs", "ai-context");
const requiredDocuments = [
  "PROJECT_OVERVIEW.md",
  "VAULT_INDEX.md",
  "GAME_SYSTEMS_INDEX.md",
  "TECHNICAL_ARCHITECTURE.md",
  "DATABASE_MODEL.md",
  "DISCORD_COMMANDS.md",
  "WEBSITE_FEATURES.md",
  "ECONOMY_MODEL.md",
  "BALANCING_RULES.md",
  "SECURITY_MODEL.md",
  "CONTENT_INVENTORY.md",
  "OPEN_QUESTIONS.md",
  "ASSUMPTIONS.md",
  "CONFLICTS_AND_DECISIONS.md",
  "TRACEABILITY_MATRIX.md",
  "IMPLEMENTATION_PLAN.md",
  "PROGRESS.md",
  "TEST_STRATEGY.md",
  "DEPLOYMENT_GUIDE.md"
];

for (const document of requiredDocuments) {
  const documentPath = path.join(contextDirectory, document);
  await access(documentPath);
  const contents = await readFile(documentPath, "utf8");
  if (!contents.trim().startsWith("#") || contents.trim().length < 80) {
    throw new Error(`${document} is missing a substantive Markdown document`);
  }
}

const indexPath = path.join(contextDirectory, "vault-index.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));
const expectedTotals = {
  files: 4_809,
  markdown: 2_196,
  assets: 2_531,
  uniqueCards: 810
};

for (const [key, expected] of Object.entries(expectedTotals)) {
  if (index.totals?.[key] !== expected) {
    throw new Error(`vault-index totals.${key}: expected ${expected}, received ${index.totals?.[key]}`);
  }
}

const expectedDatabases = {
  "BDD - Achievements": 156,
  "BDD - Quetes": 90,
  "BDD - Zones": 81,
  "BDD - Competences": 45,
  "BDD - Items": 42,
  "BDD - Categories": 27,
  "BDD - Decks": 27,
  "BDD - Bosses": 17,
  "BDD - Mondes": 9,
  "BDD - Saisons": 1
};

for (const [name, expected] of Object.entries(expectedDatabases)) {
  if (index.counts?.databases?.[name] !== expected) {
    throw new Error(`vault-index databases.${name}: expected ${expected}`);
  }
}

if (index.validation?.cardValidationErrors?.length !== 0) {
  throw new Error("vault-index contains card validation errors");
}
if (index.validation?.cardMirrorDifferences?.length !== 0) {
  throw new Error("vault-index contains divergent card mirrors");
}

const expectedGuardianMechanics = new Map([
  ["world-1", "HARMONIZATION"],
  ["world-2", "EXPEDITION_MINION"],
  ["world-3", "COLLECTIVE_COLLECTION"],
  ["world-4", "OFFERING"],
  ["world-5", "HUNT"],
  ["world-6", "HARMONIZATION"],
  ["world-7", "OFFERING"],
  ["world-8", "COLLECTIVE_COLLECTION"]
]);
const guardians = index.notes.filter(
  (note) => note.frontmatter?.family_key === "PROGRESSION_GATE"
);
if (guardians.length !== expectedGuardianMechanics.size) {
  throw new Error(
    `vault-index guardians: expected ${expectedGuardianMechanics.size}, received ${guardians.length}`
  );
}
for (const [worldId, expectedMechanic] of expectedGuardianMechanics) {
  const guardian = guardians.find((note) => note.frontmatter?.monde_id === worldId);
  if (!guardian) {
    throw new Error(`vault-index guardian missing for ${worldId}`);
  }
  if (guardian.frontmatter?.mecanique_principale !== expectedMechanic) {
    throw new Error(
      `vault-index guardian ${worldId}: expected ${expectedMechanic}, ` +
      `received ${guardian.frontmatter?.mecanique_principale}`
    );
  }
}

console.log(`Context validation passed: ${requiredDocuments.length} documents, ${index.totals.files} vault files.`);
