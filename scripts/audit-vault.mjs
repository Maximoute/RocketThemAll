import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const vaultRoot = path.resolve(
  process.argv[2] ??
    process.env.RTA_VAULT_PATH ??
    path.join(repositoryRoot, "..", "Vault-RTA"),
);

if (!existsSync(vaultRoot)) {
  throw new Error(`Vault introuvable: ${vaultRoot}`);
}

const toPosix = (value) => value.split(path.sep).join("/");
const normalizeLookup = (value) =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\.md$/i, "")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

function parseScalar(rawValue) {
  const value = rawValue.trim();
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((part) => parseScalar(part));
  }
  return value.replace(/^(['"])(.*)\1$/, "$2");
}

function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---",
  );
  if (endIndex === -1) return {};

  const result = {};
  let listKey;
  for (const line of lines.slice(1, endIndex)) {
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && listKey) {
      if (!Array.isArray(result[listKey])) result[listKey] = [];
      result[listKey].push(parseScalar(listMatch[1]));
      continue;
    }

    const fieldMatch = line.match(/^([A-Za-zÀ-ÿ0-9_. -]+):\s*(.*)$/);
    if (!fieldMatch) continue;
    const [, rawKey, rawValue] = fieldMatch;
    const key = rawKey.trim();
    result[key] = parseScalar(rawValue);
    listKey = rawValue.trim() === "" ? key : undefined;
  }
  return result;
}

function frontmatterValue(frontmatter, ...keys) {
  const entries = Object.entries(frontmatter);
  for (const key of keys) {
    const match = entries.find(
      ([candidate]) => candidate.toLowerCase() === key.toLowerCase(),
    );
    if (match) return match[1];
  }
  return undefined;
}

function groupCount(values) {
  return Object.fromEntries(
    [...values.reduce((map, value) => {
      map.set(value, (map.get(value) ?? 0) + 1);
      return map;
    }, new Map())].sort((left, right) => {
      const countDifference = right[1] - left[1];
      return countDifference || left[0].localeCompare(right[0], "fr");
    }),
  );
}

