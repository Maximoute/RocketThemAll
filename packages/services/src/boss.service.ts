import {
  type BossCategory,
  type BossDefinition,
  type BossMechanic,
  Prisma,
  prisma
} from "@rta/database";
import { createHash } from "node:crypto";
import { applyXpGain } from "./xp.service.js";
import { AppError } from "./errors.js";
import {
  CONQUEROR_REWARD_TIERS,
  type ConquerorRewardTier
} from "./conqueror-reward.service.js";

const OPEN_BOSS_STATUSES = ["SCHEDULED", "ACTIVE"] as const;
const ACTIVE_MEMBER_WINDOW_MS = 7 * 24 * 60 * 60_000;
const DEFAULT_GUARDIAN_DURATION_HOURS = 24;
const PERSISTENT_BOSS_ENDS_AT = new Date("9999-12-31T23:59:59.999Z");
export const BOSS_FRAGMENT_POINT_VALUE = 100;
export const BOSS_DUPLICATE_CARD_POINT_VALUE = 100;
export const FUNERAL_CANDLE_REQUIREMENT = 5;
export const REGULAR_BOSS_TIER_WEIGHTS: Record<ConquerorRewardTier, number> = {
  common: 30,
  uncommon: 25,
  rare: 20,
  very_rare: 13,
  import: 8,
  exotic: 4
};
export const BOSS_TIER_BALANCE: Record<
  ConquerorRewardTier,
  {
    difficultyMultiplier: number;
    credits: number;
    xp: number;
    fragments: number;
    funeralCandles: number;
    silverTears: number;
    brokenMasks: number;
    voidFlowers: number;
  }
> = {
  common: {
    difficultyMultiplier: 0.75,
    credits: 125,
    xp: 80,
    fragments: 1,
    funeralCandles: 1,
    silverTears: 0,
    brokenMasks: 0,
    voidFlowers: 1
  },
  uncommon: {
    difficultyMultiplier: 0.9,
    credits: 180,
    xp: 120,
    fragments: 2,
    funeralCandles: 2,
    silverTears: 0,
    brokenMasks: 0,
    voidFlowers: 1
  },
  rare: {
    difficultyMultiplier: 1.1,
    credits: 260,
    xp: 180,
    fragments: 3,
    funeralCandles: 3,
    silverTears: 0,
    brokenMasks: 0,
    voidFlowers: 2
  },
  very_rare: {
    difficultyMultiplier: 1.35,
    credits: 380,
    xp: 260,
    fragments: 5,
    funeralCandles: 5,
    silverTears: 1,
    brokenMasks: 0,
    voidFlowers: 2
  },
  import: {
    difficultyMultiplier: 1.65,
    credits: 550,
    xp: 380,
    fragments: 8,
    funeralCandles: 7,
    silverTears: 1,
    brokenMasks: 1,
    voidFlowers: 3
  },
  exotic: {
    difficultyMultiplier: 2,
    credits: 800,
    xp: 550,
    fragments: 12,
    funeralCandles: 10,
    silverTears: 2,
    brokenMasks: 1,
    voidFlowers: 3
  }
};
const SUPPORTED_MECHANICS = new Set<BossMechanic>([
  "OFFERING",
  "HARMONIZATION",
  "HUNT",
  "EXPEDITION_MINION",
  "COLLECTIVE_COLLECTION"
]);
const REGULAR_BOSS_CATEGORIES = new Set<BossCategory>([
  "TREASURE_GUARDIAN",
  "CARD_PREDATOR",
  "WORLD_INVADER"
]);

type JsonRecord = Record<string, unknown>;

function record(value: Prisma.JsonValue | null | undefined): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function positiveInteger(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

type OfferingObjectiveState = {
  credits: { target: number; contributed: number; pointValue: 1 };
  fragments: { target: number; contributed: number; pointValue: number };
  duplicateCards: {
    target: number;
    contributed: number;
    pointValue: number;
    worldId: string;
    worldLabel: string;
  };
};

type SpecialOfferingState = {
  funeralCandle?: { required: number; deposited: number; protectionDisabled: boolean };
  silverTear?: { required: number; deposited: number; phaseRevealed: boolean };
  brokenMask?: {
    required: number;
    deposited: number;
    sourceType: "WORLD";
    sourceKey: string;
    sourceLabel: string;
    sourceMultiplier: 1;
    baseDropRate: 0.005;
  };
  voidFlower: { maximum: number; deposited: number };
};

export function bossOfferingObjectives(
  requestedTarget: number,
  worldId: string,
  worldLabel: string
): OfferingObjectiveState & { totalPoints: number } {
  const safeTarget = Math.max(300, Math.floor(requestedTarget));
  const creditTarget = Math.max(100, Math.floor(safeTarget * 0.5 / 100) * 100);
  const fragmentTarget = Math.max(
    1,
    Math.ceil(safeTarget * 0.25 / BOSS_FRAGMENT_POINT_VALUE)
  );
  const remaining = Math.max(
    BOSS_DUPLICATE_CARD_POINT_VALUE,
    safeTarget - creditTarget - fragmentTarget * BOSS_FRAGMENT_POINT_VALUE
  );
  const duplicateCardTarget = Math.max(
    1,
    Math.ceil(remaining / BOSS_DUPLICATE_CARD_POINT_VALUE)
  );
  const totalPoints =
    creditTarget +
    fragmentTarget * BOSS_FRAGMENT_POINT_VALUE +
    duplicateCardTarget * BOSS_DUPLICATE_CARD_POINT_VALUE;
  return {
    credits: { target: creditTarget, contributed: 0, pointValue: 1 },
    fragments: {
      target: fragmentTarget,
      contributed: 0,
      pointValue: BOSS_FRAGMENT_POINT_VALUE
    },
    duplicateCards: {
      target: duplicateCardTarget,
      contributed: 0,
      pointValue: BOSS_DUPLICATE_CARD_POINT_VALUE,
      worldId,
      worldLabel
    },
    totalPoints
  };
}

export function bossSpecialOfferingRequirements(input: {
  tier: ConquerorRewardTier;
  mechanic: BossMechanic;
  worldId: string;
  worldLabel: string;
  persistent?: boolean;
}): SpecialOfferingState {
  const balance = BOSS_TIER_BALANCE[input.tier];
  const offeringMechanic = input.mechanic === "OFFERING";
  return {
    ...(offeringMechanic && balance.funeralCandles > 0
      ? {
          funeralCandle: {
            required: balance.funeralCandles,
            deposited: 0,
            protectionDisabled: false
          }
        }
      : {}),
    ...(offeringMechanic && balance.silverTears > 0
      ? {
          silverTear: {
            required: balance.silverTears,
            deposited: 0,
            phaseRevealed: false
          }
        }
      : {}),
    ...(offeringMechanic && balance.brokenMasks > 0
      ? {
          brokenMask: {
            required: balance.brokenMasks,
            deposited: 0,
            sourceType: "WORLD" as const,
            sourceKey: input.worldId,
            sourceLabel: input.worldLabel,
            sourceMultiplier: 1 as const,
            baseDropRate: 0.005 as const
          }
        }
      : {}),
    voidFlower: {
      maximum: input.persistent ? 0 : balance.voidFlowers,
      deposited: 0
    }
  };
}

function offeringObjectivesFromSnapshot(snapshot: JsonRecord) {
  const objectives = record(snapshot.offeringObjectives as Prisma.JsonValue);
  const credits = record(objectives.credits as Prisma.JsonValue);
  const fragments = record(objectives.fragments as Prisma.JsonValue);
  const duplicateCards = record(objectives.duplicateCards as Prisma.JsonValue);
  if (
    !positiveInteger(credits.target, 0) ||
    !positiveInteger(fragments.target, 0) ||
    !positiveInteger(duplicateCards.target, 0)
  ) {
    return null;
  }
  return {
    credits: {
      target: positiveInteger(credits.target, 0),
      contributed: Math.max(0, Math.floor(Number(credits.contributed ?? 0))),
      pointValue: 1 as const
    },
    fragments: {
      target: positiveInteger(fragments.target, 0),
      contributed: Math.max(0, Math.floor(Number(fragments.contributed ?? 0))),
      pointValue: positiveInteger(
        fragments.pointValue,
        BOSS_FRAGMENT_POINT_VALUE
      )
    },
    duplicateCards: {
      target: positiveInteger(duplicateCards.target, 0),
      contributed: Math.max(
        0,
        Math.floor(Number(duplicateCards.contributed ?? 0))
      ),
      pointValue: positiveInteger(
        duplicateCards.pointValue,
        BOSS_DUPLICATE_CARD_POINT_VALUE
      ),
      worldId: String(duplicateCards.worldId ?? ""),
      worldLabel: String(duplicateCards.worldLabel ?? "ce monde")
    }
  };
}

function specialOfferingsFromSnapshot(snapshot: JsonRecord) {
  return record(snapshot.specialOfferings as Prisma.JsonValue);
}

function specialOfferingRequirementsComplete(snapshot: JsonRecord) {
  const specials = specialOfferingsFromSnapshot(snapshot);
  return ["funeralCandle", "silverTear", "brokenMask"].every((key) => {
    const requirement = record(specials[key] as Prisma.JsonValue);
    const required = Math.max(0, Math.floor(Number(requirement.required ?? 0)));
    const deposited = Math.max(0, Math.floor(Number(requirement.deposited ?? 0)));
    return required === 0 || deposited >= required;
  });
}

export const CONQUEROR_BOSS_DROP_RATES: Record<
  ConquerorRewardTier,
  { booster: number; chest: number }
> = {
  common: { booster: 0.01, chest: 0.03 },
  uncommon: { booster: 0.02, chest: 0.05 },
  rare: { booster: 0.04, chest: 0.08 },
  very_rare: { booster: 0.06, chest: 0.12 },
  import: { booster: 0.08, chest: 0.16 },
  exotic: { booster: 0.1, chest: 0.2 }
};

export function conquerorRewardTierForWorld(worldPosition: number) {
  const index = Math.max(
    0,
    Math.min(CONQUEROR_REWARD_TIERS.length - 1, Math.floor(worldPosition) - 1)
  );
  return CONQUEROR_REWARD_TIERS[index]!;
}

export function isConquerorRewardTier(
  value: unknown
): value is ConquerorRewardTier {
  return typeof value === "string" &&
    CONQUEROR_REWARD_TIERS.includes(value as ConquerorRewardTier);
}

export function deterministicRegularBossTier(seed: string): ConquerorRewardTier {
  const roll = createHash("sha256").update(`boss-tier:${seed}`).digest().readUInt32BE(0)
    / 0x1_0000_0000 * 100;
  let cumulative = 0;
  for (const tier of CONQUEROR_REWARD_TIERS) {
    cumulative += REGULAR_BOSS_TIER_WEIGHTS[tier];
    if (roll < cumulative) return tier;
  }
  return "exotic";
}

export function bossTierForAppearance(input: {
  kind: "REGULAR" | "GUARDIAN";
  worldPosition: number;
  seed: string;
}) {
  return input.kind === "GUARDIAN"
    ? conquerorRewardTierForWorld(input.worldPosition)
    : deterministicRegularBossTier(input.seed);
}

export function deterministicBossRewardRoll(
  bossRunId: string,
  userId: string,
  rewardType: "booster" | "chest"
) {
  const digest = createHash("sha256")
    .update(`${bossRunId}:${userId}:${rewardType}`)
    .digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

export function deterministicBossCategory(
  metadata: Prisma.JsonValue | null,
  seed: string
): BossCategory {
  const categories = stringList(record(metadata).categories)
    .filter((value): value is BossCategory =>
      REGULAR_BOSS_CATEGORIES.has(value as BossCategory)
    );
  if (categories.length === 0) return "TREASURE_GUARDIAN";
  const value = createHash("sha256").update(seed).digest().readUInt32BE(0);
  return categories[value % categories.length]!;
}

async function bossProgressAmount(
  tx: Prisma.TransactionClient,
  run: { id: string },
  baseAmount: number
) {
  const banner = await tx.actionCooldown.findUnique({
    where: { scopeKey: `boss-banner:${run.id}` }
  });
  if (!banner || banner.expiresAt <= new Date()) {
    return { amount: baseAmount, bannerKey: null };
  }
  const prior = await tx.bossContribution.findMany({
    where: { bossRunId: run.id },
    select: { metadata: true }
  });
  const priorBannerBase = prior.reduce((sum, contribution) => {
    const metadata = record(contribution.metadata);
    return metadata.bannerKey === banner.scopeKey
      ? sum + positiveInteger(metadata.baseAmount, 0)
      : sum;
  }, 0);
  return {
    amount: rallyBannerProgressAmount(priorBannerBase, baseAmount),
    bannerKey: banner.scopeKey
  };
}

export function rallyBannerProgressAmount(
  priorBaseAmount: number,
  baseAmount: number
) {
  const safePrior = Math.max(0, Math.floor(priorBaseAmount));
  const safeBase = Math.max(0, Math.floor(baseAmount));
  return Math.floor((safePrior + safeBase) * 1.2) - Math.floor(safePrior * 1.2);
}

export function eligibleCaptureBossMechanics(
  bossMinion: boolean
): BossMechanic[] {
  return bossMinion
    ? ["HUNT", "EXPEDITION_MINION"]
    : ["HUNT"];
}

export function scaleBossTarget(baseTarget: number, activePlayers: number) {
  const coefficient = Math.max(
    0.75,
    Math.min(2.5, 0.75 + Math.sqrt(Math.max(0, activePlayers)) / 5)
  );
  return Math.max(1, Math.round(baseTarget * coefficient));
}

function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekdays[get("weekday")] ?? 0
  };
}

function localDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
) {
  const localEpoch = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(localEpoch);
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = zonedDateParts(candidate, timeZone);
    const representedLocalEpoch = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    candidate = new Date(candidate.getTime() + (localEpoch - representedLocalEpoch));
  }
  return candidate;
}

function validTimeZone(requestedTimeZone: string) {
  const candidate = requestedTimeZone || "Europe/Paris";
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "Europe/Paris";
  }
}

export function dailyBossWindow(now: Date, requestedTimeZone: string) {
  const timeZone = validTimeZone(requestedTimeZone);
  const localNow = zonedDateParts(now, timeZone);
  const startsAt = localDateToUtc(
    localNow.year,
    localNow.month,
    localNow.day,
    0,
    0,
    timeZone
  );
  return {
    dayKey:
      `${localNow.year}-${String(localNow.month).padStart(2, "0")}-` +
      String(localNow.day).padStart(2, "0"),
    startsAt,
    endsAt: nextDailyBossSlot(now, timeZone),
    timeZone
  };
}

export function nextDailyBossSlot(now: Date, requestedTimeZone: string) {
  const timeZone = validTimeZone(requestedTimeZone);
  const localNow = zonedDateParts(now, timeZone);
  const targetDate = new Date(Date.UTC(
    localNow.year,
    localNow.month - 1,
    localNow.day + 1
  ));
  return localDateToUtc(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    targetDate.getUTCDate(),
    0,
    0,
    timeZone
  );
}

export function nextWeeklyBossSlot(
  now: Date,
  weekday: number,
  localTime: string,
  requestedTimeZone: string
) {
  const safeWeekday = Number.isSafeInteger(weekday)
    ? Math.max(0, Math.min(6, weekday))
    : 0;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(localTime);
  const hour = match ? Number(match[1]) : 18;
  const minute = match ? Number(match[2]) : 0;
  const timeZone = validTimeZone(requestedTimeZone);

  const localNow = zonedDateParts(now, timeZone);
  let daysAhead = (safeWeekday - localNow.weekday + 7) % 7;
  const localMinutes = localNow.hour * 60 + localNow.minute;
  if (daysAhead === 0 && localMinutes >= hour * 60 + minute) {
    daysAhead = 7;
  }
  const targetDate = new Date(Date.UTC(
    localNow.year,
    localNow.month - 1,
    localNow.day + daysAhead
  ));
  return localDateToUtc(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    targetDate.getUTCDate(),
    hour,
    minute,
    timeZone
  );
}

export function preferredBossMechanic(metadata: Prisma.JsonValue | null): BossMechanic {
  const values = [
    ...stringList(record(metadata).primaryMechanics),
    ...stringList(record(metadata).allowedMechanics)
  ];
  return values.find((value): value is BossMechanic =>
    SUPPORTED_MECHANICS.has(value as BossMechanic)
  ) ?? "HUNT";
}

export function bossMechanicCandidates(
  metadata: Prisma.JsonValue | null
): BossMechanic[] {
  const values = [
    ...stringList(record(metadata).primaryMechanics),
    ...stringList(record(metadata).allowedMechanics)
  ].filter((value): value is BossMechanic =>
    SUPPORTED_MECHANICS.has(value as BossMechanic)
  );
  const unique = [...new Set(values)];
  return unique.length > 0 ? unique : ["HUNT"];
}

function deterministicIndex(seed: string, scope: string, length: number) {
  if (length <= 0) return 0;
  const value = createHash("sha256")
    .update(`${scope}:${seed}`)
    .digest()
    .readUInt32BE(0);
  return value % length;
}

export function selectDailyRegularBoss<
  T extends { contentKey: string; worldId: string | null; metadata: Prisma.JsonValue | null }
>(input: {
  definitions: T[];
  unlockedWorldIds: string[];
  seed: string;
}): { definition: T; mechanic: BossMechanic } | null {
  const unlocked = new Set(input.unlockedWorldIds);
  const definitionsByWorld = new Map<string, T[]>();
  for (const definition of [...input.definitions].sort((left, right) =>
    left.contentKey.localeCompare(right.contentKey)
  )) {
    if (!definition.worldId || !unlocked.has(definition.worldId)) continue;
    const definitions = definitionsByWorld.get(definition.worldId) ?? [];
    definitions.push(definition);
    definitionsByWorld.set(definition.worldId, definitions);
  }
  const worldIds = [...definitionsByWorld.keys()].sort();
  if (worldIds.length === 0) return null;
  const worldId = worldIds[
    deterministicIndex(input.seed, "daily-boss-world", worldIds.length)
  ]!;
  const definitions = definitionsByWorld.get(worldId)!;
  const definition = definitions[
    deterministicIndex(input.seed, `daily-boss-definition:${worldId}`, definitions.length)
  ]!;
  const mechanics = bossMechanicCandidates(definition.metadata);
  const mechanic = mechanics[
    deterministicIndex(
      input.seed,
      `daily-boss-mechanic:${definition.contentKey}`,
      mechanics.length
    )
  ]!;
  return { definition, mechanic };
}

export function bossObjectiveTarget(
  kind: "REGULAR" | "GUARDIAN",
  mechanic: BossMechanic,
  worldPosition: number,
  activePlayers: number,
  availableUniqueCards: number,
  tier: ConquerorRewardTier = kind === "GUARDIAN"
    ? conquerorRewardTierForWorld(worldPosition)
    : "common"
) {
  let baseTarget: number;
  if (mechanic === "OFFERING") {
    baseTarget = kind === "GUARDIAN"
      ? 1_000 + worldPosition * 750
      : 1_500;
  } else if (mechanic === "HUNT") {
    baseTarget = kind === "GUARDIAN"
      ? 25 + worldPosition * 15
      : 16;
  } else if (mechanic === "EXPEDITION_MINION") {
    baseTarget = kind === "GUARDIAN"
      ? 20 + worldPosition * 10
      : 11;
  } else {
    baseTarget = kind === "GUARDIAN"
      ? 30 + worldPosition * 10
      : 30;
  }
  const tierScaled = Math.max(
    1,
    Math.round(baseTarget * BOSS_TIER_BALANCE[tier].difficultyMultiplier)
  );
  const scaled = scaleBossTarget(tierScaled, activePlayers);
  return ["HARMONIZATION", "COLLECTIVE_COLLECTION"].includes(mechanic)
    ? Math.max(1, Math.min(availableUniqueCards, scaled))
    : scaled;
}

export function bossRewardForTier(
  kind: "REGULAR" | "GUARDIAN",
  category: BossCategory,
  conquerorTier: ConquerorRewardTier
) {
  const balance = BOSS_TIER_BALANCE[conquerorTier];
  const guardianMultiplier = kind === "GUARDIAN" ? 1.25 : 1;
  return {
    credits: Math.round(balance.credits * guardianMultiplier),
    xp: Math.round(balance.xp * guardianMultiplier),
    fragments: Math.ceil(balance.fragments * guardianMultiplier),
    bonus: null,
    conquerorTier,
    conquerorDropRates: CONQUEROR_BOSS_DROP_RATES[conquerorTier],
    category
  };
}

function progressionScope(run: {
  id: string;
  progressionKey: string | null;
}) {
  return run.progressionKey ?? `run:${run.id}`;
}

function collectionCardWhere(definition: {
  kind: "REGULAR" | "GUARDIAN";
  worldId: string | null;
  world: { position: number } | null;
}): Prisma.CardWhereInput {
  const worldPosition = definition.world?.position ?? 0;
  return {
    status: "PUBLISHED",
    isActive: true,
    deck: {
      status: "PUBLISHED",
      isActive: true,
      zones: {
        some: {
          zone: {
            status: "PUBLISHED",
            ...(definition.kind === "GUARDIAN" && worldPosition >= 8
              ? { world: { position: { lte: worldPosition } } }
              : { worldId: definition.worldId ?? "__missing_world__" })
          }
        }
      }
    }
  };
}

