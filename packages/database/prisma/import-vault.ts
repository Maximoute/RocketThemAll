import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";

const EXPECTED_CARD_COUNT = 810;
const EXPECTED_DECK_COUNT = 27;
const EXPECTED_WORLD_COUNT = 9;
const EXPECTED_ZONE_COUNT = 81;
const EXPECTED_ITEM_COUNT = 42;
const EXPECTED_QUEST_COUNT = 90;
const EXPECTED_ACHIEVEMENT_COUNT = 156;
const EXPECTED_BOSS_COUNT = 17;
const EXPECTED_SKILL_COUNT = 45;
const BATCH_SIZE = 25;
const DEFAULT_VAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../Vault-RTA"
);

const rarityRules: Record<string, { weight: number; catchRate: number }> = {
  Common: { weight: 50, catchRate: 0.65 },
  Uncommon: { weight: 22, catchRate: 0.5 },
  Rare: { weight: 12, catchRate: 0.35 },
  "Very Rare": { weight: 7, catchRate: 0.25 },
  Import: { weight: 4, catchRate: 0.18 },
  Exotic: { weight: 3, catchRate: 0.1 },
  "Black Market": { weight: 1, catchRate: 0.05 }
};

type CsvRecord = Record<string, string>;

type CanonicalCard = {
  name: string;
  deckName: string;
  rarityName: string;
  worldName: string;
  primaryZoneName: string;
  compatibleZoneNames: string[];
  captureHint: string | null;
  quizChoices: string[];
  imageUrl: string | null;
  description: string | null;
  metadata: Prisma.InputJsonValue;
  acceptedNames: string[];
  rarityFactors: Prisma.InputJsonValue;
  xpReward: number;
  dropRate: number;
  source: string;
  sourceId: string;
  contentKey: string;
  category: string | null;
  status: "PUBLISHED";
  isActive: boolean;
  licenseStatus: string | null;
  licenseProofUrl: string | null;
};

function parseCsv(input: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("CSV invalide : champ entre guillemets non terminé.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    throw new Error("CSV vide.");
  }

  const headers = headerRow.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "") : header
  );

  return dataRows
    .filter((values) => values.some((value) => value.trim().length > 0))
    .map((values, index) => {
      if (values.length !== headers.length) {
        throw new Error(
          `CSV invalide à la ligne logique ${index + 2} : ${values.length} colonnes au lieu de ${headers.length}.`
        );
      }

      return Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    });
}