function markdownTable(headers, rows) {
  const escape = (value) =>
    String(value ?? "")
      .replaceAll("|", "\\|")
      .replace(/\r?\n/g, " ");
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

const allFiles = walk(vaultRoot);
const markdownFiles = allFiles.filter(
  (file) => path.extname(file).toLowerCase() === ".md",
);
const noteRecords = markdownFiles.map((absolutePath) => {
  const content = readFileSync(absolutePath, "utf8");
  const relativePath = toPosix(path.relative(vaultRoot, absolutePath));
  const frontmatter = parseFrontmatter(content);
  const headings = [...content.matchAll(/^(#{1,6})\s+(.+)$/gm)].map(
    ([, marks, title]) => ({ level: marks.length, title: title.trim() }),
  );
  const wikiLinks = [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map(
    ([, link]) => link.split("|")[0].split("#")[0].trim(),
  );
  const markdownAssets = [
    ...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g),
  ].map(([, link]) => link.trim().replace(/^<|>$/g, ""));
  const frontmatterAssets = Object.entries(frontmatter)
    .filter(
      ([key, value]) =>
        typeof value === "string" &&
        /(image|asset|icon|thumbnail)/i.test(key) &&
        /\.(?:png|jpe?g|webp|gif|svg)$/i.test(value),
    )
    .map(([, value]) => value);

  return {
    path: relativePath,
    area: relativePath.split("/")[0] || "(root)",
    bytes: statSync(absolutePath).size,
    lines: content.split(/\r?\n/).length,
    title:
      headings.find((heading) => heading.level === 1)?.title ??
      path.basename(relativePath, ".md"),
    type: String(frontmatterValue(frontmatter, "type") ?? "markdown"),
    database: frontmatterValue(frontmatter, "database"),
    status: frontmatterValue(frontmatter, "status", "statut", "satut"),
    id: frontmatterValue(
      frontmatter,
      "id",
      "quest_id",
      "achievement_id",
      "cle",
      "item_key",
      "boss_key",
    ),
    frontmatter,
    headings,
    wikiLinks,
    assetLinks: [...new Set([...markdownAssets, ...frontmatterAssets])],
    sha256: createHash("sha256").update(content).digest("hex"),
  };
});

const lookup = new Map();
for (const note of noteRecords) {
  const withoutExtension = note.path.replace(/\.md$/i, "");
  const keys = [
    normalizeLookup(withoutExtension),
    normalizeLookup(path.basename(withoutExtension)),
    normalizeLookup(note.title),
  ];
  const aliases = note.frontmatter.aliases;
  if (Array.isArray(aliases)) {
    keys.push(...aliases.map((alias) => normalizeLookup(String(alias))));
  }
  for (const key of keys) {
    if (!lookup.has(key)) lookup.set(key, []);
    lookup.get(key).push(note.path);
  }
}

const brokenWikiLinks = [];
for (const note of noteRecords) {
  for (const link of note.wikiLinks) {
    if (!link) continue;
    const normalized = normalizeLookup(link);
    const relativeNormalized = normalizeLookup(
      toPosix(path.join(path.dirname(note.path), link)),
    );
    if (!lookup.has(normalized) && !lookup.has(relativeNormalized)) {
      brokenWikiLinks.push({ source: note.path, target: link });
    }
  }
}

const externalReferencePattern = /^(?:https?:|data:|#)/i;
const brokenAssetLinks = [];
const referencedAssets = new Set();
for (const note of noteRecords) {
  for (const link of note.assetLinks) {
    if (!link || externalReferencePattern.test(link)) continue;
    const cleanLink = decodeURIComponent(link.split("#")[0].split("?")[0]);
    const resolved = path.resolve(
      vaultRoot,
      path.dirname(note.path),
      cleanLink,
    );
    if (existsSync(resolved)) {
      referencedAssets.add(path.normalize(resolved).toLowerCase());
    } else {
      brokenAssetLinks.push({ source: note.path, target: link });
    }
  }
}

const recordsById = new Map();
for (const note of noteRecords.filter((record) => record.id)) {
  const id = String(note.id);
  if (!recordsById.has(id)) recordsById.set(id, []);
  recordsById.get(id).push(note);
}
const duplicateIds = [...recordsById.entries()]
  .filter(([, records]) => records.length > 1)
  .map(([id, records]) => ({
    id,
    paths: records.map((record) => record.path),
  }));

const cardFields = [
  "nom_fr",
  "deck",
  "category",
  "rarity",
  "world",
  "zone",
  "economy_value",
  "xp_reward",
  "drop_rate",
  "sell_price",
  "recycle_fragments",
  "variant_normal_drop_rate",
  "variant_shiny_drop_rate",
  "variant_holo_drop_rate",
  "quiz_choice_count",
];
const cardMirrorDifferences = [];
for (const [id, records] of recordsById.entries()) {
  const cards = records.filter((record) => record.type === "card");
  if (cards.length < 2) continue;
  const differences = cardFields.filter((field) => {
    const values = new Set(
      cards.map((card) => JSON.stringify(card.frontmatter[field])),
    );
    return values.size > 1;
  });
  if (differences.length > 0) {
    cardMirrorDifferences.push({
      id,
      fields: differences,
      paths: cards.map((card) => card.path),
    });
  }
}

const preferredCards = [
  ...recordsById.entries(),
]
  .map(([, records]) => {
    const cards = records.filter((record) => record.type === "card");
    return (
      cards.find((record) => record.path.startsWith("20-Cards/")) ?? cards[0]
    );
  })
  .filter(Boolean);

const cardValidationErrors = [];
for (const card of preferredCards) {
  const required = ["id", "nom_fr", "deck", "rarity", "world", "zone"];
  for (const field of required) {
    if (card.frontmatter[field] === undefined || card.frontmatter[field] === "") {
      cardValidationErrors.push({
        path: card.path,
        issue: `champ requis absent: ${field}`,
      });
    }
  }
  const variantFields = [
    "variant_normal_drop_rate",
    "variant_shiny_drop_rate",
    "variant_holo_drop_rate",
  ];
  const variantRates = variantFields.map((field) =>
    Number(card.frontmatter[field]),
  );
  if (
    variantRates.some((rate) => !Number.isFinite(rate) || rate < 0 || rate > 1)
  ) {
    cardValidationErrors.push({
      path: card.path,
      issue: "probabilité de variante invalide",
    });
  } else if (
    Math.abs(variantRates.reduce((sum, rate) => sum + rate, 0) - 1) >
    0.000001
  ) {
    cardValidationErrors.push({
      path: card.path,
      issue: "la somme des probabilités de variante est différente de 1",
    });
  }
}

const cardsByDeck = new Map();
for (const card of preferredCards) {
  const deck = String(card.frontmatter.deck ?? "(sans deck)");
  if (!cardsByDeck.has(deck)) cardsByDeck.set(deck, []);
  cardsByDeck.get(deck).push(card);
}
const deckDistributions = [...cardsByDeck.entries()]
  .map(([deck, cards]) => ({
    deck,
    count: cards.length,
    rarities: groupCount(
      cards.map((card) => String(card.frontmatter.rarity ?? "(absente)")),
    ),
  }))
  .sort((left, right) => left.deck.localeCompare(right.deck, "fr"));

const exactDuplicateGroups = [
  ...noteRecords.reduce((map, record) => {
    if (!map.has(record.sha256)) map.set(record.sha256, []);
    map.get(record.sha256).push(record.path);
    return map;
  }, new Map()),
]
  .filter(([, paths]) => paths.length > 1)
  .map(([sha256, paths]) => ({ sha256, paths }));

const extensionCounts = groupCount(
  allFiles.map((file) => path.extname(file).toLowerCase() || "(sans extension)"),
);
const areaCounts = groupCount(
  allFiles.map(
    (file) =>
      toPosix(path.relative(vaultRoot, file)).split("/")[0] || "(root)",
  ),
);
const noteAreaCounts = groupCount(noteRecords.map((record) => record.area));
const typeCounts = groupCount(noteRecords.map((record) => record.type));
const databaseCounts = groupCount(
  noteRecords
    .map((record) => record.database)
    .filter(Boolean)
    .map(String),
);
const statusCounts = groupCount(
  noteRecords
    .map((record) => record.status)
    .filter((status) => status !== undefined && status !== "")
    .map(String),
);

const assetExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
]);
const assetFiles = allFiles.filter((file) =>
  assetExtensions.has(path.extname(file).toLowerCase()),
);
const unreferencedAssets = assetFiles
  .filter(
    (file) => !referencedAssets.has(path.normalize(file).toLowerCase()),
  )
  .map((file) => toPosix(path.relative(vaultRoot, file)));

const report = {
  generatedAt: new Date().toISOString(),
  vaultRoot,
  totals: {
    files: allFiles.length,
    markdown: noteRecords.length,
    assets: assetFiles.length,
    bytes: allFiles.reduce((sum, file) => sum + statSync(file).size, 0),
    uniqueCards: preferredCards.length,
  },
  counts: {
    extensions: extensionCounts,
    areas: areaCounts,
    noteAreas: noteAreaCounts,
    noteTypes: typeCounts,
    databases: databaseCounts,
    statuses: statusCounts,
  },
  validation: {
    brokenWikiLinks,
    brokenAssetLinks,
    duplicateIds,
    exactDuplicateGroups,
    cardMirrorDifferences,
    cardValidationErrors,
    unreferencedAssets,
  },
  deckDistributions,
  notes: noteRecords,
};

const contextDirectory = path.join(repositoryRoot, "docs", "ai-context");
const auditDirectory = path.join(repositoryRoot, "docs", "audit");
mkdirSync(contextDirectory, { recursive: true });
mkdirSync(auditDirectory, { recursive: true });

writeFileSync(
  path.join(contextDirectory, "vault-index.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

const indexMarkdown = `# Index généré du vault RTA

> Généré par \`npm run audit:vault\` le ${report.generatedAt}. Ne pas modifier à la main.

## Totaux

${markdownTable(
  ["Mesure", "Valeur"],
  [
    ["Fichiers", report.totals.files],
    ["Notes Markdown", report.totals.markdown],
    ["Assets image", report.totals.assets],
    ["Cartes uniques", report.totals.uniqueCards],
    ["Taille totale (octets)", report.totals.bytes],
  ],
)}

## Répartition des notes

${markdownTable(
  ["Zone", "Notes"],
  Object.entries(noteAreaCounts).map(([area, count]) => [area, count]),
)}

## Catalogues Notion

${markdownTable(
  ["Base", "Fiches"],
  Object.entries(databaseCounts).map(([database, count]) => [database, count]),
)}

## Statuts rencontrés

${markdownTable(
  ["Statut", "Fiches"],
  Object.entries(statusCounts).map(([status, count]) => [status, count]),
)}

## Distribution des cartes par deck

${markdownTable(
  ["Deck", "Cartes", "Common", "Uncommon", "Rare", "Very Rare", "Import", "Exotic", "Black Market"],
  deckDistributions.map(({ deck, count, rarities }) => [
    deck,
    count,
    rarities.Common ?? 0,
    rarities.Uncommon ?? 0,
    rarities.Rare ?? 0,
    rarities["Very Rare"] ?? 0,
    rarities.Import ?? 0,
    rarities.Exotic ?? 0,
    rarities["Black Market"] ?? 0,
  ]),
)}

## Résultats de validation

${markdownTable(
  ["Contrôle", "Nombre"],
  [
    ["Liens wiki non résolus", brokenWikiLinks.length],
    ["Références d’assets absentes", brokenAssetLinks.length],
    ["Identifiants présents dans plusieurs notes", duplicateIds.length],
    ["Groupes de notes strictement identiques", exactDuplicateGroups.length],
    ["Miroirs de cartes divergents sur des champs métier", cardMirrorDifferences.length],
    ["Erreurs de validation de cartes", cardValidationErrors.length],
    ["Assets sans référence Markdown/frontmatter", unreferencedAssets.length],
  ],
)}

## Documents de conception et d’architecture

${markdownTable(
  ["Fichier", "Sujet", "Statut", "Lignes", "Priorité"],
  noteRecords
    .filter(
      (record) =>
        /^(00-Cockpit|01-Vision & Gameplay|02-Contenu du jeu|03-Developpement)\//.test(
          record.path,
        ) && !record.path.includes("/Prisma Models/Model - "),
    )
    .map((record) => [
      `\`${record.path}\``,
      record.title,
      record.status ?? "non précisé",
      record.lines,
      record.status === "decision" ? "normative" : "à qualifier",
    ]),
)}