async function findOfferingDuplicateCard(
  client: Prisma.TransactionClient | typeof prisma,
  input: {
    userId: string;
    definition: {
      kind: "REGULAR" | "GUARDIAN";
      worldId: string | null;
      world: { position: number } | null;
    };
  }
) {
  const inventory = await client.inventoryItem.findMany({
    where: {
      userId: input.userId,
      quantity: { gt: 0 },
      card: collectionCardWhere(input.definition)
    },
    include: {
      archive: { select: { id: true } },
      card: {
        select: {
          id: true,
          contentKey: true,
          name: true,
          rarity: { select: { name: true, weight: true } },
          deck: { select: { name: true } }
        }
      }
    }
  });
  const totals = new Map<string, number>();
  for (const row of inventory) {
    totals.set(row.cardId, (totals.get(row.cardId) ?? 0) + row.quantity);
  }
  return inventory
    .filter((row) => !row.archive && (totals.get(row.cardId) ?? 0) >= 2)
    .sort((left, right) =>
      left.card.rarity.weight - right.card.rarity.weight ||
      (left.variant === "normal" ? -1 : right.variant === "normal" ? 1 : 0) ||
      left.card.name.localeCompare(right.card.name, "fr")
    )[0] ?? null;
}

export function bossCollectionRequirementLabel(input: {
  kind: "REGULAR" | "GUARDIAN";
  worldPosition: number;
  worldName: string;
  target: number;
}) {
  const scope = input.kind === "GUARDIAN" && input.worldPosition >= 8
    ? `les mondes 1 à ${input.worldPosition}`
    : input.worldName;
  return `${input.target} cartes différentes parmi ${scope}`;
}

async function grantRewardsIfObjectivesComplete(
  tx: Prisma.TransactionClient,
  bossRunId: string
) {
  const run = await tx.bossRun.findUniqueOrThrow({
    where: { id: bossRunId },
    select: {
      progress: true,
      targetSnapshot: true,
      objectiveSnapshot: true
    }
  });
  if (run.progress < run.targetSnapshot) return false;
  if (!specialOfferingRequirementsComplete(record(run.objectiveSnapshot))) {
    return false;
  }
  await grantRewardsAndUnlock(tx, bossRunId);
  return true;
}

async function grantRewardsAndUnlock(
  tx: Prisma.TransactionClient,
  bossRunId: string
) {
  const run = await tx.bossRun.findUniqueOrThrow({
    where: { id: bossRunId },
    include: {
      definition: { include: { world: true } },
      contributions: {
        select: {
          userId: true,
          amount: true,
          destructive: true,
          type: true
        }
      },
      guild: { include: { progress: true } }
    }
  });
  if (run.status === "DEFEATED") return;

  const contributionThreshold = Math.max(1, Math.ceil(run.targetSnapshot * 0.01));
  const contributionByUser = new Map<
    string,
    { amount: number; majorAction: boolean }
  >();
  for (const contribution of run.contributions) {
    const current = contributionByUser.get(contribution.userId)
      ?? { amount: 0, majorAction: false };
    current.amount += contribution.amount;
    current.majorAction ||= contribution.destructive
      && contribution.type !== "CREDIT_DONATION";
    contributionByUser.set(contribution.userId, current);
  }
  const participantIds = [...contributionByUser.entries()]
    .filter(([, contribution]) =>
      contribution.amount >= contributionThreshold || contribution.majorAction
    )
    .map(([userId]) => userId);
  const reward = record(run.rewardSnapshot);
  const creditReward = positiveInteger(reward.credits, 0);
  const xpReward = positiveInteger(reward.xp, 0);
  const fragmentReward = positiveInteger(reward.fragments, 0);
  const bonus = typeof reward.bonus === "string" ? reward.bonus : null;
  const conquerorTier = isConquerorRewardTier(reward.conquerorTier)
    ? reward.conquerorTier
    : conquerorRewardTierForWorld(run.definition.world?.position ?? 1);
  const conquerorDropRates = CONQUEROR_BOSS_DROP_RATES[conquerorTier];

  for (const userId of participantIds) {
    const existing = await tx.bossRewardGrant.findUnique({
      where: { bossRunId_userId: { bossRunId: run.id, userId } }
    });
    if (existing) continue;

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const progress = await tx.userProgress.upsert({
      where: { userId },
      update: {},
      create: { userId, level: user.level, xp: user.xp }
    });
    const xpResult = applyXpGain(progress.level, progress.xp, xpReward);
    const granted: JsonRecord = {
      credits: creditReward,
      xp: xpReward,
      fragments: fragmentReward,
      bonus
    };

    await tx.user.update({
      where: { id: userId },
      data: {
        credits: { increment: creditReward },
        fragments: { increment: fragmentReward },
        level: xpResult.level,
        xp: xpResult.xp,
        balanceVersion: { increment: 1 }
      }
    });
    await tx.userProgress.update({
      where: { userId },
      data: {
        level: xpResult.level,
        xp: xpResult.xp,
        unspentSkillPoints: { increment: xpResult.levelsGained },
        version: { increment: 1 }
      }
    });

    if (creditReward > 0) {
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          guildId: run.guildId,
          asset: "CREDITS",
          delta: creditReward,
          balanceBefore: user.credits,
          balanceAfter: user.credits + creditReward,
          reason: "boss.victory_reward",
          referenceType: "BossRun",
          referenceId: run.id,
          operationKey: `boss-reward:${run.id}:${userId}:credits`,
          metadata: { xp: xpReward, category: run.category }
        }
      });
    }
    if (xpReward > 0) {
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "XP",
          delta: xpReward,
          balanceBefore: progress.xp,
          balanceAfter: progress.xp + xpReward,
          reason: "boss.victory_reward",
          referenceType: "BossRun",
          referenceId: run.id,
          operationKey: `boss-reward:${run.id}:${userId}:xp`,
          metadata: {
            levelsGained: xpResult.levelsGained,
            resultingLevel: xpResult.level,
            resultingLevelXp: xpResult.xp
          }
        }
      });
    }
    if (fragmentReward > 0) {
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          guildId: run.guildId,
          asset: "FRAGMENTS",
          delta: fragmentReward,
          balanceBefore: user.fragments,
          balanceAfter: user.fragments + fragmentReward,
          reason: "boss.victory_reward",
          referenceType: "BossRun",
          referenceId: run.id,
          operationKey: `boss-reward:${run.id}:${userId}:fragments`,
          metadata: { conquerorTier, category: run.category }
        }
      });
    }

    const conquerorDrops: Array<{
      type: "booster" | "chest";
      itemKey: string;
      rate: number;
      roll: number;
    }> = [];
    for (const rewardType of ["booster", "chest"] as const) {
      const rate = conquerorDropRates[rewardType];
      const roll = deterministicBossRewardRoll(run.id, userId, rewardType);
      if (roll >= rate) continue;
      const itemKey = rewardType === "booster"
        ? `booster.boss_choice.${conquerorTier}`
        : `chest.boss_reward.${conquerorTier}`;
      const item = await tx.itemDefinition.findUnique({
        where: { contentKey: itemKey }
      });
      if (!item || item.status !== "PUBLISHED") continue;
      const owned = await tx.userItem.findUnique({
        where: { userId_itemId: { userId, itemId: item.id } }
      });
      if ((owned?.quantity ?? 0) >= item.maxStack) continue;
      await tx.userItem.upsert({
        where: { userId_itemId: { userId, itemId: item.id } },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: { userId, itemId: item.id, quantity: 1 }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          guildId: run.guildId,
          asset: "ITEM",
          assetKey: itemKey,
          delta: 1,
          balanceBefore: owned?.quantity ?? 0,
          balanceAfter: (owned?.quantity ?? 0) + 1,
          reason: `boss.conqueror_${rewardType}_drop`,
          referenceType: "BossRun",
          referenceId: run.id,
          operationKey: `boss-reward:${run.id}:${userId}:conqueror-${rewardType}`,
          metadata: { conquerorTier, rate, roll }
        }
      });
      conquerorDrops.push({ type: rewardType, itemKey, rate, roll });
    }
    granted.conquerorTier = conquerorTier;
    granted.conquerorDrops = conquerorDrops;
    granted.minimumContribution = contributionThreshold;

    await tx.bossRewardGrant.create({
      data: { bossRunId: run.id, userId, reward: granted as Prisma.InputJsonValue }
    });
    await tx.transactionLog.create({
      data: {
        userId,
        type: "boss_reward",
        amount: creditReward,
        metadata: {
          bossRunId: run.id,
          bossKey: run.definition.contentKey,
          xp: xpReward,
          fragments: fragmentReward,
          conquerorTier,
          bonus
        }
      }
    });
  }

  if (run.definition.kind === "GUARDIAN" && run.definition.world) {
    const nextWorld = await tx.worldDefinition.findFirst({
      where: {
        status: "PUBLISHED",
        position: run.definition.world.position + 1
      }
    });
    if (nextWorld) {
      const nextGuardian = await tx.bossDefinition.findFirst({
        where: {
          status: "PUBLISHED",
          kind: "GUARDIAN",
          worldId: nextWorld.id
        }
      });
      await tx.guildWorldProgress.updateMany({
        where: { guildId: run.guildId, worldId: run.definition.world.id },
        data: {
          state: "BOSS_DEFEATED",
          completedAt: new Date(),
          version: { increment: 1 }
        }
      });
      await tx.guildWorldProgress.upsert({
        where: {
          guildId_worldId: { guildId: run.guildId, worldId: nextWorld.id }
        },
        update: {
          state: "PROGRESSING",
          unlockedAt: new Date(),
          version: { increment: 1 }
        },
        create: {
          guildId: run.guildId,
          worldId: nextWorld.id,
          state: "PROGRESSING",
          unlockedAt: new Date()
        }
      });
      await tx.guildProgress.update({
        where: { guildId: run.guildId },
        data: {
          state: nextGuardian ? "PROGRESSING" : "BOSS_DEFEATED",
          frontierWorldId: nextWorld.id,
          mastery: 0,
          masteryTarget: nextGuardian?.baseTarget ?? 0,
          unlockedWorldCount: nextWorld.position,
          version: { increment: 1 }
        }
      });
    }
  }

  await tx.bossRun.update({
    where: { id: run.id },
    data: {
      status: "DEFEATED",
      progress: run.targetSnapshot,
      defeatedAt: new Date(),
      version: { increment: 1 }
    }
  });
  await tx.outboxEvent.create({
    data: {
      eventId: `boss-defeated:${run.id}`,
      aggregateType: "BossRun",
      aggregateId: run.id,
      eventType: "boss.defeated",
      eventVersion: 1,
      payload: {
        bossRunId: run.id,
        guildId: run.guildId,
        definitionId: run.definitionId,
        participants: participantIds.length
      }
    }
  });
}