function required(record: CsvRecord, column: string, rowNumber: number): string {
  const value = record[column]?.trim();
  if (!value) {
    throw new Error(`Valeur "${column}" manquante à la ligne ${rowNumber}.`);
  }
  return value;
}

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string): boolean {
  return ["1", "true", "yes", "__yes__", "oui"].includes(value.trim().toLowerCase());
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueNames(record: CsvRecord): string[] {
  const values = [
    record.Nom,
    record["Nom FR"],
    record["Nom EN"],
    ...(record["Accepted names"] ?? "").split("|")
  ];
  const seen = new Set<string>();

  return values
    .map((value) => value.trim())
    .filter((value) => {
      const normalized = value.toLocaleLowerCase("fr-FR");
      if (!value || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
}

function resolveVariantImageUrls(
  vaultRoot: string,
  publicMediaBaseUrl: string,
  record: CsvRecord
) {
  const deckDirectory = record.Deck === "Apex Predators" ? "Apex Legends" : record.Deck;
  const variants = {
    normal: "",
    shiny: "_shiny",
    holo: "_holo"
  } as const;
  const urls: Record<keyof typeof variants, string> = {
    normal: "",
    shiny: "",
    holo: ""
  };

  for (const [variant, suffix] of Object.entries(variants) as Array<
    [keyof typeof variants, string]
  >) {
    const absoluteImage = path.join(
      vaultRoot,
      "20-Cards",
      deckDirectory,
      `${record.Nom}${suffix}.png`
    );
    if (!fs.existsSync(absoluteImage)) {
      throw new Error(`Image ${variant} introuvable pour ${record.ID} : ${absoluteImage}`);
    }
    urls[variant] =
      `${publicMediaBaseUrl}/vault/cards/${encodeURIComponent(record.ID)}${suffix}.png`;
  }
  return urls;
}

const itemEffects: Record<string, string> = {
  "artifact.spectral_scanner": "EXP_ROUTE_ANALYSIS",
  "artifact.momentum_gauntlet": "CAPTURE_TIER_PITY_90",
  "artifact.archive_vault": "EXP_ARCHIVE_RESONANCE",
  "artifact.preparation_hourglass": "CONSUMABLE_EXTEND_WHITELISTED",
  "artifact.collector_idol": "EXP_DUPLICATE_REROLL",
  "consumable.expedition_pass": "EXP_FREE_PAID_ZONE_ENTRY",
  "consumable.affinity_incense": "EXP_DECK_WEIGHT_BOOST",
  "consumable.common_incense": "EXP_TIER_WEIGHT_BOOST",
  "consumable.uncommon_incense": "EXP_TIER_WEIGHT_BOOST",
  "consumable.rare_incense": "EXP_TIER_WEIGHT_BOOST",
  "consumable.very_rare_incense": "EXP_TIER_WEIGHT_BOOST",
  "consumable.bifurcation_prism": "EXP_REPLACE_ONE_ROUTE",
  "consumable.lucidity_elixir": "EXP_REVEAL_EXACT_DISTRIBUTION",
  "consumable.precision_catalyst": "CAPTURE_CHANCE_PLUS_POINTS",
  "consumable.anchor_net": "CAPTURE_SECOND_ATTEMPT",
  "consumable.fortune_talisman": "ITEM_DROP_ROLL_TWICE",
  "consumable.rally_banner": "BOSS_SERVER_PROGRESS_BOOST",
  "offering.funeral_candle": "BOSS_OFFERING_COMMON_THRESHOLD",
  "offering.silver_tear": "BOSS_OFFERING_REVEAL_PHASE",
  "offering.broken_mask": "BOSS_OFFERING_SOURCE_SPECIFIC",
  "offering.void_flower": "BOSS_TIMER_EXTENSION",
  "booster.boss_choice.common": "BOSS_CHOICE_BOOSTER",
  "booster.boss_choice.uncommon": "BOSS_CHOICE_BOOSTER",
  "booster.boss_choice.rare": "BOSS_CHOICE_BOOSTER",
  "booster.boss_choice.very_rare": "BOSS_CHOICE_BOOSTER",
  "booster.boss_choice.import": "BOSS_CHOICE_BOOSTER",
  "booster.boss_choice.exotic": "BOSS_CHOICE_BOOSTER",
  "chest.boss_reward.common": "BOSS_REWARD_CHEST",
  "chest.boss_reward.uncommon": "BOSS_REWARD_CHEST",
  "chest.boss_reward.rare": "BOSS_REWARD_CHEST",
  "chest.boss_reward.very_rare": "BOSS_REWARD_CHEST",
  "chest.boss_reward.import": "BOSS_REWARD_CHEST",
  "chest.boss_reward.exotic": "BOSS_REWARD_CHEST"
};

function itemType(category: string) {
  if (category === "Artefact") return "ARTIFACT" as const;
  if (category === "Consommable") return "CONSUMABLE" as const;
  if (category === "Offrande de boss") return "OFFERING" as const;
  if (category === "Souvenir") return "SOUVENIR" as const;
  if (category.startsWith("Booster")) return "BOOSTER" as const;
  if (category.startsWith("Coffre")) return "CHEST" as const;
  throw new Error(`Catégorie d'objet inconnue : "${category}".`);
}

function yes(value: string | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("fr-FR") === "oui";
}

function splitValues(value: string | undefined) {
  return (value ?? "").split("|").map((entry) => entry.trim()).filter(Boolean);
}

function skillBranch(value: string) {
  if (value === "Explorer") return "EXPLORER" as const;
  if (value === "Hunter") return "HUNTER" as const;
  if (value === "Collector") return "COLLECTOR" as const;
  throw new Error(`Branche de compétence inconnue : "${value}".`);
}

function skillNodeKind(value: string) {
  if (value === "COMMON") return "COMMON" as const;
  if (value === "SPECIALIZATION_GATE") return "SPECIALIZATION_GATE" as const;
  if (value === "SPECIALIZATION_UPGRADE") return "SPECIALIZATION_UPGRADE" as const;
  throw new Error(`Type technique de compétence inconnu : "${value}".`);
}

function grantedSkillItemKey(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR");
  if (normalized.startsWith("scanner spectral")) return "artifact.spectral_scanner";
  if (normalized.startsWith("gantelet de momentum")) return "artifact.momentum_gauntlet";
  if (normalized.startsWith("coffre d'archives") || normalized.startsWith("coffre d’archives")) {
    return "artifact.archive_vault";
  }
  return null;
}

function parseJsonList(value: string | undefined, column: string, rowNumber: number): Prisma.JsonArray {
  const raw = (value ?? "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("la valeur JSON n'est pas une liste");
    }
    return parsed as Prisma.JsonArray;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON invalide dans "${column}" à la ligne ${rowNumber}: ${message}`);
  }
}

function fixedQuestTarget(name: string) {
  const normalized = name.toLocaleLowerCase("fr-FR");
  if (/\b(trois|3)\b/.test(normalized)) return 3;
  if (/\b(deux|2)\b/.test(normalized)) return 2;
  return 1;
}

function questTarget(row: CsvRecord) {
  const strategy = row["Stratégie cible"];
  if (strategy === "GENERAL_EXPLORATION_TABLE") return 3;
  if (strategy === "ZONE_EXPLORATION_TABLE") return 2;
  if (strategy === "DISCOVERY_TABLE") return 2;
  if (strategy === "EVENT_TABLE") return 1;
  return fixedQuestTarget(row.Nom ?? "");
}

function worldNumber(value: string) {
  const match = /^world-(\d+)$/.exec(value.trim());
  const position = Number(match?.[1]);
  if (!Number.isSafeInteger(position) || position < 1 || position > EXPECTED_WORLD_COUNT) {
    throw new Error(`Identifiant de monde invalide : "${value}".`);
  }
  return position;
}

function toCanonicalCard(
  vaultRoot: string,
  publicMediaBaseUrl: string,
  record: CsvRecord,
  rowNumber: number
): CanonicalCard {
  const sourceId = required(record, "ID", rowNumber);
  const name = required(record, "Nom", rowNumber);
  const deckName = required(record, "Deck", rowNumber);
  const rarityName = required(record, "Rareté", rowNumber);
  const worldName = normalizeWhitespace(required(record, "Monde principal", rowNumber));
  const primaryZoneName = normalizeWhitespace(required(record, "Zone principale", rowNumber));
  const compatibleZoneNames = (record["Zones compatibles"] ?? "")
    .split("|")
    .map(normalizeWhitespace)
    .filter(Boolean);
  const rarityRule = rarityRules[rarityName];

  if (!rarityRule) {
    throw new Error(`Rareté inconnue "${rarityName}" pour ${sourceId}.`);
  }

  const production = (record.Statut ?? "").trim().toLocaleLowerCase("fr-FR") === "production";
  const rawRarityFactors = (record["Rarity factors"] ?? "").trim();
  const shortDescription = (record["Description courte"] ?? "").trim() || null;
  const longDescription = (record["Description longue"] ?? "").trim() || null;
  const sourceUrl = (record["Source URL"] ?? "").trim() || null;
  const sources = parseJsonList(record.Sources, "Sources", rowNumber);
  const exploreFurther = parseJsonList(record["Explore further"], "Explore further", rowNumber);
  const videos = parseJsonList(record.Videos, "Videos", rowNumber);
  const variantImages = resolveVariantImageUrls(vaultRoot, publicMediaBaseUrl, record);
  const catalog = Object.fromEntries(
    Object.entries(record).filter(([, value]) => value.trim().length > 0)
  );

  return {
    name,
    deckName,
    rarityName,
    worldName,
    primaryZoneName,
    compatibleZoneNames,
    captureHint: (record["Capture hint"] ?? "").trim() || null,
    quizChoices: (record["Quiz choices"] ?? "").split("|").map((value) => value.trim()).filter(Boolean),
    imageUrl: variantImages.normal,
    description: longDescription ?? shortDescription,
    metadata: {
      source: "vault",
      shortDescription,
      longDescription,
      lore: (record["Lore leger"] ?? "").trim() || null,
      sourceUrl,
      sources,
      exploreFurther,
      videos,
      worldName,
      primaryZoneName,
      compatibleZoneNames,
      variantImages,
      catalog
    },
    acceptedNames: uniqueNames(record),
    rarityFactors: {
      raw: rawRarityFactors,
      worldName,
      primaryZoneName,
      compatibleZoneNames,
      captureHint: (record["Capture hint"] ?? "").trim() || null,
      quizChoices: (record["Quiz choices"] ?? "").split("|").map((value) => value.trim()).filter(Boolean)
    },
    xpReward: Math.max(0, Math.floor(parseNumber(record["XP reward"] ?? "", 10))),
    dropRate: Math.max(0.0001, parseNumber(record["Drop rate"] ?? "", 0.1)),
    source: "vault",
    sourceId,
    contentKey: sourceId,
    category: (record.Categorie ?? "").trim() || null,
    status: "PUBLISHED",
    isActive: production,
    licenseStatus:
      (record["Publishing status"] || record["Image status"] || record["Public use allowed"] || "").trim() ||
      null,
    licenseProofUrl: (record["License url"] || record["Image source page"] || "").trim() || null
  };
}

async function removeStaleCards(prisma: PrismaClient, canonicalIds: string[], replaceCards: boolean) {
  const staleCards = await prisma.card.findMany({
    where: {
      OR: [{ contentKey: null }, { contentKey: { notIn: canonicalIds } }]
    },
    select: { id: true, name: true }
  });

  if (staleCards.length === 0) {
    return 0;
  }

  if (!replaceCards) {
    throw new Error(
      `${staleCards.length} carte(s) hors catalogue détectée(s). Relance avec RTA_REPLACE_CARDS=true pour les remplacer.`
    );
  }

  const staleIds = staleCards.map((card) => card.id);

  await prisma.$transaction([
    prisma.captureAttempt.deleteMany({
      where: { encounter: { cardId: { in: staleIds } } }
    }),
    prisma.encounter.deleteMany({ where: { cardId: { in: staleIds } } }),
    prisma.inventoryItem.deleteMany({ where: { cardId: { in: staleIds } } }),
    prisma.tradeItem.deleteMany({ where: { cardId: { in: staleIds } } }),
    prisma.captureLog.deleteMany({ where: { cardId: { in: staleIds } } }),
    prisma.card.deleteMany({ where: { id: { in: staleIds } } })
  ]);

  return staleCards.length;
}

export async function importVaultCatalog() {
  const vaultRoot = path.resolve(
    process.env.RTA_VAULT_ROOT || DEFAULT_VAULT_ROOT
  );
  const cardsCsvPath = path.join(vaultRoot, "_data", "cards.csv");
  const zonesCsvPath = path.join(vaultRoot, "_data", "notion_bdd", "BDD - Zones.csv");
  const itemsCsvPath = path.join(vaultRoot, "_data", "notion_bdd", "BDD - Items.csv");
  const questsCsvPath = path.join(vaultRoot, "_data", "notion_bdd", "BDD - Quetes.csv");
  const achievementsCsvPath = path.join(vaultRoot, "_data", "notion_bdd", "BDD - Achievements.csv");
  const bossesCsvPath = path.join(vaultRoot, "_data", "notion_bdd", "BDD - Bosses.csv");
  const skillsCsvPath = path.join(vaultRoot, "_data", "notion_bdd", "BDD - Competences.csv");
  const replaceCards = parseBoolean(process.env.RTA_REPLACE_CARDS ?? "");
  const publicMediaBaseUrl = (
    process.env.S3_PUBLIC_URL ||
    (process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/media` : "/media")
  ).replace(/\/+$/, "");

  if (!fs.existsSync(cardsCsvPath)) {
    throw new Error(`Catalogue introuvable : ${cardsCsvPath}`);
  }
  for (const catalogPath of [
    itemsCsvPath,
    zonesCsvPath,
    questsCsvPath,
    achievementsCsvPath,
    bossesCsvPath,
    skillsCsvPath
  ]) {
    if (!fs.existsSync(catalogPath)) {
      throw new Error(`Catalogue Vault introuvable : ${catalogPath}`);
    }
  }

  const rows = parseCsv(fs.readFileSync(cardsCsvPath, "utf8"));
  const zoneRows = parseCsv(fs.readFileSync(zonesCsvPath, "utf8"));
  const itemRows = parseCsv(fs.readFileSync(itemsCsvPath, "utf8"));
  const questRows = parseCsv(fs.readFileSync(questsCsvPath, "utf8"));
  const achievementRows = parseCsv(fs.readFileSync(achievementsCsvPath, "utf8"));
  const bossRows = parseCsv(fs.readFileSync(bossesCsvPath, "utf8"));
  const skillRows = parseCsv(fs.readFileSync(skillsCsvPath, "utf8"));
  if (rows.length !== EXPECTED_CARD_COUNT) {
    throw new Error(`${rows.length} cartes trouvées, ${EXPECTED_CARD_COUNT} attendues.`);
  }
  if (zoneRows.length !== EXPECTED_ZONE_COUNT) {
    throw new Error(`${zoneRows.length} zones trouvées, ${EXPECTED_ZONE_COUNT} attendues.`);
  }
  if (itemRows.length !== EXPECTED_ITEM_COUNT) {
    throw new Error(`${itemRows.length} objets trouvés, ${EXPECTED_ITEM_COUNT} attendus.`);
  }
  if (questRows.length !== EXPECTED_QUEST_COUNT) {
    throw new Error(`${questRows.length} quêtes trouvées, ${EXPECTED_QUEST_COUNT} attendues.`);
  }
  if (achievementRows.length !== EXPECTED_ACHIEVEMENT_COUNT) {
    throw new Error(
      `${achievementRows.length} succès trouvés, ${EXPECTED_ACHIEVEMENT_COUNT} attendus.`
    );
  }
  if (bossRows.length !== EXPECTED_BOSS_COUNT) {
    throw new Error(`${bossRows.length} boss trouvés, ${EXPECTED_BOSS_COUNT} attendus.`);
  }
  if (skillRows.length !== EXPECTED_SKILL_COUNT) {
    throw new Error(
      `${skillRows.length} compétences trouvées, ${EXPECTED_SKILL_COUNT} attendues.`
    );
  }

  const cards = rows.map((row, index) =>
    toCanonicalCard(vaultRoot, publicMediaBaseUrl, row, index + 2)
  );
  const canonicalIds = cards.map((card) => card.contentKey);
  const deckNames = [...new Set(cards.map((card) => card.deckName))].sort();
  const worldNames = [...new Set(cards.map((card) => card.worldName))].sort(
    (left, right) => worldPosition(left) - worldPosition(right)
  );
  const zoneNames = [...new Set(cards.map((card) => card.primaryZoneName))];
  const uniqueIds = new Set(canonicalIds);
  const uniqueDeckNames = new Set(deckNames);
  const uniqueDeckCardNames = new Set(cards.map((card) => `${card.deckName}\u0000${card.name}`));
  const sourceZones = new Map(
    zoneRows.map((zone, index) => {
      const rowNumber = index + 2;
      const worldName = normalizeWhitespace(required(zone, "World", rowNumber));
      const zoneName = normalizeWhitespace(required(zone, "Nom", rowNumber));
      return [`${worldName}\u0000${zoneName}`, zone] as const;
    })
  );

  if (uniqueIds.size !== EXPECTED_CARD_COUNT) {
    throw new Error("Le catalogue contient des ID de carte dupliqués.");
  }
  if (uniqueDeckNames.size !== EXPECTED_DECK_COUNT) {
    throw new Error(`${uniqueDeckNames.size} decks trouvés, ${EXPECTED_DECK_COUNT} attendus.`);
  }
  if (uniqueDeckCardNames.size !== EXPECTED_CARD_COUNT) {
    throw new Error("Le catalogue contient des noms de carte dupliqués dans un même deck.");
  }
  if (worldNames.length !== EXPECTED_WORLD_COUNT) {
    throw new Error(`${worldNames.length} mondes trouvés, ${EXPECTED_WORLD_COUNT} attendus.`);
  }
  if (zoneNames.length !== EXPECTED_ZONE_COUNT) {
    throw new Error(`${zoneNames.length} zones trouvées, ${EXPECTED_ZONE_COUNT} attendues.`);
  }
  if (sourceZones.size !== EXPECTED_ZONE_COUNT) {
    throw new Error("Le catalogue de zones contient des couples monde/zone dupliqués.");
  }

  const prisma = new PrismaClient();

  try {
    const removedCards = await removeStaleCards(prisma, canonicalIds, replaceCards);

    for (const [name, rule] of Object.entries(rarityRules)) {
      await prisma.rarity.upsert({
        where: { name },
        update: rule,
        create: { name, ...rule }
      });
    }

    for (const name of deckNames) {
      await prisma.deck.upsert({
        where: { name },
        update: {
          contentKey: `vault:deck:${name}`,
          status: "PUBLISHED",
          isActive: true,
          retiredAt: null
        },
        create: {
          name,
          contentKey: `vault:deck:${name}`,
          status: "PUBLISHED",
          isActive: true
        }
      });
    }

    const dangerByWorld = [
      "CALM",
      "CALM",
      "UNSTABLE",
      "UNSTABLE",
      "DANGEROUS",
      "DANGEROUS",
      "CRITICAL",
      "CRITICAL",
      "EXTREME"
    ] as const;
    const zonesByWorld = new Map<string, string[]>();
    for (const card of cards) {
      const zones = zonesByWorld.get(card.worldName) ?? [];
      if (!zones.includes(card.primaryZoneName)) {
        zones.push(card.primaryZoneName);
      }
      zonesByWorld.set(card.worldName, zones);
    }

    for (const worldName of worldNames) {
      const position = worldPosition(worldName);
      const zones = zonesByWorld.get(worldName) ?? [];
      if (zones.length !== 9) {
        throw new Error(`Le monde "${worldName}" contient ${zones.length} zones au lieu de 9.`);
      }

      const world = await prisma.worldDefinition.upsert({
        where: { contentKey: `vault:world:${position}` },
        update: {
          name: worldName,
          position,
          minLevel: Math.max(1, 1 + (position - 1) * 10),
          status: "PUBLISHED",
          metadata: { source: "vault", zoneCount: zones.length }
        },
        create: {
          contentKey: `vault:world:${position}`,
          name: worldName,
          position,
          minLevel: Math.max(1, 1 + (position - 1) * 10),
          status: "PUBLISHED",
          metadata: { source: "vault", zoneCount: zones.length }
        }
      });

      for (const [zoneIndex, zoneName] of zones.entries()) {
        const zonePosition = zoneIndex + 1;
        const sourceZone = sourceZones.get(`${worldName}\u0000${zoneName}`);
        if (!sourceZone) {
          throw new Error(`Zone "${zoneName}" absente du catalogue BDD - Zones.csv.`);
        }
        const sourceAccess = required(sourceZone, "Type", zonePosition + 1);
        if (sourceAccess !== "Gratuite" && sourceAccess !== "Premium") {
          throw new Error(`Type de zone inconnu pour "${zoneName}" : ${sourceAccess}.`);
        }
        const creditCost = Math.max(
          0,
          Math.floor(parseNumber(sourceZone["Coût crédits"] ?? "", 0))
        );
        if (sourceAccess === "Premium" && creditCost < 1) {
          throw new Error(`La zone premium "${zoneName}" n'a aucun coût en crédits.`);
        }
        const zoneMetadata = {
          source: "vault",
          creditCost,
          sourceDifficulty: Math.max(
            1,
            Math.floor(parseNumber(sourceZone["Difficulté"] ?? "", position))
          ),
          bossPossible: parseBoolean(sourceZone["Boss possible"] ?? ""),
          designStatus: sourceZone.Satut || null
        };
        await prisma.zoneDefinition.upsert({
          where: { contentKey: `vault:world:${position}:zone:${zonePosition}` },
          update: {
            worldId: world.id,
            name: zoneName,
            position: zonePosition,
            access: sourceAccess === "Premium" ? "PREMIUM" : "FREE",
            danger: dangerByWorld[position - 1] ?? "EXTREME",
            status: "PUBLISHED",
            metadata: zoneMetadata
          },
          create: {
            contentKey: `vault:world:${position}:zone:${zonePosition}`,
            worldId: world.id,
            name: zoneName,
            position: zonePosition,
            access: sourceAccess === "Premium" ? "PREMIUM" : "FREE",
            danger: dangerByWorld[position - 1] ?? "EXTREME",
            status: "PUBLISHED",
            metadata: zoneMetadata
          }
        });
      }
    }

    const [decks, rarities] = await Promise.all([
      prisma.deck.findMany({ where: { name: { in: deckNames } } }),
      prisma.rarity.findMany({ where: { name: { in: Object.keys(rarityRules) } } })
    ]);
    const deckIds = new Map(decks.map((deck) => [deck.name, deck.id]));
    const rarityIds = new Map(rarities.map((rarity) => [rarity.name, rarity.id]));
    const zones = await prisma.zoneDefinition.findMany({
      where: { contentKey: { startsWith: "vault:world:" } }
    });
    const zoneIds = new Map(zones.map((zone) => [zone.name, zone.id]));

    const zoneDeckWeights = new Map<string, number>();
    for (const card of cards) {
      for (const zoneName of card.compatibleZoneNames) {
        const zoneId = zoneIds.get(zoneName);
        const deckId = deckIds.get(card.deckName);
        if (!zoneId || !deckId) {
          throw new Error(`Association zone/deck absente pour ${card.contentKey}.`);
        }
        const key = `${zoneId}\u0000${deckId}`;
        zoneDeckWeights.set(key, (zoneDeckWeights.get(key) ?? 0) + 1);
      }
    }

    for (const [key, weight] of zoneDeckWeights) {
      const [zoneId, deckId] = key.split("\u0000");
      await prisma.zoneDeck.upsert({
        where: { zoneId_deckId: { zoneId: zoneId!, deckId: deckId! } },
        update: { weight },
        create: { zoneId: zoneId!, deckId: deckId!, weight }
      });
    }

    for (let offset = 0; offset < cards.length; offset += BATCH_SIZE) {
      const batch = cards.slice(offset, offset + BATCH_SIZE);
      await Promise.all(
        batch.map((card) => {
          const deckId = deckIds.get(card.deckName);
          const rarityId = rarityIds.get(card.rarityName);
          if (!deckId || !rarityId) {
            throw new Error(`Référence absente pour ${card.contentKey}.`);
          }

          const data = {
            name: card.name,
            deckId,
            rarityId,
            imageUrl: card.imageUrl,
            description: card.description,
            metadata: card.metadata,
            acceptedNames: card.acceptedNames,
            rarityFactors: card.rarityFactors,
            xpReward: card.xpReward,
            dropRate: card.dropRate,
            source: card.source,
            sourceId: card.sourceId,
            contentKey: card.contentKey,
            category: card.category,
            variant: "normal",
            status: card.status,
            isActive: card.isActive,
            retiredAt: null,
            licenseStatus: card.licenseStatus,
            licenseProofUrl: card.licenseProofUrl
          };

          return prisma.card.upsert({
            where: { contentKey: card.contentKey },
            update: data,
            create: data
          });
        })
      );
    }

    for (const [index, item] of itemRows.entries()) {
      const rowNumber = index + 2;
      const contentKey = required(item, "Clé", rowNumber);
      const name = required(item, "Nom", rowNumber);
      const category = required(item, "Catégorie", rowNumber);
      const imagePath = required(item, "Image", rowNumber);
      const absoluteImage = path.resolve(vaultRoot, imagePath.replaceAll("/", path.sep));
      if (!fs.existsSync(absoluteImage)) {
        throw new Error(`Image d'objet introuvable pour ${contentKey} : ${imagePath}`);
      }
      const imageUrl = `${publicMediaBaseUrl}/vault/items/${encodeURIComponent(contentKey)}.png`;
      const stackable = (item.Empilable ?? "").trim().toLocaleLowerCase("fr-FR") === "oui";
      const effectKey = itemEffects[contentKey] ?? null;
      const metadata = {
        source: "vault",
        category,
        rarity: item["Rareté"] || null,
        creditPrice: Math.max(0, Math.floor(parseNumber(item["Prix crédits"] ?? "", 0))),
        priceStatus: item["Prix statut"] || null,
        acquisitionSource: item.Source || null,
        consumable: (item.Consommable ?? "").trim().toLocaleLowerCase("fr-FR") === "oui",
        stackable,
        tradable: (item["Échangeable"] ?? "").trim().toLocaleLowerCase("fr-FR") === "oui",
        imageUrl,
        imageKey: `vault/items/${contentKey}.png`
      };
      await prisma.itemDefinition.upsert({
        where: { contentKey },
        update: {
          name,
          type: itemType(category),
          effectKey,
          effectParams: effectKey ? { source: "vault" } : Prisma.JsonNull,
          maxStack: stackable ? 99 : 1,
          status: "PUBLISHED",
          metadata
        },
        create: {
          contentKey,
          name,
          type: itemType(category),
          effectKey,
          effectParams: effectKey ? { source: "vault" } : Prisma.JsonNull,
          maxStack: stackable ? 99 : 1,
          status: "PUBLISHED",
          metadata
        }
      });
    }

    const skillKeys = skillRows.map((skill, index) => required(skill, "Cle", index + 2));
    if (new Set(skillKeys).size !== EXPECTED_SKILL_COUNT) {
      throw new Error("Le catalogue de compétences contient des clés dupliquées.");
    }
    const skillBranchCounts = new Map<string, number>();
    const skillKindCounts = new Map<string, number>();
    for (const skill of skillRows) {
      skillBranchCounts.set(skill.Branche, (skillBranchCounts.get(skill.Branche) ?? 0) + 1);
      skillKindCounts.set(
        skill["Type technique"],
        (skillKindCounts.get(skill["Type technique"]) ?? 0) + 1
      );
    }
    for (const branch of ["Explorer", "Hunter", "Collector"]) {
      if (skillBranchCounts.get(branch) !== 15) {
        throw new Error(
          `L'arbre ${branch} contient ${skillBranchCounts.get(branch) ?? 0} nœuds au lieu de 15.`
        );
      }
    }
    const expectedSkillKinds = new Map([
      ["COMMON", 9],
      ["SPECIALIZATION_GATE", 9],
      ["SPECIALIZATION_UPGRADE", 27]
    ]);
    for (const [kind, expected] of expectedSkillKinds) {
      if (skillKindCounts.get(kind) !== expected) {
        throw new Error(
          `Le catalogue contient ${skillKindCounts.get(kind) ?? 0} nœuds ${kind} au lieu de ${expected}.`
        );
      }
    }

    for (const [index, skill] of skillRows.entries()) {
      const rowNumber = index + 2;
      const contentKey = required(skill, "Cle", rowNumber);
      const name = required(skill, "Nom", rowNumber);
      const branch = skillBranch(required(skill, "Branche", rowNumber));
      const kind = skillNodeKind(required(skill, "Type technique", rowNumber));
      const description = required(skill, "Effet", rowNumber);
      const effectKey = required(skill, "EffectKey", rowNumber);
      const tier = Math.max(0, Math.floor(parseNumber(skill.Rang ?? "", 0)));
      const sortOrder = Math.max(0, Math.floor(parseNumber(skill.Ordre ?? "", 0)));
      const cost = Math.max(1, Math.floor(parseNumber(skill.Cout ?? "", 1)));
      const prerequisites = splitValues(skill.Prerequis);
      const grantedItemName = skill["Objet accorde"]?.trim() || null;
      const grantsItemKey = grantedSkillItemKey(grantedItemName ?? undefined);
      const specialization = skill.Specialisation?.trim() || null;
      const data = {
        name,
        description,
        branch,
        specialization,
        kind,
        tier,
        sortOrder,
        cost,
        maxRank: 1,
        prerequisites,
        effectKey,
        effectParams: {
          source: "vault",
          effect: description,
          limit: skill.Limite?.trim() || null,
          effectCategory: skill["Categorie effet"]?.trim() || null,
          grantedItemName,
          grantsItemKey
        },
        grantsItemKey,
        metadata: {
          source: "vault",
          sourceType: skill.Type?.trim() || null,
          designStatus: skill.Statut?.trim() || null,
          active: yes(skill.Actif),
          version: Math.max(1, Math.floor(parseNumber(skill.Version ?? "", 1)))
        },
        status: yes(skill.Actif) ? "PUBLISHED" as const : "RETIRED" as const
      };
      await prisma.skillDefinition.upsert({
        where: { contentKey },
        update: data,
        create: { contentKey, ...data }
      });
    }
    await prisma.skillDefinition.updateMany({
      where: { contentKey: { notIn: skillKeys } },
      data: { status: "RETIRED" }
    });

    if (new Set(questRows.map((row) => row.ID)).size !== EXPECTED_QUEST_COUNT) {
      throw new Error("Le catalogue de quêtes contient des identifiants dupliqués.");
    }
    for (const [index, quest] of questRows.entries()) {
      const rowNumber = index + 2;
      const contentKey = required(quest, "ID", rowNumber);
      const name = required(quest, "Nom", rowNumber);
      const eventType = required(quest, "EventType", rowNumber);
      const objectiveKey = required(quest, "ObjectiveType", rowNumber);
      const targetStrategy = required(quest, "Stratégie cible", rowNumber);
      const difficulties = splitValues(quest["Difficultés"]);
      const target = questTarget(quest);
      const metadata = {
        source: "vault",
        version: Math.max(1, Math.floor(parseNumber(quest.Version ?? "", 1))),
        category: quest["Catégorie"] || null,
        categoryKey: quest.CategoryKey || null,
        objectiveVariant: quest.ObjectiveVariant || null,
        variables: splitValues(quest.Variables),
        requiredFeature: quest["Fonctionnalité requise"] || null,
        weight: Math.max(0, Math.floor(parseNumber(quest.Poids ?? "", 0))),
        conditional: yes(quest.Conditionnelle),
        chanceDependent: yes(quest["Dépend du hasard"]),
        requiresZone: yes(quest["Requiert zone"]),
        requiresMultipleZones: yes(quest["Requiert plusieurs zones"]),
        requiresWorld: yes(quest["Requiert monde"]),
        requiresMultipleWorlds: yes(quest["Requiert plusieurs mondes"]),
        targetStrategy,
        similarityGroup: quest["Groupe similarité"] || null,
        difficulties,
        designStatus: quest.Statut || null,
        targetConfigurationRequired: [
          "XP_TARGET_BY_TIER_AND_DIFFICULTY",
          "CREDIT_TARGET_BY_TIER_AND_DIFFICULTY"
        ].includes(targetStrategy)
      };
      const data = {
        name,
        eventType,
        objectiveKey,
        target,
        minLevel: 1,
        maxLevel: null,
        reward: {
          EASY: { xp: 75, credits: 50 },
          NORMAL: { xp: 125, credits: 100 },
          HARD: { xp: 200, credits: 150 },
          tierMultiplier: "1 + (tier - 1) * 0.15"
        },
        metadata,
        status: yes(quest.Actif) ? "PUBLISHED" as const : "RETIRED" as const
      };
      await prisma.questDefinition.upsert({
        where: { contentKey },
        update: data,
        create: { contentKey, ...data }
      });
    }

    if (new Set(achievementRows.map((row) => row.ID)).size !== EXPECTED_ACHIEVEMENT_COUNT) {
      throw new Error("Le catalogue de succès contient des identifiants dupliqués.");
    }
    for (const [index, achievement] of achievementRows.entries()) {
      const rowNumber = index + 2;
      const contentKey = required(achievement, "ID", rowNumber);
      const name = required(achievement, "Titre", rowNumber);
      const eventType = required(achievement, "EventType", rowNumber);
      const objectiveKey = required(achievement, "ObjectiveType", rowNumber);
      const target = Math.max(1, Math.floor(parseNumber(
        required(achievement, "Cible", rowNumber),
        1
      )));
      const points = Math.max(0, Math.floor(parseNumber(achievement.Points ?? "", 0)));
      const data = {
        name,
        eventType,
        objectiveKey,
        target,
        reward: {
          points,
          label: achievement["Récompense"] || null
        },
        metadata: {
          source: "vault",
          version: Math.max(1, Math.floor(parseNumber(achievement.Version ?? "", 1))),
          scope: achievement["Portée"] || null,
          generatorTemplate: yes(achievement["Template générateur"]),
          familyId: achievement.FamilyID || null,
          family: achievement["Famille"] || null,
          tier: Math.max(0, Math.floor(parseNumber(achievement["Palier"] ?? "", 0))),
          tierLabel: achievement["Palier visuel"] || null,
          category: achievement["Catégorie"] || null,
          description: achievement.Description || null,
          readableObjective: achievement["Objectif lisible"] || null,
          requiredFeature: achievement["Fonctionnalité requise"] || null,
          parameters: achievement["Paramètres"] || null,
          points,
          coreCompletion: yes(achievement.CoreCompletion),
          designStatus: achievement.Statut || null
        },
        hidden: yes(achievement["Caché"]),
        status: yes(achievement.Actif) ? "PUBLISHED" as const : "RETIRED" as const
      };
      await prisma.achievementDefinition.upsert({
        where: { contentKey },
        update: data,
        create: { contentKey, ...data }
      });
    }

    if (new Set(bossRows.map((row) => row["Clé"])).size !== EXPECTED_BOSS_COUNT) {
      throw new Error("Le catalogue de boss contient des clés dupliquées.");
    }
    const guardianTargets = [250, 450, 700, 1000, 1350, 1750, 2200, 2700];
    for (const [index, boss] of bossRows.entries()) {
      const rowNumber = index + 2;
      const contentKey = required(boss, "Clé", rowNumber);
      const name = required(boss, "Nom", rowNumber);
      const familyKey = required(boss, "FamilyKey", rowNumber);
      const position = worldNumber(required(boss, "MondeId", rowNumber));
      const world = await prisma.worldDefinition.findUnique({
        where: { contentKey: `vault:world:${position}` }
      });
      if (!world) {
        throw new Error(`Monde ${position} introuvable pour le boss ${contentKey}.`);
      }
      const kind = familyKey === "PROGRESSION_GATE" ? "GUARDIAN" as const : "REGULAR" as const;
      const imagePath = required(boss, "Image", rowNumber);
      if (!fs.existsSync(path.resolve(vaultRoot, imagePath.replaceAll("/", path.sep)))) {
        throw new Error(`Image de boss introuvable pour ${contentKey} : ${imagePath}`);
      }
      const imageKey = `vault/bosses/${contentKey}.png`;
      const baseTarget = kind === "GUARDIAN"
        ? guardianTargets[Math.max(0, Math.min(guardianTargets.length - 1, position - 1))]!
        : 1;
      const data = {
        worldId: world.id,
        name,
        kind,
        baseTarget,
        durationHours: 24,
        reward: {
          raw: splitValues(boss["Récompenses"]),
          unlockWorldId: boss["DébloqueMondeId"] || null
        },
        metadata: {
          source: "vault",
          family: boss["Famille"] || null,
          familyKey,
          sourceWorldId: boss.MondeId,
          sourceWorldName: boss.Monde || null,
          unlockWorldId: boss["DébloqueMondeId"] || null,
          unlockWorldName: boss["DébloqueMonde"] || null,
          displayOrder: Math.max(0, Math.floor(parseNumber(boss.Ordre ?? "", 0))),
          primaryMechanics: splitValues(boss["Mécanique principale"]),
          allowedMechanics: splitValues(boss["Mécaniques autorisées"]),
          categories: splitValues(boss["Catégories"]),
          objective: boss.Objectif || null,
          appearanceText: boss["Texte apparition"] || null,
          victoryText: boss["Texte victoire"] || null,
          imageUrl: `${publicMediaBaseUrl}/${imageKey}`,
          imageKey,
          designStatus: boss.Statut || null,
          targetConfigurationRequired: kind === "REGULAR"
        },
        status: yes(boss.Actif) ? "PUBLISHED" as const : "RETIRED" as const
      };
      await prisma.bossDefinition.upsert({
        where: { contentKey },
        update: data,
        create: { contentKey, ...data }
      });
    }

    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" }
    });

    await prisma.adminLog.create({
      data: {
        action: "VAULT_CATALOG_IMPORTED",
        target: "cards.csv",
        metadata: {
          importedCards: cards.length,
          removedCards,
          decks: deckNames.length,
          skills: skillRows.length,
          localImages: cards.filter((card) => card.imageUrl).length
        }
      }
    });

    const [
      totalCards,
      vaultCards,
      activeCards,
      imageCards,
      itemCount,
      questCount,
      achievementCount,
      bossCount,
      skillCount,
      worldCount,
      zoneCount,
      zoneDeckCount,
      rarityCounts
    ] = await Promise.all([
      prisma.card.count(),
      prisma.card.count({ where: { source: "vault" } }),
      prisma.card.count({ where: { source: "vault", isActive: true, status: "PUBLISHED" } }),
      prisma.card.count({ where: { source: "vault", imageUrl: { not: null } } }),
      prisma.itemDefinition.count({
        where: {
          status: "PUBLISHED",
          metadata: { path: ["source"], equals: "vault" }
        }
      }),
      prisma.questDefinition.count({
        where: {
          status: "PUBLISHED",
          metadata: { path: ["source"], equals: "vault" }
        }
      }),
      prisma.achievementDefinition.count({
        where: {
          status: "PUBLISHED",
          metadata: { path: ["source"], equals: "vault" }
        }
      }),
      prisma.bossDefinition.count({
        where: {
          status: "PUBLISHED",
          metadata: { path: ["source"], equals: "vault" }
        }
      }),
      prisma.skillDefinition.count({
        where: {
          status: "PUBLISHED",
          metadata: { path: ["source"], equals: "vault" }
        }
      }),
      prisma.worldDefinition.count({ where: { contentKey: { startsWith: "vault:world:" } } }),
      prisma.zoneDefinition.count({ where: { contentKey: { startsWith: "vault:world:" } } }),
      prisma.zoneDeck.count({ where: { zone: { contentKey: { startsWith: "vault:world:" } } } }),
      prisma.rarity.findMany({
        where: { name: { in: Object.keys(rarityRules) } },
        select: { name: true, _count: { select: { cards: { where: { source: "vault" } } } } },
        orderBy: { weight: "desc" }
      })
    ]);

    if (totalCards !== EXPECTED_CARD_COUNT || vaultCards !== EXPECTED_CARD_COUNT) {
      throw new Error(
        `Import incomplet : ${totalCards} cartes totales, dont ${vaultCards} cartes Vault.`
      );
    }
    if (worldCount !== EXPECTED_WORLD_COUNT || zoneCount !== EXPECTED_ZONE_COUNT) {
      throw new Error(`Import incomplet : ${worldCount} mondes et ${zoneCount} zones.`);
    }
    if (itemCount !== EXPECTED_ITEM_COUNT) {
      throw new Error(`Import incomplet : ${itemCount} objets publiés.`);
    }
    if (skillCount !== EXPECTED_SKILL_COUNT) {
      throw new Error(`Import incomplet : ${skillCount} compétences publiées.`);
    }
    if (
      questCount !== EXPECTED_QUEST_COUNT ||
      achievementCount !== EXPECTED_ACHIEVEMENT_COUNT ||
      bossCount !== EXPECTED_BOSS_COUNT
    ) {
      throw new Error(
        `Import incomplet : ${questCount} quêtes, ${achievementCount} succès et ${bossCount} boss.`
      );
    }

    const result = {
      cards: vaultCards,
      activeCards,
      decks: deckNames.length,
      worlds: worldCount,
      zones: zoneCount,
      zoneDecks: zoneDeckCount,
      localImages: imageCards,
      items: itemCount,
      quests: questCount,
      achievements: achievementCount,
      bosses: bossCount,
      skills: skillCount,
      removedCards,
      rarities: Object.fromEntries(rarityCounts.map((rarity) => [rarity.name, rarity._count.cards]))
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

function worldPosition(worldName: string): number {
  const match = /^Monde\s+(\d+)\b/i.exec(worldName);
  const position = Number(match?.[1]);
  if (!Number.isSafeInteger(position) || position < 1 || position > EXPECTED_WORLD_COUNT) {
    throw new Error(`Position de monde invalide pour "${worldName}".`);
  }
  return position;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  importVaultCatalog().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