Les détails par note, leurs frontmatters, titres, liens et contrôles sont conservés dans
\`docs/ai-context/vault-index.json\`.
`;

writeFileSync(
  path.join(contextDirectory, "VAULT_INDEX.generated.md"),
  indexMarkdown,
  "utf8",
);

const inventoryMarkdown = `# Inventaire généré du contenu RTA

> Généré par \`npm run audit:vault\` le ${report.generatedAt}. Ne pas modifier à la main.

## Fichiers par zone

${markdownTable(
  ["Zone", "Fichiers"],
  Object.entries(areaCounts).map(([area, count]) => [area, count]),
)}

## Extensions

${markdownTable(
  ["Extension", "Fichiers"],
  Object.entries(extensionCounts).map(([extension, count]) => [
    extension,
    count,
  ]),
)}

## Types de notes

${markdownTable(
  ["Type", "Notes"],
  Object.entries(typeCounts).map(([type, count]) => [type, count]),
)}

## Anomalies de contenu

- Liens wiki non résolus : **${brokenWikiLinks.length}**
- Références d’assets absentes : **${brokenAssetLinks.length}**
- Miroirs de cartes divergents sur des champs métier : **${cardMirrorDifferences.length}**
- Erreurs de validation de cartes : **${cardValidationErrors.length}**
- Assets sans référence détectée : **${unreferencedAssets.length}**

Le détail exhaustif et exploitable par machine se trouve dans
\`docs/ai-context/vault-index.json\`.
`;

writeFileSync(
  path.join(auditDirectory, "CONTENT_INVENTORY.generated.md"),
  inventoryMarkdown,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      vaultRoot,
      totals: report.totals,
      issues: {
        brokenWikiLinks: brokenWikiLinks.length,
        brokenAssetLinks: brokenAssetLinks.length,
        duplicateIds: duplicateIds.length,
        exactDuplicateGroups: exactDuplicateGroups.length,
        cardMirrorDifferences: cardMirrorDifferences.length,
        cardValidationErrors: cardValidationErrors.length,
      },
    },
    null,
    2,
  ),
);