export class BossService {
  async getGuildBoss(discordGuildId: string) {
    const guild = await prisma.guild.findUnique({
      where: { discordId: discordGuildId },
      include: {
        config: true,
        progress: { include: { frontierWorld: true } }
      }
    });
    if (!guild) throw new AppError("Serveur RTA introuvable.", 404);
    const runs = await prisma.bossRun.findMany({
      where: {
        guildId: guild.id,
        status: { in: [...OPEN_BOSS_STATUSES] },
        endsAt: { gt: new Date() }
      },
      include: {
        definition: { include: { world: true } },
        contributions: true,
        rewardGrants: true
      },
      orderBy: [
        { isPersistent: "desc" },
        { startsAt: "asc" }
      ]
    });
    const guardianRun = runs.find((entry) => entry.definition.kind === "GUARDIAN") ?? null;
    const dailyRun = runs.find((entry) => entry.definition.kind === "REGULAR") ?? null;
    return { guild, runs, guardianRun, dailyRun };
  }

  async getRallyBannerState(bossRunId: string) {
    const run = await prisma.bossRun.findUnique({
      where: { id: bossRunId },
      select: { id: true, guildId: true, status: true, endsAt: true }
    });
    if (!run) throw new AppError("Boss introuvable.", 404);
    const [activeRecord, cooldownRecord] = await Promise.all([
      prisma.actionCooldown.findUnique({
        where: { scopeKey: `boss-banner:${run.id}` }
      }),
      prisma.actionCooldown.findUnique({
        where: { scopeKey: `boss-banner-cooldown:${run.guildId}` }
      })
    ]);
    const now = new Date();
    const activeUntil = activeRecord && activeRecord.expiresAt > now
      ? activeRecord.expiresAt
      : null;
    const cooldownUntil = cooldownRecord && cooldownRecord.expiresAt > now
      ? cooldownRecord.expiresAt
      : null;
    return {
      activeUntil,
      cooldownUntil,
      canActivate:
        run.status === "ACTIVE" &&
        run.endsAt > now &&
        !activeUntil &&
        !cooldownUntil
    };
  }

  async getCollectionRequirement(input: {
    bossRunId: string;
    userId: string;
    page?: number;
    pageSize?: number;
  }) {
    const run = await prisma.bossRun.findUnique({
      where: { id: input.bossRunId },
      include: { definition: { include: { world: true } } }
    });
    if (!run || !run.definition.world) {
      throw new AppError("Boss introuvable.", 404);
    }
    if (!["HARMONIZATION", "COLLECTIVE_COLLECTION"].includes(run.mechanic)) {
      throw new AppError("Ce boss ne demande pas de collection.", 409);
    }

    const eligibleCards = await prisma.card.findMany({
      where: collectionCardWhere(run.definition),
      select: {
        id: true,
        name: true,
        contentKey: true,
        deck: { select: { name: true } },
        rarity: { select: { name: true, weight: true } }
      },
      orderBy: [
        { deck: { name: "asc" } },
        { rarity: { weight: "desc" } },
        { name: "asc" }
      ]
    });
    const scope = progressionScope(run);
    const [presented, owned] = await Promise.all([
      prisma.bossPresentedResource.findMany({
        where: {
          resourceType: "CARD",
          scopeKey: { startsWith: `${scope}:card:` }
        },
        select: { resourceKey: true }
      }),
      prisma.inventoryItem.findMany({
        where: {
          userId: input.userId,
          quantity: { gt: 0 },
          cardId: { in: eligibleCards.map((card) => card.id) }
        },
        select: { cardId: true }
      })
    ]);
    const presentedIds = new Set(presented.map((entry) => entry.resourceKey));
    const ownedIds = new Set(owned.map((entry) => entry.cardId));
    const rankedCards = eligibleCards
      .map((card) => ({
        ...card,
        owned: ownedIds.has(card.id),
        presented: presentedIds.has(card.id)
      }))
      .sort((left, right) => {
        const leftRank = left.presented ? 2 : left.owned ? 0 : 1;
        const rightRank = right.presented ? 2 : right.owned ? 0 : 1;
        return leftRank - rightRank;
      });
    const pageSize = Math.max(5, Math.min(20, Math.floor(input.pageSize ?? 12)));
    const totalPages = Math.max(1, Math.ceil(rankedCards.length / pageSize));
    const page = Math.max(0, Math.min(totalPages - 1, Math.floor(input.page ?? 0)));
    const worldPosition = run.definition.world.position;
    const scopeLabel = run.definition.kind === "GUARDIAN" && worldPosition >= 8
      ? `Mondes 1 à ${worldPosition}`
      : run.definition.world.name;

    return {
      bossRunId: run.id,
      bossName: run.definition.name,
      mechanic: run.mechanic,
      status: run.status,
      scopeLabel,
      requirementLabel: bossCollectionRequirementLabel({
        kind: run.definition.kind,
        worldPosition,
        worldName: run.definition.world.name,
        target: run.targetSnapshot
      }),
      target: run.targetSnapshot,
      progress: run.progress,
      remaining: Math.max(0, run.targetSnapshot - run.progress),
      eligibleCount: rankedCards.length,
      presentedCount: rankedCards.filter((card) => card.presented).length,
      ownedCount: rankedCards.filter((card) => card.owned).length,
      presentableCount: rankedCards.filter((card) => card.owned && !card.presented).length,
      page,
      totalPages,
      cards: rankedCards.slice(page * pageSize, (page + 1) * pageSize)
    };
  }

  async scheduleBoss(input: {
    guildDiscordId: string;
    definitionKey: string;
    startsAt?: Date;
    mechanic?: BossMechanic;
    category?: BossCategory;
    target?: number;
    durationHours?: number;
    endsAt?: Date;
    slotKey?: string;
    persistent?: boolean;
  }) {
    const now = new Date();
    const startsAt = input.startsAt ?? now;
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`boss-schedule:${input.guildDiscordId}`}, 0))`
      );
      const guild = await tx.guild.findUnique({
        where: { discordId: input.guildDiscordId },
        include: { config: true, progress: true }
      });
      if (!guild || !guild.isActive) throw new AppError("Serveur RTA inactif.", 409);
      const definition = await tx.bossDefinition.findUnique({
        where: { contentKey: input.definitionKey },
        include: { world: true }
      });
      if (!definition || definition.status !== "PUBLISHED" || !definition.world) {
        throw new AppError("Boss publié introuvable.", 404);
      }
      if (definition.kind === "REGULAR" && guild.config?.regularBossEnabled === false) {
        throw new AppError("Les boss réguliers sont désactivés sur ce serveur.", 409);
      }
      if (definition.kind === "GUARDIAN") {
        if (guild.config?.progressionBossEnabled === false) {
          throw new AppError("Les gardiens sont désactivés sur ce serveur.", 409);
        }
        if (
          guild.progress?.frontierWorldId !== definition.worldId ||
          !["BOSS_READY", "BOSS_ACTIVE"].includes(guild.progress?.state ?? "")
        ) {
          throw new AppError("Ce gardien n’est pas encore prêt.", 409);
        }
      } else {
        const unlocked = await tx.guildWorldProgress.findUnique({
          where: {
            guildId_worldId: { guildId: guild.id, worldId: definition.world.id }
          }
        });
        if (!unlocked || unlocked.state === "LOCKED") {
          throw new AppError("Le monde de ce boss n’est pas débloqué.", 409);
        }
      }
      const open = await tx.bossRun.findFirst({
        where: {
          guildId: guild.id,
          status: { in: [...OPEN_BOSS_STATUSES] },
          definition: { kind: definition.kind }
        }
      });
      if (open) {
        throw new AppError(
          definition.kind === "GUARDIAN"
            ? "Un gardien de monde est déjà actif ou planifié."
            : "Un boss journalier est déjà actif ou planifié.",
          409
        );
      }

      const activePlayers = Math.max(1, await tx.guildMember.count({
        where: {
          guildId: guild.id,
          isActive: true,
          lastActiveAt: { gte: new Date(now.getTime() - ACTIVE_MEMBER_WINDOW_MS) }
        }
      }));
      const mechanic = input.mechanic ?? preferredBossMechanic(definition.metadata);
      const appearanceSeed = `${guild.id}:` + (
        input.slotKey ?? `${definition.contentKey}:${startsAt.toISOString()}`
      );
      const category = definition.kind === "GUARDIAN"
        ? "WORLD_GUARDIAN"
        : input.category ?? deterministicBossCategory(
            definition.metadata,
            appearanceSeed
          );
      const bossTier = bossTierForAppearance({
        kind: definition.kind,
        worldPosition: definition.world.position,
        seed: appearanceSeed
      });
      const availableUniqueCards = ["HARMONIZATION", "COLLECTIVE_COLLECTION"].includes(mechanic)
        ? await tx.card.count({
            where: collectionCardWhere(definition)
          })
        : 0;
      if (
        ["HARMONIZATION", "COLLECTIVE_COLLECTION"].includes(mechanic) &&
        availableUniqueCards === 0
      ) {
        throw new AppError("Aucune carte éligible n’est disponible pour ce boss.", 409);
      }
      const requestedTarget = input.target ?? bossObjectiveTarget(
        definition.kind,
        mechanic,
        definition.world.position,
        activePlayers,
        availableUniqueCards,
        bossTier
      );
      const offeringPlan = mechanic === "OFFERING"
        ? bossOfferingObjectives(
            requestedTarget,
            definition.world.id,
            definition.world.name
          )
        : null;
      const target = offeringPlan?.totalPoints ?? requestedTarget;
      const durationHours = input.durationHours
        ?? definition.durationHours
        ?? DEFAULT_GUARDIAN_DURATION_HOURS;
      const isPersistent = input.persistent ?? definition.kind === "GUARDIAN";
      const requestedEndsAt = input.endsAt;
      const endsAt = isPersistent
        ? PERSISTENT_BOSS_ENDS_AT
        : requestedEndsAt && requestedEndsAt > startsAt
          ? requestedEndsAt
          : new Date(startsAt.getTime() + durationHours * 60 * 60_000);
      const progressionKey = definition.kind === "GUARDIAN"
        ? `guardian:${guild.id}:${definition.id}`
        : null;
      const previous = progressionKey
        ? await tx.bossRun.findFirst({
            where: { progressionKey, status: "EXPIRED" },
            orderBy: { createdAt: "desc" }
          })
        : null;
      const specialOfferings = bossSpecialOfferingRequirements({
        tier: bossTier,
        mechanic,
        worldId: definition.world.id,
        worldLabel: definition.world.name,
        persistent: isPersistent
      });
      if (offeringPlan && previous) {
        const previousSnapshot = record(previous.objectiveSnapshot);
        const previousObjectives = offeringObjectivesFromSnapshot(previousSnapshot);
        if (previousObjectives) {
          offeringPlan.credits.contributed = Math.min(
            offeringPlan.credits.target,
            previousObjectives.credits.contributed
          );
          offeringPlan.fragments.contributed = Math.min(
            offeringPlan.fragments.target,
            previousObjectives.fragments.contributed
          );
          offeringPlan.duplicateCards.contributed = Math.min(
            offeringPlan.duplicateCards.target,
            previousObjectives.duplicateCards.contributed
          );
        }
        const previousSpecials = specialOfferingsFromSnapshot(previousSnapshot);
        for (const key of ["funeralCandle", "silverTear", "brokenMask"] as const) {
          const current = specialOfferings?.[key];
          if (!current) continue;
          const prior = record(previousSpecials[key] as Prisma.JsonValue);
          current.deposited = Math.min(
            current.required,
            Math.max(0, Math.floor(Number(prior.deposited ?? 0)))
          );
        }
        if (specialOfferings?.funeralCandle) {
          specialOfferings.funeralCandle.protectionDisabled =
            specialOfferings.funeralCandle.deposited >=
            specialOfferings.funeralCandle.required;
        }
        if (specialOfferings?.silverTear) {
          specialOfferings.silverTear.phaseRevealed =
            specialOfferings.silverTear.deposited >=
            specialOfferings.silverTear.required;
        }
      }
      const carriedProgress = previous?.progress ?? 0;
      const status = startsAt <= now ? "ACTIVE" : "SCHEDULED";
      const collectionRequirement = ["HARMONIZATION", "COLLECTIVE_COLLECTION"].includes(mechanic)
        ? bossCollectionRequirementLabel({
            kind: definition.kind,
            worldPosition: definition.world.position,
            worldName: definition.world.name,
            target: Math.max(1, target)
          })
        : null;
      const run = await tx.bossRun.create({
        data: {
          guildId: guild.id,
          definitionId: definition.id,
          slotKey: input.slotKey ?? `${definition.contentKey}:${startsAt.toISOString()}`,
          progressionKey,
          category,
          mechanic,
          status,
          isPersistent,
          targetSnapshot: Math.max(1, target),
          progress: Math.min(carriedProgress, Math.max(1, target)),
          activePlayers,
          objectiveSnapshot: {
            label: record(definition.metadata).objective
              ?? collectionRequirement
              ?? `Atteindre ${Math.max(1, target)} contributions`,
            mechanic,
            bossTier,
            persistent: isPersistent,
            specialOfferings,
            ...(offeringPlan
              ? {
                  offeringObjectives: {
                    credits: offeringPlan.credits,
                    fragments: offeringPlan.fragments,
                    duplicateCards: offeringPlan.duplicateCards
                  },
                  destructive: true
                }
              : {}),
            ...(category === "WORLD_INVADER"
              ? {
                  worldEffect: {
                    effectKey: "PREMIUM_ENTRY_COST_MULTIPLIER",
                    multiplier: 1.2,
                    worldId: definition.world.id,
                    worldLabel: definition.world.name,
                    activeOnlyWhileBossActive: true
                  }
                }
              : {}),
            ...(collectionRequirement
              ? {
                  scope: collectionRequirement,
                  variantsCountOnce: true,
                  destructive: false
                }
              : {})
          },
          rewardSnapshot: bossRewardForTier(
            definition.kind,
            category,
            bossTier
          ),
          channelId: guild.config?.bossAnnouncementEnabled
            ? guild.config.bossAnnouncementChannelId
            : null,
          scheduledAt: now,
          startsAt,
          endsAt
        }
      });
      await tx.scheduledJob.createMany({
        data: [
          {
            queue: "boss",
            type: "boss.activate",
            dedupeKey: `boss.activate:${run.id}`,
            payload: { bossRunId: run.id },
            runAt: startsAt
          },
          ...(!isPersistent
            ? [{
                queue: "boss",
                type: "boss.expire",
                dedupeKey: `boss.expire:${run.id}`,
                payload: { bossRunId: run.id },
                runAt: endsAt
              }]
            : [])
        ],
        skipDuplicates: true
      });
      if (definition.kind === "GUARDIAN" && status === "ACTIVE") {
        await tx.guildProgress.update({
          where: { guildId: guild.id },
          data: { state: "BOSS_ACTIVE", version: { increment: 1 } }
        });
      }
      return run;
    });
  }

  async reconcileProgressionBosses(now = new Date()) {
    const guilds = await prisma.guild.findMany({
      where: { isActive: true },
      include: {
        config: true,
        progress: { include: { frontierWorld: true } }
      }
    });
    const results: string[] = [];
    for (const guild of guilds) {
      const progress = guild.progress;
      if (
        !progress ||
        !progress.frontierWorldId ||
        !progress.masteryTarget ||
        progress.unlockedWorldCount >= 9 ||
        guild.config?.progressionBossEnabled === false
      ) {
        continue;
      }
      if (progress.mastery >= progress.masteryTarget && progress.state === "PROGRESSING") {
        await prisma.guildProgress.updateMany({
          where: { guildId: guild.id, state: "PROGRESSING" },
          data: { state: "BOSS_READY", version: { increment: 1 } }
        });
        progress.state = "BOSS_READY";
      }
      const openGuardian = await prisma.bossRun.findFirst({
        where: {
          guildId: guild.id,
          status: { in: [...OPEN_BOSS_STATUSES] },
          definition: { kind: "GUARDIAN" }
        },
        include: { definition: true }
      });
      if (openGuardian) {
        if (!openGuardian.isPersistent) {
          const snapshot = record(openGuardian.objectiveSnapshot);
          const specials = specialOfferingsFromSnapshot(snapshot);
          const flower = record(specials.voidFlower as Prisma.JsonValue);
          await prisma.$transaction([
            prisma.bossRun.update({
              where: { id: openGuardian.id },
              data: {
                isPersistent: true,
                endsAt: PERSISTENT_BOSS_ENDS_AT,
                objectiveSnapshot: {
                  ...snapshot,
                  persistent: true,
                  specialOfferings: {
                    ...(specials as Prisma.InputJsonObject),
                    voidFlower: { ...flower, maximum: 0 }
                  }
                },
                version: { increment: 1 }
              }
            }),
            prisma.scheduledJob.updateMany({
              where: {
                dedupeKey: `boss.expire:${openGuardian.id}`,
                status: "PENDING"
              },
              data: { status: "CANCELLED" }
            })
          ]);
        }
        if (openGuardian.status === "ACTIVE" && progress.state !== "BOSS_ACTIVE") {
          await prisma.guildProgress.update({
            where: { guildId: guild.id },
            data: { state: "BOSS_ACTIVE", version: { increment: 1 } }
          });
        }
        results.push(openGuardian.id);
        continue;
      }
      if (!["BOSS_READY", "BOSS_ACTIVE"].includes(progress.state)) continue;
      const guardian = await prisma.bossDefinition.findFirst({
        where: {
          status: "PUBLISHED",
          kind: "GUARDIAN",
          worldId: progress.frontierWorldId
        }
      });
      if (!guardian) continue;
      try {
        const run = await this.scheduleBoss({
          guildDiscordId: guild.discordId,
          definitionKey: guardian.contentKey,
          startsAt: now,
          persistent: true,
          slotKey: `guardian:persistent:${guardian.contentKey}:${now.toISOString()}`
        });
        results.push(run.id);
      } catch (error) {
        const isConcurrentGuardian =
          error instanceof AppError &&
          error.statusCode === 409 &&
          error.message.includes("gardien de monde");
        if (!isConcurrentGuardian) throw error;
      }
    }
    return results;
  }

  async reconcileDailyBosses(now = new Date()) {
    const guilds = await prisma.guild.findMany({
      where: { isActive: true },
      include: {
        config: true,
        progress: true,
        worldProgress: {
          where: { state: { not: "LOCKED" } },
          select: { worldId: true }
        }
      }
    });
    const results: string[] = [];
    for (const guild of guilds) {
      const window = dailyBossWindow(
        now,
        guild.config?.timezone ?? "Europe/Paris"
      );
      const slotKey = `daily:regular:${window.dayKey}`;

      const staleRuns = await prisma.bossRun.findMany({
        where: {
          guildId: guild.id,
          status: { in: [...OPEN_BOSS_STATUSES] },
          definition: { kind: "REGULAR" },
          endsAt: { lte: now }
        },
        select: { id: true }
      });
      for (const staleRun of staleRuns) {
        await this.expireRun(staleRun.id, now);
      }

      const existingSlot = await prisma.bossRun.findFirst({
        where: {
          guildId: guild.id,
          definition: { kind: "REGULAR" },
          startsAt: { gte: window.startsAt, lt: window.endsAt }
        },
        select: { id: true }
      });
      if (existingSlot) continue;

      const open = await prisma.bossRun.findFirst({
        where: {
          guildId: guild.id,
          status: { in: [...OPEN_BOSS_STATUSES] },
          definition: { kind: "REGULAR" },
          endsAt: { gt: now }
        },
        select: { id: true }
      });
      if (open) continue;

      let definition: BossDefinition | null = null;
      let mechanic: BossMechanic | undefined;

      if (guild.config?.regularBossEnabled !== false) {
        const unlockedWorldIds = guild.worldProgress.map((entry) => entry.worldId);
        const candidates = unlockedWorldIds.length > 0
          ? await prisma.bossDefinition.findMany({
              where: {
                status: "PUBLISHED",
                kind: "REGULAR",
                worldId: { in: unlockedWorldIds }
              },
              orderBy: [{ worldId: "asc" }, { contentKey: "asc" }]
            })
          : [];
        const selection = selectDailyRegularBoss({
          definitions: candidates,
          unlockedWorldIds,
          seed: `${guild.id}:${window.dayKey}`
        });
        if (selection) {
          definition = selection.definition;
          mechanic = selection.mechanic;
        }
      }
      if (!definition) continue;

      try {
        const run = await this.scheduleBoss({
          guildDiscordId: guild.discordId,
          definitionKey: definition.contentKey,
          startsAt: window.startsAt,
          mechanic,
          endsAt: window.endsAt,
          slotKey
        });
        results.push(run.id);
      } catch (error) {
        const isDuplicate =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";
        const isConcurrentOpenBoss =
          error instanceof AppError &&
          error.statusCode === 409 &&
          error.message.includes("journalier");
        if (!isDuplicate && !isConcurrentOpenBoss) throw error;
      }
    }
    return results;
  }

  async activateRun(bossRunId: string) {
    return prisma.$transaction(async (tx) => {
      const run = await tx.bossRun.findUnique({
        where: { id: bossRunId },
        include: { definition: true }
      });
      if (!run || run.status !== "SCHEDULED" || run.startsAt > new Date()) return null;
      await tx.bossRun.update({
        where: { id: run.id },
        data: { status: "ACTIVE", version: { increment: 1 } }
      });
      if (run.definition.kind === "GUARDIAN") {
        await tx.guildProgress.updateMany({
          where: { guildId: run.guildId, state: "BOSS_READY" },
          data: { state: "BOSS_ACTIVE", version: { increment: 1 } }
        });
      }
      return run.id;
    });
  }

  async expireRun(bossRunId: string, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      const run = await tx.bossRun.findUnique({
        where: { id: bossRunId },
        include: { definition: true }
      });
      if (
        !run ||
        run.isPersistent ||
        !OPEN_BOSS_STATUSES.includes(run.status as typeof OPEN_BOSS_STATUSES[number]) ||
        run.endsAt > now
      ) {
        return null;
      }
      await tx.bossRun.update({
        where: { id: run.id },
        data: { status: "EXPIRED", version: { increment: 1 } }
      });
      if (run.definition.kind === "GUARDIAN") {
        await tx.guildProgress.updateMany({
          where: { guildId: run.guildId, state: "BOSS_ACTIVE" },
          data: { state: "BOSS_READY", version: { increment: 1 } }
        });
      }
      return run.id;
    });
  }

  async cancelRun(bossRunId: string) {
    return prisma.$transaction(async (tx) => {
      const run = await tx.bossRun.findUnique({
        where: { id: bossRunId },
        include: { definition: true }
      });
      if (!run || !OPEN_BOSS_STATUSES.includes(run.status as typeof OPEN_BOSS_STATUSES[number])) {
        throw new AppError("Ce boss n’est plus annulable.", 409);
      }
      await tx.bossRun.update({
        where: { id: run.id },
        data: { status: "CANCELLED", version: { increment: 1 } }
      });
      if (run.definition.kind === "GUARDIAN") {
        await tx.guildProgress.updateMany({
          where: { guildId: run.guildId, state: { in: ["BOSS_READY", "BOSS_ACTIVE"] } },
          data: { state: "BOSS_READY", version: { increment: 1 } }
        });
      }
      return run;
    });
  }

  async contributeCredits(input: {
    bossRunId: string;
    userId: string;
    amount: number;
    operationKey: string;
  }) {
    const requested = Math.max(1, Math.floor(input.amount));
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "BossRun" WHERE "id" = ${input.bossRunId} FOR UPDATE`
      );
      const replay = await tx.bossContribution.findUnique({
        where: { operationKey: input.operationKey }
      });
      if (replay) return { amount: replay.amount, replayed: true };
      const run = await tx.bossRun.findUniqueOrThrow({ where: { id: input.bossRunId } });
      if (run.status !== "ACTIVE" || run.endsAt <= new Date()) {
        throw new AppError("Ce boss n’est plus actif.", 409);
      }
      if (run.mechanic !== "OFFERING") {
        throw new AppError("Ce boss n’accepte pas les offrandes de crédits.", 409);
      }
      const snapshot = record(run.objectiveSnapshot);
      const objectives = offeringObjectivesFromSnapshot(snapshot);
      const remaining = objectives
        ? objectives.credits.target - objectives.credits.contributed
        : run.targetSnapshot - run.progress;
      if (remaining <= 0) throw new AppError("L’objectif est déjà terminé.", 409);
      const amount = Math.min(requested, remaining);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`);
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
      if (user.credits < amount) {
        throw new AppError(`Il te faut ${amount} crédits pour cette offrande.`, 409);
      }
      await tx.user.update({
        where: { id: user.id },
        data: {
          credits: { decrement: amount },
          balanceVersion: { increment: 1 }
        }
      });
      await tx.bossContribution.create({
        data: {
          bossRunId: run.id,
          userId: user.id,
          operationKey: input.operationKey,
          type: "CREDIT_DONATION",
          resourceKey: "credits",
          amount,
          destructive: true
          ,
          metadata: {
            baseAmount: amount,
            objective: "credits"
          }
        }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId: user.id,
          guildId: run.guildId,
          asset: "CREDITS",
          delta: -amount,
          balanceBefore: user.credits,
          balanceAfter: user.credits - amount,
          reason: "boss.credit_offering",
          referenceType: "BossRun",
          referenceId: run.id,
          operationKey: `${input.operationKey}:credits`
        }
      });
      const objectiveSnapshot: Prisma.InputJsonObject = objectives
        ? {
            ...snapshot,
            offeringObjectives: {
              credits: {
                ...objectives.credits,
                contributed: objectives.credits.contributed + amount
              },
              fragments: objectives.fragments,
              duplicateCards: objectives.duplicateCards
            }
          }
        : snapshot as Prisma.InputJsonObject;
      const progress = run.progress + amount;
      await tx.bossRun.update({
        where: { id: run.id },
        data: { progress, objectiveSnapshot, version: { increment: 1 } }
      });
      if (progress >= run.targetSnapshot) {
        await grantRewardsIfObjectivesComplete(tx, run.id);
      }
      return {
        amount,
        progressAdded: amount,
        progress: Math.min(progress, run.targetSnapshot),
        target: run.targetSnapshot,
        replayed: false
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getOfferingContributionPreview(input: {
    bossRunId: string;
    userId: string;
  }) {
    const run = await prisma.bossRun.findUnique({
      where: { id: input.bossRunId },
      include: { definition: { include: { world: true } } }
    });
    if (
      !run ||
      run.status !== "ACTIVE" ||
      run.endsAt <= new Date() ||
      run.mechanic !== "OFFERING"
    ) {
      throw new AppError("Ce boss n'accepte plus d'offrandes.", 409);
    }
    const objectives = offeringObjectivesFromSnapshot(record(run.objectiveSnapshot));
    if (!objectives) {
      throw new AppError("Les objectifs détaillés de ce boss sont indisponibles.", 409);
    }
    const [user, duplicateCard] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { credits: true, fragments: true }
      }),
      findOfferingDuplicateCard(prisma, {
        userId: input.userId,
        definition: run.definition
      })
    ]);
    return {
      objectives,
      user,
      duplicateCard: duplicateCard
        ? {
            name: duplicateCard.card.name,
            deckName: duplicateCard.card.deck.name,
            rarity: duplicateCard.card.rarity.name,
            variant: duplicateCard.variant
          }
        : null
    };
  }

  async contributeFragments(input: {
    bossRunId: string;
    userId: string;
    quantity: number;
    operationKey: string;
  }) {
    const requested = Math.max(1, Math.floor(input.quantity));
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "BossRun" WHERE "id" = ${input.bossRunId} FOR UPDATE`
      );
      const replay = await tx.bossContribution.findUnique({
        where: { operationKey: input.operationKey }
      });
      if (replay) {
        const metadata = record(replay.metadata);
        return {
          quantity: positiveInteger(metadata.quantity, 0),
          progressAdded: replay.amount,
          replayed: true
        };
      }
      const run = await tx.bossRun.findUniqueOrThrow({
        where: { id: input.bossRunId }
      });
      if (
        run.status !== "ACTIVE" ||
        run.endsAt <= new Date() ||
        run.mechanic !== "OFFERING"
      ) {
        throw new AppError("Ce boss n'accepte plus de fragments.", 409);
      }
      const snapshot = record(run.objectiveSnapshot);
      const objectives = offeringObjectivesFromSnapshot(snapshot);
      if (!objectives) {
        throw new AppError("Ce boss ne demande pas de fragments.", 409);
      }
      const remaining = objectives.fragments.target - objectives.fragments.contributed;
      if (remaining <= 0) {
        throw new AppError("L'objectif de fragments est déjà terminé.", 409);
      }
      const quantity = Math.min(requested, remaining);
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`
      );
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
      if (user.fragments < quantity) {
        throw new AppError(`Il te faut ${quantity} fragment(s) pour cette offrande.`, 409);
      }
      const progressAdded = quantity * objectives.fragments.pointValue;
      await tx.user.update({
        where: { id: input.userId },
        data: {
          fragments: { decrement: quantity },
          balanceVersion: { increment: 1 }
        }
      });
      await tx.bossContribution.create({
        data: {
          bossRunId: run.id,
          userId: input.userId,
          operationKey: input.operationKey,
          type: "FRAGMENT_DONATION",
          resourceKey: "fragments",
          amount: progressAdded,
          destructive: true,
          metadata: {
            quantity,
            pointValue: objectives.fragments.pointValue,
            objective: "fragments"
          }
        }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId: input.userId,
          guildId: run.guildId,
          asset: "FRAGMENTS",
          delta: -quantity,
          balanceBefore: user.fragments,
          balanceAfter: user.fragments - quantity,
          reason: "boss.fragment_offering",
          referenceType: "BossRun",
          referenceId: run.id,
          operationKey: `${input.operationKey}:fragments`
        }
      });
      const objectiveSnapshot: Prisma.InputJsonObject = {
        ...snapshot,
        offeringObjectives: {
          credits: objectives.credits,
          fragments: {
            ...objectives.fragments,
            contributed: objectives.fragments.contributed + quantity
          },
          duplicateCards: objectives.duplicateCards
        }
      };
      const progress = run.progress + progressAdded;
      await tx.bossRun.update({
        where: { id: run.id },
        data: { progress, objectiveSnapshot, version: { increment: 1 } }
      });
      if (progress >= run.targetSnapshot) {
        await grantRewardsIfObjectivesComplete(tx, run.id);
      }
      return {
        quantity,
        progressAdded,
        progress: Math.min(progress, run.targetSnapshot),
        target: run.targetSnapshot,
        replayed: false
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async contributeDuplicateCard(input: {
    bossRunId: string;
    userId: string;
    operationKey: string;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "BossRun" WHERE "id" = ${input.bossRunId} FOR UPDATE`
      );
      const replay = await tx.bossContribution.findUnique({
        where: { operationKey: input.operationKey }
      });
      if (replay) {
        const metadata = record(replay.metadata);
        return {
          cardName: String(metadata.cardName ?? "Carte"),
          variant: String(metadata.variant ?? "normal"),
          progressAdded: replay.amount,
          replayed: true
        };
      }
      const run = await tx.bossRun.findUniqueOrThrow({
        where: { id: input.bossRunId },
        include: { definition: { include: { world: true } } }
      });
      if (
        run.status !== "ACTIVE" ||
        run.endsAt <= new Date() ||
        run.mechanic !== "OFFERING"
      ) {
        throw new AppError("Ce boss n'accepte plus de cartes.", 409);
      }
      const snapshot = record(run.objectiveSnapshot);
      const objectives = offeringObjectivesFromSnapshot(snapshot);
      if (!objectives) {
        throw new AppError("Ce boss ne demande pas de doublons.", 409);
      }
      if (
        objectives.duplicateCards.contributed >=
        objectives.duplicateCards.target
      ) {
        throw new AppError("L'objectif de doublons est déjà terminé.", 409);
      }
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`
      );
      let duplicate = await findOfferingDuplicateCard(tx, {
        userId: input.userId,
        definition: run.definition
      });
      if (!duplicate) {
        throw new AppError(
          `Tu n'as aucun doublon non archivé de ${objectives.duplicateCards.worldLabel}.`,
          409
        );
      }
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "InventoryItem" WHERE "userId" = ${input.userId} AND "cardId" = ${duplicate.cardId} FOR UPDATE`
      );
      duplicate = await findOfferingDuplicateCard(tx, {
        userId: input.userId,
        definition: run.definition
      });
      if (!duplicate) {
        throw new AppError("Ton inventaire a changé. Rouvre les offrandes.", 409);
      }
      const consumed = await tx.inventoryItem.updateMany({
        where: {
          id: duplicate.id,
          quantity: { gt: 0 },
          version: duplicate.version
        },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) {
        throw new AppError("Ton inventaire a changé. Rouvre les offrandes.", 409);
      }
      const progressAdded = objectives.duplicateCards.pointValue;
      await tx.bossContribution.create({
        data: {
          bossRunId: run.id,
          userId: input.userId,
          operationKey: input.operationKey,
          type: "CARD_SACRIFICE",
          resourceKey: duplicate.cardId,
          amount: progressAdded,
          destructive: true,
          metadata: {
            cardName: duplicate.card.name,
            cardKey: duplicate.card.contentKey,
            deckName: duplicate.card.deck.name,
            rarity: duplicate.card.rarity.name,
            variant: duplicate.variant,
            quantity: 1,
            objective: "duplicateCards"
          }
        }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId: input.userId,
          guildId: run.guildId,
          asset: "CARD",
          assetKey: duplicate.card.contentKey ?? duplicate.cardId,
          delta: -1,
          balanceBefore: duplicate.quantity,
          balanceAfter: duplicate.quantity - 1,
          reason: "boss.card_offering",
          referenceType: "BossRun",
          referenceId: run.id,
          operationKey: `${input.operationKey}:card`,
          metadata: {
            variant: duplicate.variant,
            rarity: duplicate.card.rarity.name,
            deckName: duplicate.card.deck.name
          }
        }
      });
      const objectiveSnapshot: Prisma.InputJsonObject = {
        ...snapshot,
        offeringObjectives: {
          credits: objectives.credits,
          fragments: objectives.fragments,
          duplicateCards: {
            ...objectives.duplicateCards,
            contributed: objectives.duplicateCards.contributed + 1
          }
        }
      };
      const progress = run.progress + progressAdded;
      await tx.bossRun.update({
        where: { id: run.id },
        data: { progress, objectiveSnapshot, version: { increment: 1 } }
      });
      if (progress >= run.targetSnapshot) {
        await grantRewardsIfObjectivesComplete(tx, run.id);
      }
      return {
        cardName: duplicate.card.name,
        deckName: duplicate.card.deck.name,
        rarity: duplicate.card.rarity.name,
        variant: duplicate.variant,
        progressAdded,
        progress: Math.min(progress, run.targetSnapshot),
        target: run.targetSnapshot,
        replayed: false
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async presentCollection(input: {
    bossRunId: string;
    userId: string;
    operationKey: string;
    cardIds: string[];
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "BossRun" WHERE "id" = ${input.bossRunId} FOR UPDATE`
      );
      const replay = await tx.bossContribution.findUnique({
        where: { operationKey: input.operationKey }
      });
      if (replay) {
        return {
          amount: replay.amount,
          cards: stringList(record(replay.metadata).cardNames),
          replayed: true
        };
      }
      const run = await tx.bossRun.findUniqueOrThrow({
        where: { id: input.bossRunId },
        include: { definition: { include: { world: true } } }
      });
      if (run.status !== "ACTIVE" || run.endsAt <= new Date()) {
        throw new AppError("Ce boss n’est plus actif.", 409);
      }
      if (!["HARMONIZATION", "COLLECTIVE_COLLECTION"].includes(run.mechanic)) {
        throw new AppError("Ce boss ne demande pas de présentation de collection.", 409);
      }
      const selectedCardIds = [...new Set(input.cardIds)];
      if (
        selectedCardIds.length < 1 ||
        selectedCardIds.length > 5 ||
        selectedCardIds.length !== input.cardIds.length
      ) {
        throw new AppError("Choisis entre 1 et 5 cartes différentes à présenter.", 400);
      }
      const inventory = await tx.inventoryItem.findMany({
        where: {
          userId: input.userId,
          quantity: { gt: 0 },
          cardId: { in: selectedCardIds },
          card: collectionCardWhere(run.definition)
        },
        select: { cardId: true, card: { select: { name: true } } }
      });
      const uniqueCards = new Map(
        inventory.map((entry) => [entry.cardId, { id: entry.cardId, name: entry.card.name }])
      );
      const scope = progressionScope(run);
      const scopeKeys = [...uniqueCards.keys()].map((cardId) => `${scope}:card:${cardId}`);
      const alreadyPresented = await tx.bossPresentedResource.findMany({
        where: { scopeKey: { in: scopeKeys } },
        select: { scopeKey: true }
      });
      const existing = new Set(alreadyPresented.map((entry) => entry.scopeKey));
      const remaining = run.targetSnapshot - run.progress;
      const candidatesById = new Map(
        [...uniqueCards.values()].map((card) => [card.id, card])
      );
      const candidates = selectedCardIds
        .map((cardId) => candidatesById.get(cardId))
        .filter((card): card is { id: string; name: string } => Boolean(card))
        .filter((card) => !existing.has(`${scope}:card:${card.id}`))
        .slice(0, Math.max(0, remaining));
      if (candidates.length !== Math.min(selectedCardIds.length, Math.max(0, remaining))) {
        throw new AppError(
          "Une carte choisie n'est pas possédée, n'est pas compatible ou a déjà été présentée.",
          409
        );
      }
      if (candidates.length === 0) {
        throw new AppError("Tu n’as aucune nouvelle carte compatible à présenter.", 409);
      }
      const progressGain = await bossProgressAmount(tx, run, candidates.length);
      await tx.bossPresentedResource.createMany({
        data: candidates.map((card) => ({
          bossRunId: run.id,
          userId: input.userId,
          scopeKey: `${scope}:card:${card.id}`,
          resourceKey: card.id,
          resourceType: "CARD"
        }))
      });
      await tx.bossContribution.create({
        data: {
          bossRunId: run.id,
          userId: input.userId,
          operationKey: input.operationKey,
          type: run.mechanic === "HARMONIZATION"
            ? "CARD_HARMONIZATION"
            : "COLLECTION_PRESENTATION",
          resourceKey: run.definition.worldId,
          amount: progressGain.amount,
          destructive: false,
          metadata: {
            cardIds: candidates.map((card) => card.id),
            cardNames: candidates.map((card) => card.name),
            baseAmount: candidates.length,
            bannerKey: progressGain.bannerKey
          }
        }
      });
      const progress = run.progress + progressGain.amount;
      await tx.bossRun.update({
        where: { id: run.id },
        data: { progress, version: { increment: 1 } }
      });
      if (progress >= run.targetSnapshot) {
        await grantRewardsIfObjectivesComplete(tx, run.id);
      }
      return {
        amount: candidates.length,
        progressAdded: progressGain.amount,
        progress: Math.min(progress, run.targetSnapshot),
        target: run.targetSnapshot,
        cards: candidates.map((card) => card.name),
        replayed: false
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async recordCaptureAttempt(captureAttemptId: string) {
    const attempt = await prisma.captureAttempt.findUnique({
      where: { id: captureAttemptId },
      include: {
        encounter: {
          include: { zone: true }
        }
      }
    });
    if (!attempt || attempt.status !== "SUCCEEDED") return null;
    return prisma.$transaction(async (tx) => {
      const runs = await tx.bossRun.findMany({
        where: {
          guildId: attempt.encounter.guildId,
          status: "ACTIVE",
          endsAt: { gt: new Date() },
          definition: { worldId: attempt.encounter.zone.worldId },
          mechanic: {
            in: eligibleCaptureBossMechanics(attempt.encounter.bossMinion)
          }
        },
        orderBy: { id: "asc" }
      });
      if (runs.length === 0) return null;
      const contributions = [];
      const legacyReplay = await tx.bossContribution.findUnique({
        where: { operationKey: `boss-capture:${attempt.id}` }
      });
      for (const run of runs) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "BossRun" WHERE "id" = ${run.id} FOR UPDATE`
        );
        const operationKey = `boss-capture:${attempt.id}:${run.id}`;
        if (legacyReplay?.bossRunId === run.id) {
          contributions.push(legacyReplay);
          continue;
        }
        const replay = await tx.bossContribution.findUnique({ where: { operationKey } });
        if (replay) {
          contributions.push(replay);
          continue;
        }
        const current = await tx.bossRun.findUniqueOrThrow({ where: { id: run.id } });
        if (current.status !== "ACTIVE" || current.progress >= current.targetSnapshot) {
          continue;
        }
        const progressGain = await bossProgressAmount(tx, current, 1);
        const contribution = await tx.bossContribution.create({
          data: {
            bossRunId: run.id,
            userId: attempt.userId,
            operationKey,
            type: run.mechanic === "EXPEDITION_MINION"
              ? "MINION_CAPTURE"
              : "VALID_CAPTURE",
            resourceKey: attempt.encounter.cardId,
            amount: progressGain.amount,
            destructive: false,
            metadata: {
              captureAttemptId: attempt.id,
              baseAmount: 1,
              bannerKey: progressGain.bannerKey
            }
          }
        });
        const progress = current.progress + progressGain.amount;
        await tx.bossRun.update({
          where: { id: run.id },
          data: { progress, version: { increment: 1 } }
        });
        if (progress >= current.targetSnapshot) {
          await grantRewardsIfObjectivesComplete(tx, run.id);
        }
        contributions.push(contribution);
      }
      return contributions;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async activateRallyBanner(input: {
    bossRunId: string;
    userId: string;
    operationKey: string;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "BossRun" WHERE "id" = ${input.bossRunId} FOR UPDATE`
      );
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: `${input.operationKey}:rally-banner` }
      });
      if (replay) {
        const existing = await tx.actionCooldown.findUnique({
          where: { scopeKey: `boss-banner:${input.bossRunId}` }
        });
        return {
          expiresAt: existing?.expiresAt ?? null,
          replayed: true
        };
      }
      const run = await tx.bossRun.findUniqueOrThrow({ where: { id: input.bossRunId } });
      if (run.status !== "ACTIVE" || run.endsAt <= new Date()) {
        throw new AppError("Ce boss n'est plus actif.", 409);
      }
      const active = await tx.actionCooldown.findUnique({
        where: { scopeKey: `boss-banner:${run.id}` }
      });
      if (active && active.expiresAt > new Date()) {
        throw new AppError("Une Bannière de ralliement est déjà active sur ce boss.", 409);
      }
      const cooldown = await tx.actionCooldown.findUnique({
        where: { scopeKey: `boss-banner-cooldown:${run.guildId}` }
      });
      if (cooldown && cooldown.expiresAt > new Date()) {
        throw new AppError("Le serveur doit attendre avant de poser une nouvelle Bannière.", 429);
      }
      const owned = await tx.userItem.findFirst({
        where: {
          userId: input.userId,
          quantity: { gt: 0 },
          item: { contentKey: "consumable.rally_banner", status: "PUBLISHED" }
        },
        include: { item: true }
      });
      if (!owned) throw new AppError("Tu ne possèdes aucune Bannière de ralliement.", 409);
      const consumed = await tx.userItem.updateMany({
        where: { id: owned.id, quantity: { gt: 0 }, version: owned.version },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) throw new AppError("Ton inventaire a changé.", 409);
      const now = new Date();
      const expiresAt = new Date(Math.min(run.endsAt.getTime(), now.getTime() + 15 * 60_000));
      await tx.actionCooldown.upsert({
        where: { scopeKey: `boss-banner:${run.id}` },
        update: {
          action: "BOSS_SERVER_PROGRESS_BOOST",
          userId: input.userId,
          guildId: run.guildId,
          expiresAt
        },
        create: {
          scopeKey: `boss-banner:${run.id}`,
          action: "BOSS_SERVER_PROGRESS_BOOST",
          userId: input.userId,
          guildId: run.guildId,
          expiresAt
        }
      });
      await tx.actionCooldown.upsert({
        where: { scopeKey: `boss-banner-cooldown:${run.guildId}` },
        update: {
          action: "BOSS_SERVER_PROGRESS_BOOST_COOLDOWN",
          userId: input.userId,
          guildId: run.guildId,
          expiresAt: new Date(now.getTime() + 60 * 60_000)
        },
        create: {
          scopeKey: `boss-banner-cooldown:${run.guildId}`,
          action: "BOSS_SERVER_PROGRESS_BOOST_COOLDOWN",
          userId: input.userId,
          guildId: run.guildId,
          expiresAt: new Date(now.getTime() + 60 * 60_000)
        }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId: input.userId,
          guildId: run.guildId,
          asset: "ITEM",
          assetKey: owned.item.contentKey,
          delta: -1,
          balanceBefore: owned.quantity,
          balanceAfter: owned.quantity - 1,
          reason: "boss.rally_banner",
          referenceType: "BossRun",
          referenceId: run.id,
          operationKey: `${input.operationKey}:rally-banner`,
          metadata: { multiplier: 1.2, expiresAt: expiresAt.toISOString() }
        }
      });
      await tx.bossContribution.create({
        data: {
          bossRunId: run.id,
          userId: input.userId,
          operationKey: input.operationKey,
          type: "RALLY_BANNER",
          resourceKey: owned.item.contentKey,
          amount: 0,
          destructive: true,
          metadata: { multiplier: 1.2, expiresAt: expiresAt.toISOString() }
        }
      });
      return { expiresAt, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async useBossOffering(input: {
    bossRunId: string;
    userId: string;
    itemKey:
      | "offering.funeral_candle"
      | "offering.silver_tear"
      | "offering.broken_mask"
      | "offering.void_flower";
    operationKey: string;
    sourceKey?: string;
  }) {
    const effects = {
      "offering.funeral_candle": "BOSS_OFFERING_COMMON_THRESHOLD",
      "offering.silver_tear": "BOSS_OFFERING_REVEAL_PHASE",
      "offering.broken_mask": "BOSS_OFFERING_SOURCE_SPECIFIC",
      "offering.void_flower": "BOSS_TIMER_EXTENSION"
    } as const;
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "BossRun" WHERE "id" = ${input.bossRunId} FOR UPDATE`
      );
      const replay = await tx.bossContribution.findUnique({
        where: { operationKey: input.operationKey }
      });
      if (replay) {
        const metadata = record(replay.metadata);
        return {
          replayed: true,
          effect: replay.type,
          deposited: Number(metadata.deposited ?? 0),
          required: Number(metadata.required ?? 0),
          endsAt: null,
          objectiveSnapshot: null
        };
      }
      const run = await tx.bossRun.findUniqueOrThrow({
        where: { id: input.bossRunId },
        include: { definition: true }
      });
      if (run.status !== "ACTIVE" || run.endsAt <= new Date()) {
        throw new AppError("Ce boss n'est plus actif.", 409);
      }
      const owned = await tx.userItem.findFirst({
        where: {
          userId: input.userId,
          quantity: { gt: 0 },
          item: {
            contentKey: input.itemKey,
            effectKey: effects[input.itemKey],
            status: "PUBLISHED"
          }
        },
        include: { item: true }
      });
      if (!owned) throw new AppError("Tu ne possèdes pas cette offrande.", 409);
      const snapshot = record(run.objectiveSnapshot);
      const specialOfferings = specialOfferingsFromSnapshot(snapshot);
      const specialKey = {
        "offering.funeral_candle": "funeralCandle",
        "offering.silver_tear": "silverTear",
        "offering.broken_mask": "brokenMask",
        "offering.void_flower": "voidFlower"
      }[input.itemKey]!;
      const requirement = record(
        specialOfferings[specialKey] as Prisma.JsonValue
      );
      if (input.itemKey !== "offering.void_flower") {
        const required = Math.max(
          0,
          Math.floor(Number(requirement.required ?? 0))
        );
        const alreadyDeposited = Math.max(
          0,
          Math.floor(Number(requirement.deposited ?? 0))
        );
        if (required <= 0) {
          throw new AppError("Ce boss ne demande pas cette offrande.", 409);
        }
        if (alreadyDeposited >= required) {
          throw new AppError("Le besoin de cette offrande est déjà rempli.", 409);
        }
        if (
          input.itemKey === "offering.broken_mask" &&
          input.sourceKey &&
          input.sourceKey !== requirement.sourceKey
        ) {
          throw new AppError(
            `Ce boss demande un Masque provenant de ${String(requirement.sourceLabel ?? "la source affichée")}.`,
            409
          );
        }
      }
      let endsAt = run.endsAt;
      if (input.itemKey === "offering.void_flower") {
        if (run.isPersistent) {
          throw new AppError(
            "La Fleur du Néant est réservée aux boss temporaires. Ce gardien reste actif jusqu’à sa défaite.",
            409
          );
        }
        const count = await tx.bossContribution.count({
          where: { bossRunId: run.id, type: "VOID_FLOWER" }
        });
        const maximum = Math.max(0, Math.floor(Number(requirement.maximum ?? 0)));
        if (maximum < 1) {
          throw new AppError("Ce boss n’accepte pas de Fleur du Néant.", 409);
        }
        if (count >= maximum) {
          throw new AppError(
            `Ce boss a déjà reçu le maximum de ${maximum} Fleur(s) du Néant.`,
            409
          );
        }
        const initialDurationMs = run.definition.durationHours * 60 * 60_000;
        const extensionMs = Math.max(5 * 60_000, Math.round(initialDurationMs * 0.05));
        endsAt = new Date(run.endsAt.getTime() + extensionMs);
        await tx.scheduledJob.updateMany({
          where: { dedupeKey: `boss.expire:${run.id}`, status: "PENDING" },
          data: { runAt: endsAt }
        });
      }
      const deposited = Math.max(
        0,
        Math.floor(Number(requirement.deposited ?? 0))
      ) + 1;
      const updatedRequirement: Prisma.InputJsonObject = {
        ...requirement,
        deposited,
        ...(input.itemKey === "offering.funeral_candle"
          ? {
              protectionDisabled:
                deposited >= positiveInteger(
                  requirement.required,
                  FUNERAL_CANDLE_REQUIREMENT
                )
            }
          : {}),
        ...(input.itemKey === "offering.silver_tear"
          ? {
              phaseRevealed:
                deposited >= positiveInteger(requirement.required, 1),
              illusionsDisabled:
                deposited >= positiveInteger(requirement.required, 1)
            }
          : {}),
        ...(input.itemKey === "offering.broken_mask"
          ? {
              sourceRequirementSatisfied:
                deposited >= positiveInteger(requirement.required, 1)
            }
          : {})
      };
      const objectiveSnapshot: Prisma.InputJsonObject = {
        ...snapshot,
        specialOfferings: {
          ...(specialOfferings as Prisma.InputJsonObject),
          [specialKey]: updatedRequirement
        },
        ...(input.itemKey === "offering.funeral_candle"
          ? {
              commonThresholdDisabled:
                updatedRequirement.protectionDisabled === true
            }
          : {}),
        ...(input.itemKey === "offering.silver_tear"
          ? {
              phaseRevealed: updatedRequirement.phaseRevealed === true,
              illusionsDisabled: updatedRequirement.illusionsDisabled === true
            }
          : {}),
        ...(input.itemKey === "offering.broken_mask"
          ? {
              requiredSource: String(requirement.sourceKey ?? ""),
              requiredSourceLabel: String(requirement.sourceLabel ?? "")
            }
          : {}),
        ...(input.itemKey === "offering.void_flower"
          ? { timerExtended: true }
          : {})
      };
      const consumed = await tx.userItem.updateMany({
        where: { id: owned.id, quantity: { gt: 0 }, version: owned.version },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) throw new AppError("Ton inventaire a changé.", 409);
      const type = {
        "offering.funeral_candle": "FUNERAL_CANDLE",
        "offering.silver_tear": "SILVER_TEAR",
        "offering.broken_mask": "BROKEN_MASK",
        "offering.void_flower": "VOID_FLOWER"
      }[input.itemKey]!;
      await tx.bossRun.update({
        where: { id: run.id },
        data: { objectiveSnapshot, endsAt, version: { increment: 1 } }
      });
      await tx.bossContribution.create({
        data: {
          bossRunId: run.id,
          userId: input.userId,
          operationKey: input.operationKey,
          type,
          resourceKey: input.itemKey,
          amount: 0,
          destructive: true,
          metadata: {
            sourceKey: requirement.sourceKey ?? input.sourceKey ?? null,
            deposited,
            required: requirement.required ?? requirement.maximum ?? null,
            endsAt: endsAt.toISOString()
          }
        }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId: input.userId,
          guildId: run.guildId,
          asset: "ITEM",
          assetKey: owned.item.contentKey,
          delta: -1,
          balanceBefore: owned.quantity,
          balanceAfter: owned.quantity - 1,
          reason: "boss.offering",
          referenceType: "BossRun",
          referenceId: run.id,
          operationKey: `${input.operationKey}:item`,
          metadata: { type }
        }
      });
      if (run.progress >= run.targetSnapshot) {
        await grantRewardsIfObjectivesComplete(tx, run.id);
      }
      return {
        replayed: false,
        effect: type,
        deposited,
        required: Number(requirement.required ?? requirement.maximum ?? 0),
        endsAt,
        objectiveSnapshot
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getUserContribution(bossRunId: string, userId: string) {
    const contributions = await prisma.bossContribution.findMany({
      where: { bossRunId, userId },
      select: { amount: true, destructive: true, type: true }
    });
    return {
      amount: contributions.reduce((sum, entry) => sum + entry.amount, 0),
      actions: contributions.length,
      majorAction: contributions.some(
        (entry) => entry.destructive && entry.type !== "CREDIT_DONATION"
      )
    };
  }
}
