import { createHash, randomInt, randomUUID } from "node:crypto";
import { Prisma, prisma } from "@rta/database";
import {
  calculateCaptureChance,
  createSeededRandom,
  applyRarityWeightMultiplier,
  PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT,
  rarityWeightsForRoute,
  rollLimitedRarity,
  rollVariant,
  rollVariantWithIncense,
  sampleUniqueIndices,
  type CoreRarity,
  type DangerProfile
} from "@rta/game-engine";
import { AppError } from "./errors.js";
import { applyXpGain } from "./xp.service.js";
import { SELL_PRICE_KEYS } from "./economy-config.js";
import {
  captureConsumableDropTriggers,
  captureConsumableTierLabel,
  normalizeCaptureConsumableTier,
  pickCaptureConsumableTier,
  type CaptureConsumableTier
} from "./capture-item-drop.js";
import { ExplorationEnergyService } from "./exploration-energy.service.js";

const ENCOUNTER_DURATION_MS = 2 * 60_000;
const CAPTURE_DECISION_DURATION_MS = 30_000;
const TIER_INCENSE_USES = 3;
const AFFINITY_INCENSE_USES = 3;
const explorationEnergyService = new ExplorationEnergyService();

export { PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT };

const ARCHIVE_TIER_MULTIPLIER: Partial<Record<CoreRarity, number>> = {
  Common: 1.4,
  Uncommon: 1.35,
  Rare: 1.3,
  "Very Rare": 1.2,
  Import: 1.08,
  Exotic: 1.04,
  "Black Market": 1.02
};

const RARITY_ORDER: CoreRarity[] = [
  "Common",
  "Uncommon",
  "Rare",
  "Very Rare",
  "Import",
  "Exotic",
  "Black Market"
];

export function worldMasteryProgressBar(
  mastery: number,
  masteryTarget: number,
  segments = 12
) {
  const safeMastery = Number.isFinite(mastery) ? Math.max(0, mastery) : 0;
  const safeTarget = Number.isFinite(masteryTarget) ? Math.max(0, masteryTarget) : 0;
  const safeSegments = Math.max(1, Math.floor(segments));
  const percent = safeTarget > 0
    ? Math.round(Math.min(1, safeMastery / safeTarget) * 100)
    : 0;
  const filled = Math.round((percent / 100) * safeSegments);

  return `${"█".repeat(filled)}${"░".repeat(safeSegments - filled)} ${percent} %`;
}

export function lockedWorldAccessMessage(input: {
  currentWorldName: string;
  mastery: number;
  masteryTarget: number;
}) {
  const mastery = Number.isFinite(input.mastery) ? Math.max(0, input.mastery) : 0;
  const masteryTarget = Number.isFinite(input.masteryTarget)
    ? Math.max(0, input.masteryTarget)
    : 0;
  const progressDetails = masteryTarget > 0
    ? `**${mastery}/${masteryTarget}** points de maîtrise` +
      (mastery >= masteryTarget
        ? " · **gardien prêt à être affronté**"
        : ` · encore **${masteryTarget - mastery}** avant le gardien`)
    : "La progression de ce monde n’est pas encore initialisée.";

  return (
    "Ce monde n’est pas encore débloqué. Réussis davantage d’explorations dans les mondes " +
    "précédents pour remplir leur progression, puis affronte et bats leurs gardiens afin de " +
    "débloquer ce monde.\n\n" +
    `🌍 **Progression du monde actuel · ${input.currentWorldName}**\n` +
    `${worldMasteryProgressBar(mastery, masteryTarget)}\n` +
    progressDetails
  );
}

export type ExplorationEvent = {
  key: string;
  label: string;
  isSpecial: boolean;
  xpMultiplier: number;
  creditMultiplier: number;
};

export type EncounterPublicationState = {
  phase: "PRIVATE" | "SCHEDULED" | "PUBLIC";
  publishAfter: Date | null;
  shouldSchedule: boolean;
};

export function encounterPublicationState(
  encounter: {
    initiatorUserId: string | null;
    messageId: string | null;
    publishedAt: Date | null;
    publishAfter: Date | null;
  },
  userId: string
): EncounterPublicationState {
  if (encounter.messageId || encounter.publishedAt) {
    return { phase: "PUBLIC", publishAfter: null, shouldSchedule: false };
  }
  if (encounter.publishAfter) {
    return {
      phase: "SCHEDULED",
      publishAfter: encounter.publishAfter,
      shouldSchedule: false
    };
  }
  return {
    phase: "PRIVATE",
    publishAfter: null,
    shouldSchedule: encounter.initiatorUserId === userId
  };
}

export function explorationEventFromRoll(roll: number): ExplorationEvent | null {
  const bounded = Math.min(0.999999, Math.max(0, roll));
  if (bounded >= 0.2) return null;
  if (bounded < 0.03) {
    return {
      key: "COSMIC_JACKPOT",
      label: "Convergence cosmique",
      isSpecial: true,
      xpMultiplier: 2,
      creditMultiplier: 2
    };
  }
  const normalEvents = [
    {
      key: "CREDIT_CACHE",
      label: "Cache de crédits",
      isSpecial: false,
      xpMultiplier: 1,
      creditMultiplier: 1.5
    },
    {
      key: "XP_SURGE",
      label: "Surcharge d'expérience",
      isSpecial: false,
      xpMultiplier: 1.5,
      creditMultiplier: 1
    },
    {
      key: "LUCKY_TRAIL",
      label: "Piste chanceuse",
      isSpecial: false,
      xpMultiplier: 1.25,
      creditMultiplier: 1.25
    }
  ] satisfies ExplorationEvent[];
  return normalEvents[Math.floor((bounded - 0.03) / 0.17 * normalEvents.length)]
    ?? normalEvents.at(-1)!;
}

function atLeastRarity(current: CoreRarity, minimum: CoreRarity) {
  return RARITY_ORDER[Math.max(RARITY_ORDER.indexOf(current), RARITY_ORDER.indexOf(minimum))]!;
}

const tierIncenseTargets = {
  "consumable.common_incense": "Common",
  "consumable.uncommon_incense": "Uncommon",
  "consumable.rare_incense": "Rare",
  "consumable.very_rare_incense": "Very Rare"
} as const satisfies Record<string, CoreRarity>;

const choiceCountByRarity: Record<string, number> = {
  Common: 3,
  Uncommon: 4,
  Rare: 5,
  "Very Rare": 6,
  Import: 7,
  Exotic: 8,
  "Black Market": 9
};

const targetPenaltyByRarity: Record<string, number> = {
  Common: 0,
  Uncommon: 2,
  Rare: 5,
  "Very Rare": 8,
  Import: 12,
  Exotic: 16,
  "Black Market": 20
};

type CardMetadata = {
  compatibleZoneNames?: unknown;
  captureHint?: unknown;
};

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

type ArchivedCardProfile = {
  inventoryItem: {
    card: {
      deckId: string;
      rarity: { name: string };
    };
  };
};

function archiveResonanceProfile(entries: ArchivedCardProfile[]) {
  const deckCounts = new Map<string, number>();
  const tierCounts = new Map<CoreRarity, number>();
  for (const entry of entries) {
    const { deckId } = entry.inventoryItem.card;
    const rarity = entry.inventoryItem.card.rarity.name as CoreRarity;
    deckCounts.set(deckId, (deckCounts.get(deckId) ?? 0) + 1);
    if (RARITY_ORDER.includes(rarity)) {
      tierCounts.set(rarity, (tierCounts.get(rarity) ?? 0) + 1);
    }
  }
  const resonantDecks = new Set(
    [...deckCounts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([deckId]) => deckId)
  );
  const resonantTier = [...tierCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((left, right) =>
      (ARCHIVE_TIER_MULTIPLIER[right[0]] ?? 1) -
      (ARCHIVE_TIER_MULTIPLIER[left[0]] ?? 1)
    )[0]?.[0] ?? null;
  return { resonantDecks, resonantTier };
}

function cardMetadata(value: Prisma.JsonValue | null): {
  compatibleZoneNames: string[];
  captureHint: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { compatibleZoneNames: [], captureHint: null };
  }
  const metadata = value as CardMetadata;
  return {
    compatibleZoneNames: Array.isArray(metadata.compatibleZoneNames)
      ? metadata.compatibleZoneNames.filter((entry): entry is string => typeof entry === "string")
      : [],
    captureHint: typeof metadata.captureHint === "string" && metadata.captureHint.trim()
      ? metadata.captureHint.trim()
      : null
  };
}

function dangerProfile(value: string): DangerProfile {
  const mapping: Record<string, DangerProfile> = {
    CALM: "Calm",
    UNSTABLE: "Unstable",
    DANGEROUS: "Dangerous",
    CRITICAL: "Critical",
    EXTREME: "Extreme"
  };
  const profile = mapping[value];
  if (!profile) {
    throw new AppError("Cette zone utilise un profil de danger événementiel indisponible.", 409);
  }
  return profile;
}

function roundedRarityPercentages(
  weights: readonly { value: CoreRarity; weight: number }[]
): Record<string, number> {
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
  const allocations = weights.map((entry, index) => {
    const exact = entry.weight / totalWeight * 100;
    return { index, value: entry.value, percentage: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = 100 - allocations.reduce((sum, entry) => sum + entry.percentage, 0);
  for (const entry of [...allocations].sort((left, right) =>
    right.remainder - left.remainder || left.index - right.index
  )) {
    if (remaining <= 0) break;
    entry.percentage += 1;
    remaining -= 1;
  }
  return Object.fromEntries(allocations.map((entry) => [entry.value, entry.percentage]));
}

export const PREMIUM_ZONE_PASS_SURCHARGE_CREDITS = 50;

export function premiumZoneBaseCreditCost(
  passMetadata: Prisma.JsonValue | null
): number {
  if (!passMetadata || typeof passMetadata !== "object" || Array.isArray(passMetadata)) {
    return PREMIUM_ZONE_PASS_SURCHARGE_CREDITS;
  }
  const parsed = Number(
    (passMetadata as Record<string, Prisma.JsonValue>).creditPrice
  );
  const passPrice = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  return passPrice + PREMIUM_ZONE_PASS_SURCHARGE_CREDITS;
}

function captureCreditReward(
  config: Record<string, unknown>,
  rarityName: string
): number {
  const key = SELL_PRICE_KEYS[rarityName as keyof typeof SELL_PRICE_KEYS];
  const value = key ? Number(config[key]) : 0;
  return Number.isSafeInteger(value) && value > 0 ? value : 10;
}

type CaptureConsumableReward = {
  contentKey: string;
  name: string;
  tier: CaptureConsumableTier;
  tierLabel: string;
};

type CaptureBossOfferingReward = {
  contentKey: string;
  name: string;
  dropRate: number;
  sourceLabel: string;
};

export const CAPTURE_BOSS_OFFERING_DROP_RATES = {
  funeralCandle: 0.01,
  brokenMaskBase: 0.005,
  voidFlower: 0.001
} as const;

type CaptureConsumableConfig = {
  captureConsumableDropRate: number;
  captureConsumableCommonWeight: number;
  captureConsumableUncommonWeight: number;
  captureConsumableRareWeight: number;
  captureConsumableEpicWeight: number;
  captureConsumableLegendaryWeight: number;
};

class CaptureItemInventoryConflict extends Error {}

function itemRarity(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return (value as Record<string, Prisma.JsonValue>).rarity ?? null;
}

function captureConsumableWeights(config: CaptureConsumableConfig) {
  return {
    COMMON: config.captureConsumableCommonWeight,
    UNCOMMON: config.captureConsumableUncommonWeight,
    RARE: config.captureConsumableRareWeight,
    EPIC: config.captureConsumableEpicWeight,
    LEGENDARY: config.captureConsumableLegendaryWeight
  } satisfies Record<CaptureConsumableTier, number>;
}

function nextUtcMidnight(now = new Date()) {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  ));
}

async function incenseUsesWithHourglass(
  tx: Prisma.TransactionClient,
  userId: string,
  useHourglass: boolean
) {
  if (!useHourglass) return 3;
  const equipped = await tx.equippedArtifact.findFirst({
    where: {
      userId,
      item: { effectKey: "CONSUMABLE_EXTEND_WHITELISTED", status: "PUBLISHED" }
    },
    select: { id: true }
  });
  if (!equipped) {
    throw new AppError("Équipe le Sablier de préparation pour prolonger cet Encens.", 409);
  }
  const scopeKey = `artifact:hourglass:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const previous = await tx.actionCooldown.findUnique({ where: { scopeKey } });
  if (previous) {
    throw new AppError("Le Sablier de préparation a déjà été utilisé aujourd'hui.", 409);
  }
  await tx.actionCooldown.create({
    data: {
      scopeKey,
      action: "CONSUMABLE_EXTEND_WHITELISTED",
      userId,
      expiresAt: nextUtcMidnight()
    }
  });
  return 4;
}

async function assertExplorationConsumableSlot(
  tx: Prisma.TransactionClient,
  userId: string,
  effectKey: "EXP_TIER_WEIGHT_BOOST" | "EXP_DECK_WEIGHT_BOOST"
) {
  const [activeEffects, extraSlot] = await Promise.all([
    tx.userItemEffect.count({
      where: {
        userId,
        effectKey: { in: ["EXP_TIER_WEIGHT_BOOST", "EXP_DECK_WEIGHT_BOOST"] },
        remainingUses: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      }
    }),
    tx.userSkill.findFirst({
      where: {
        userId,
        rank: { gt: 0 },
        skill: { effectKey: "EXP_EXTRA_CONSUMABLE_SLOT", status: "PUBLISHED" }
      },
      select: { id: true }
    })
  ]);
  const sameEffect = await tx.userItemEffect.findUnique({
    where: { userId_effectKey: { userId, effectKey } },
    select: { remainingUses: true, expiresAt: true }
  });
  const sameIsActive = Boolean(
    sameEffect &&
    sameEffect.remainingUses > 0 &&
    (!sameEffect.expiresAt || sameEffect.expiresAt > new Date())
  );
  const limit = extraSlot ? 2 : 1;
  if (!sameIsActive && activeEffects >= limit) {
    throw new AppError(
      extraSlot
        ? "Tes deux emplacements de consommables d'exploration sont déjà occupés."
        : "Ton emplacement de consommable d'exploration est occupé. Débloque Sac avancé pour en activer deux.",
      409
    );
  }
}

async function grantCaptureConsumableDrop(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    guildId: string;
    attemptId: string;
    operationKey: string;
    config: CaptureConsumableConfig;
    rollTwice?: boolean;
  }
): Promise<CaptureConsumableReward | null> {
  const definitions = await tx.itemDefinition.findMany({
    where: {
      type: "CONSUMABLE",
      status: "PUBLISHED"
    },
    include: {
      users: {
        where: { userId: input.userId },
        take: 1
      }
    }
  });
  const eligible = definitions.flatMap((item) => {
    const tier = normalizeCaptureConsumableTier(itemRarity(item.metadata));
    const quantity = item.users[0]?.quantity ?? 0;
    if (!tier || quantity >= item.maxStack) return [];
    return [{ item, tier, quantity }];
  });
  const rolls = Array.from({ length: input.rollTwice ? 2 : 1 }, () => {
    const dropRollMillion = randomInt(0, 1_000_000);
    if (!captureConsumableDropTriggers(input.config.captureConsumableDropRate, dropRollMillion)) {
      return null;
    }
    const tierRollMillion = randomInt(0, 1_000_000);
    const tier = pickCaptureConsumableTier(
      eligible.map((entry) => entry.tier),
      captureConsumableWeights(input.config),
      tierRollMillion
    );
    return tier ? { tier, tierRollMillion, dropRollMillion } : null;
  }).filter((roll): roll is NonNullable<typeof roll> => roll !== null);
  if (rolls.length === 0) return null;
  const tierRank = new Map(
    ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"].map((tier, index) => [tier, index])
  );
  const bestRoll = rolls.sort(
    (left, right) => (tierRank.get(right.tier) ?? 0) - (tierRank.get(left.tier) ?? 0)
  )[0]!;
  const tierPool = eligible.filter((entry) => entry.tier === bestRoll.tier);
  const selected = tierPool[randomInt(0, tierPool.length)];
  if (!selected) return null;

  if (selected.item.users.length > 0) {
    const updated = await tx.userItem.updateMany({
      where: {
        id: selected.item.users[0]!.id,
        quantity: { lt: selected.item.maxStack },
        version: selected.item.users[0]!.version
      },
      data: {
        quantity: { increment: 1 },
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new CaptureItemInventoryConflict("Concurrent capture item inventory update");
    }
  } else {
    await tx.userItem.create({
      data: {
        userId: input.userId,
        itemId: selected.item.id,
        quantity: 1
      }
    });
  }

  await tx.economicLedgerEntry.create({
    data: {
      userId: input.userId,
      guildId: input.guildId,
      asset: "ITEM",
      assetKey: selected.item.contentKey,
      delta: 1,
      balanceBefore: selected.quantity,
      balanceAfter: selected.quantity + 1,
      reason: "explore.capture_consumable_drop",
      referenceType: "CaptureAttempt",
      referenceId: input.attemptId,
      operationKey: `${input.operationKey}:item-drop`,
      metadata: {
        dropRollMillion: bestRoll.dropRollMillion,
        dropRate: input.config.captureConsumableDropRate,
        tier: bestRoll.tier,
        tierLabel: captureConsumableTierLabel(bestRoll.tier),
        tierRollMillion: bestRoll.tierRollMillion,
        tierWeights: captureConsumableWeights(input.config),
        rollTwice: input.rollTwice === true,
        rolls
      }
    }
  });
  await tx.transactionLog.create({
    data: {
      userId: input.userId,
      type: "capture_item_drop",
      amount: 1,
      metadata: {
        attemptId: input.attemptId,
        contentKey: selected.item.contentKey,
        tier: bestRoll.tier,
        operationKey: input.operationKey
      }
    }
  });
  await tx.economyLog.create({
    data: {
      userId: input.userId,
      type: "capture_item_drop",
      amount: 1,
      metadata: {
        attemptId: input.attemptId,
        contentKey: selected.item.contentKey,
        tier: bestRoll.tier
      }
    }
  });

  return {
    contentKey: selected.item.contentKey,
    name: selected.item.name,
    tier: bestRoll.tier,
    tierLabel: captureConsumableTierLabel(bestRoll.tier)
  };
}

async function captureConsumableRewardForAttempt(
  tx: Prisma.TransactionClient,
  attemptId: string
): Promise<CaptureConsumableReward | null> {
  const ledger = await tx.economicLedgerEntry.findFirst({
    where: {
      referenceType: "CaptureAttempt",
      referenceId: attemptId,
      reason: "explore.capture_consumable_drop",
      asset: "ITEM"
    },
    select: { assetKey: true }
  });
  if (!ledger?.assetKey) return null;
  const item = await tx.itemDefinition.findUnique({
    where: { contentKey: ledger.assetKey }
  });
  if (!item) return null;
  const tier = normalizeCaptureConsumableTier(itemRarity(item.metadata));
  if (!tier) return null;
  return {
    contentKey: item.contentKey,
    name: item.name,
    tier,
    tierLabel: captureConsumableTierLabel(tier)
  };
}

async function grantCaptureBossOfferingDrop(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    guildId: string;
    attemptId: string;
    operationKey: string;
    worldId: string;
    worldLabel: string;
  }
): Promise<CaptureBossOfferingReward | null> {
  const activeBosses = await tx.bossRun.findMany({
    where: {
      guildId: input.guildId,
      status: "ACTIVE",
      endsAt: { gt: new Date() }
    },
    select: { id: true, objectiveSnapshot: true, isPersistent: true },
    orderBy: [
      { isPersistent: "asc" },
      { startsAt: "asc" }
    ]
  });
  const maskBoss = activeBosses.find((boss) => {
    const specials = jsonRecord(
      jsonRecord(boss.objectiveSnapshot).specialOfferings as Prisma.JsonValue
    );
    const mask = jsonRecord(specials.brokenMask as Prisma.JsonValue);
    return (
      Number(mask.required ?? 0) > Number(mask.deposited ?? 0) &&
      mask.sourceType === "WORLD" &&
      mask.sourceKey === input.worldId
    );
  });
  const activeBoss = maskBoss ?? activeBosses[0] ?? null;
  const bossSpecials = jsonRecord(
    jsonRecord(activeBoss?.objectiveSnapshot).specialOfferings as Prisma.JsonValue
  );
  const maskRequirement = jsonRecord(
    bossSpecials.brokenMask as Prisma.JsonValue
  );
  const maskRequired = Math.max(
    0,
    Math.floor(Number(maskRequirement.required ?? 0))
  );
  const maskDeposited = Math.max(
    0,
    Math.floor(Number(maskRequirement.deposited ?? 0))
  );
  const maskSourceMatches =
    maskRequired > maskDeposited &&
    maskRequirement.sourceType === "WORLD" &&
    maskRequirement.sourceKey === input.worldId;
  const candidates = [
    ...(maskSourceMatches
      ? [{
          contentKey: "offering.broken_mask",
          rate:
            CAPTURE_BOSS_OFFERING_DROP_RATES.brokenMaskBase *
            Number(maskRequirement.sourceMultiplier ?? 1),
          sourceLabel: String(maskRequirement.sourceLabel ?? input.worldLabel),
          bossRunId: activeBoss?.id ?? null
        }]
      : []),
    {
      contentKey: "offering.void_flower",
      rate: CAPTURE_BOSS_OFFERING_DROP_RATES.voidFlower,
      sourceLabel: input.worldLabel,
      bossRunId: activeBoss?.id ?? null
    },
    {
      contentKey: "offering.funeral_candle",
      rate: CAPTURE_BOSS_OFFERING_DROP_RATES.funeralCandle,
      sourceLabel: input.worldLabel,
      bossRunId: activeBoss?.id ?? null
    }
  ];
  let selected: typeof candidates[number] | null = null;
  let selectedRoll = 0;
  const rolls: Array<{ contentKey: string; rate: number; roll: number }> = [];
  for (const candidate of candidates) {
    const roll = randomInt(0, 1_000_000) / 1_000_000;
    rolls.push({ contentKey: candidate.contentKey, rate: candidate.rate, roll });
    if (!selected && roll < candidate.rate) {
      selected = candidate;
      selectedRoll = roll;
    }
  }
  if (!selected) return null;

  const item = await tx.itemDefinition.findUnique({
    where: { contentKey: selected.contentKey },
    include: {
      users: {
        where: { userId: input.userId },
        take: 1
      }
    }
  });
  if (!item || item.status !== "PUBLISHED" || item.type !== "OFFERING") {
    return null;
  }
  const owned = item.users[0];
  const quantity = owned?.quantity ?? 0;
  if (quantity >= item.maxStack) return null;
  if (owned) {
    const updated = await tx.userItem.updateMany({
      where: {
        id: owned.id,
        quantity: { lt: item.maxStack },
        version: owned.version
      },
      data: { quantity: { increment: 1 }, version: { increment: 1 } }
    });
    if (updated.count !== 1) {
      throw new CaptureItemInventoryConflict("Concurrent boss offering inventory update");
    }
  } else {
    await tx.userItem.create({
      data: { userId: input.userId, itemId: item.id, quantity: 1 }
    });
  }
  await tx.economicLedgerEntry.create({
    data: {
      userId: input.userId,
      guildId: input.guildId,
      asset: "ITEM",
      assetKey: item.contentKey,
      delta: 1,
      balanceBefore: quantity,
      balanceAfter: quantity + 1,
      reason: "explore.capture_boss_offering_drop",
      referenceType: "CaptureAttempt",
      referenceId: input.attemptId,
      operationKey: `${input.operationKey}:boss-offering-drop`,
      metadata: {
        bossRunId: selected.bossRunId,
        sourceType: "WORLD",
        sourceWorldId: input.worldId,
        sourceLabel: selected.sourceLabel,
        rate: selected.rate,
        roll: selectedRoll,
        rolls
      }
    }
  });
  await tx.transactionLog.create({
    data: {
      userId: input.userId,
      type: "capture_boss_offering_drop",
      amount: 1,
      metadata: {
        attemptId: input.attemptId,
        contentKey: item.contentKey,
        sourceWorldId: input.worldId,
        rate: selected.rate
      }
    }
  });
  return {
    contentKey: item.contentKey,
    name: item.name,
    dropRate: selected.rate,
    sourceLabel: selected.sourceLabel
  };
}

async function captureBossOfferingRewardForAttempt(
  tx: Prisma.TransactionClient,
  attemptId: string
): Promise<CaptureBossOfferingReward | null> {
  const ledger = await tx.economicLedgerEntry.findFirst({
    where: {
      referenceType: "CaptureAttempt",
      referenceId: attemptId,
      reason: "explore.capture_boss_offering_drop",
      asset: "ITEM"
    },
    select: { assetKey: true, metadata: true }
  });
  if (!ledger?.assetKey) return null;
  const item = await tx.itemDefinition.findUnique({
    where: { contentKey: ledger.assetKey }
  });
  if (!item) return null;
  const metadata = jsonRecord(ledger.metadata);
  return {
    contentKey: item.contentKey,
    name: item.name,
    dropRate: Number(metadata.rate ?? 0),
    sourceLabel: String(metadata.sourceLabel ?? "inconnue")
  };
}

export class ExploreService {
  async getGuild(discordGuildId: string) {
    const guild = await prisma.guild.findUnique({
      where: { discordId: discordGuildId },
      include: { config: true, progress: true }
    });
    if (!guild || !guild.isActive) {
      throw new AppError("RTA est désactivé sur ce serveur.", 403);
    }
    return guild;
  }

  async listWorlds(discordGuildId: string) {
    const guild = await this.getGuild(discordGuildId);
    const worlds = await prisma.worldDefinition.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { position: "asc" }
    });
    const unlockedWorldCount = Math.max(1, guild.progress?.unlockedWorldCount ?? 1);
    return worlds.map((world) => ({
      ...world,
      unlocked: world.position <= unlockedWorldCount
    }));
  }

  async listZones(discordGuildId: string, worldPosition: number) {
    const guild = await this.getGuild(discordGuildId);
    const unlockedWorldCount = Math.max(1, guild.progress?.unlockedWorldCount ?? 1);
    if (worldPosition > unlockedWorldCount) {
      const currentWorld = await prisma.worldDefinition.findFirst({
        where: guild.progress?.frontierWorldId
          ? { id: guild.progress.frontierWorldId }
          : { position: unlockedWorldCount },
        select: { name: true }
      });
      throw new AppError(
        lockedWorldAccessMessage({
          currentWorldName: currentWorld?.name ?? `Monde ${unlockedWorldCount}`,
          mastery: guild.progress?.mastery ?? 0,
          masteryTarget: guild.progress?.masteryTarget ?? 0
        }),
        403
      );
    }

    const world = await prisma.worldDefinition.findUnique({
      where: { position: worldPosition },
      include: { zones: { where: { status: "PUBLISHED" }, orderBy: { position: "asc" } } }
    });
    if (!world) {
      throw new AppError("Monde introuvable.", 404);
    }
    return world;
  }

  async listZoneDecks(
    discordGuildId: string,
    worldPosition: number,
    zonePosition: number,
    userId?: string
  ) {
    const guild = await this.getGuild(discordGuildId);
    const world = await this.listZones(discordGuildId, worldPosition);
    const zone = world.zones.find((entry) => entry.position === zonePosition);
    if (!zone) {
      throw new AppError("Zone introuvable.", 404);
    }
    const requiresPremiumAccess = zone.access === "PREMIUM" && !guild.config?.premiumEnabled;

    const [
      zoneWithDecks,
      expeditionPass,
      expeditionPassDefinition,
      user,
      activeInvader
    ] = await Promise.all([
      prisma.zoneDefinition.findUnique({
        where: { id: zone.id },
        include: {
          decks: {
            include: { deck: true },
            orderBy: { weight: "desc" }
          }
        }
      }),
      requiresPremiumAccess && userId
        ? prisma.userItem.findFirst({
            where: {
              userId,
              quantity: { gt: 0 },
              item: { contentKey: "consumable.expedition_pass", status: "PUBLISHED" }
            }
          })
        : null,
      requiresPremiumAccess
        ? prisma.itemDefinition.findUnique({
            where: { contentKey: "consumable.expedition_pass" },
            select: { metadata: true }
          })
        : null,
      requiresPremiumAccess && userId
        ? prisma.user.findUnique({ where: { id: userId }, select: { credits: true } })
        : null,
      requiresPremiumAccess
        ? prisma.bossRun.findFirst({
            where: {
              guildId: guild.id,
              category: "WORLD_INVADER",
              status: "ACTIVE",
              endsAt: { gt: new Date() },
              definition: { worldId: world.id }
            },
            select: { objectiveSnapshot: true }
          })
        : null
    ]);
    const basePremiumCreditCost = requiresPremiumAccess
      ? premiumZoneBaseCreditCost(expeditionPassDefinition?.metadata ?? null)
      : 0;
    const worldEffect = jsonRecord(
      jsonRecord(activeInvader?.objectiveSnapshot).worldEffect as Prisma.JsonValue
    );
    const invaderMultiplier =
      worldEffect.effectKey === "PREMIUM_ENTRY_COST_MULTIPLIER"
        ? Math.max(1, Math.min(3, Number(worldEffect.multiplier ?? 1)))
        : 1;
    const premiumCreditCost = Math.max(
      0,
      Math.ceil(basePremiumCreditCost * invaderMultiplier)
    );
    const availableDecks = (zoneWithDecks?.decks ?? []).map((entry) => entry.deck);
    if (!zoneWithDecks || availableDecks.length === 0) {
      throw new AppError("Aucun deck n'est associé à cette zone.", 409);
    }
    return {
      world,
      zone: zoneWithDecks,
      decks: availableDecks,
      requiresPremiumAccess,
      premiumCreditCost,
      premiumBaseCreditCost: basePremiumCreditCost,
      activeInvaderMultiplier: invaderMultiplier,
      expeditionPassCount: expeditionPass?.quantity ?? 0,
      userCredits: user?.credits ?? 0
    };
  }

  private async zonePool(discordGuildId: string, worldPosition: number) {
    const world = await this.listZones(discordGuildId, worldPosition);
    const zones = await prisma.zoneDefinition.findMany({
      where: { worldId: world.id, status: "PUBLISHED" },
      include: {
        decks: {
          include: { deck: true },
          orderBy: { weight: "desc" }
        }
      },
      orderBy: { position: "asc" }
    });
    const available = zones.flatMap((zone) => {
      const deck = zone.decks[0]?.deck;
      return deck ? [{ zone, deck }] : [];
    });
    return { world, available };
  }

  async proposeZones(
    discordGuildId: string,
    worldPosition: number,
    seed: string,
    discordUserId?: string
  ) {
    const { world, available } = await this.zonePool(discordGuildId, worldPosition);
    const free = available.filter((entry) => entry.zone.access === "FREE");
    const premium = available.filter((entry) => entry.zone.access === "PREMIUM");
    if (free.length < 2 || premium.length < 1) {
      throw new AppError(
        "Ce monde ne contient pas assez de zones autorisées pour proposer 2 routes gratuites et 1 premium.",
        409
      );
    }
    const random = createSeededRandom(seed);
    const user = discordUserId
      ? await prisma.user.findUnique({
          where: { discordId: discordUserId },
          include: {
            activeItemEffects: {
              where: {
                effectKey: "EXP_DECK_WEIGHT_BOOST",
                remainingUses: { gt: 0 }
              }
            },
            archivedCards: {
              include: {
                inventoryItem: {
                  include: {
                    card: {
                      select: { deckId: true, rarity: { select: { name: true } } }
                    }
                  }
                }
              }
            },
            equippedArtifacts: {
              where: {
                item: { effectKey: "EXP_ARCHIVE_RESONANCE", status: "PUBLISHED" }
              },
              select: { id: true }
            },
            gameplayState: true
            ,
            inventory: {
              where: { quantity: { gt: 0 } },
              select: { card: { select: { deckId: true } } }
            },
            skills: {
              where: { rank: { gt: 0 } },
              select: { skill: { select: { effectKey: true } } }
            }
          }
        })
      : null;
    const affinityDeck = user?.activeItemEffects.find((effect) =>
      !effect.expiresAt || effect.expiresAt > new Date()
    )?.targetKey;
    const archiveProfile = user?.equippedArtifacts.length
      ? archiveResonanceProfile(user.archivedCards)
      : { resonantDecks: new Set<string>(), resonantTier: null };
    const skillEffects = new Set(user?.skills.map((entry) => entry.skill.effectKey) ?? []);
    const userCounters = jsonRecord(user?.gameplayState?.counters);
    const pinnedMissingCount = Array.isArray(userCounters.pinnedMissingCardIds)
      ? userCounters.pinnedMissingCardIds.filter((value) => typeof value === "string").length
      : 0;
    const weightedPick = <T extends { deck: { id: string } }>(
      pool: T[],
      count: number
    ) => {
      const remaining = [...pool];
      const selected: T[] = [];
      while (selected.length < count && remaining.length > 0) {
        const weights = remaining.map((entry) => {
          const incense = entry.deck.id === affinityDeck ? 2 : 1;
          const archive = archiveProfile.resonantDecks.has(entry.deck.id) ? 1.5 : 1;
          return Math.min(2.5, incense * archive);
        });
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let target = random() * total;
        let index = 0;
        for (; index < weights.length - 1; index += 1) {
          target -= weights[index]!;
          if (target < 0) break;
        }
        selected.push(remaining.splice(index, 1)[0]!);
      }
      return selected;
    };
    const extraRoute =
      skillEffects.has("EXP_SCANNER_EXTRA_ROUTE") &&
      ((user?.gameplayState?.explorations ?? 0) + 1) % 9 === 0 &&
      free.length >= 3;
    const selectedFree = weightedPick(free, extraRoute ? 3 : 2);
    const selectedPremium = weightedPick(premium, 1);
    const selectedRoutes = [...selectedFree, selectedPremium[0]!];
    const deckTotals = skillEffects.has("EXP_COLLECTION_FORECAST")
      ? await prisma.card.groupBy({
          by: ["deckId"],
          where: {
            deckId: { in: selectedRoutes.map((entry) => entry.deck.id) },
            source: "vault",
            status: "PUBLISHED",
            isActive: true
          },
          _count: { id: true }
        })
      : [];
    const ownedByDeck = new Map<string, number>();
    for (const entry of user?.inventory ?? []) {
      ownedByDeck.set(entry.card.deckId, (ownedByDeck.get(entry.card.deckId) ?? 0) + 1);
    }
    return {
      world,
      proposals: selectedRoutes.map((entry) => {
        const weights = rarityWeightsForRoute(
          dangerProfile(entry.zone.danger),
          entry.zone.access === "PREMIUM"
        );
        const percentages = roundedRarityPercentages(weights);
        const totalCards = deckTotals.find((row) => row.deckId === entry.deck.id)?._count.id ?? 0;
        const ownedCards = ownedByDeck.get(entry.deck.id) ?? 0;
        const noveltyRatio = totalCards > 0 ? 1 - ownedCards / totalCards : 0;
        return {
          ...entry,
          intel: {
            bands: skillEffects.has("EXP_ROUTE_TIER_BANDS")
              ? {
                  standard: (percentages.Common ?? 0) + (percentages.Uncommon ?? 0),
                  rare: (percentages.Rare ?? 0) + (percentages["Very Rare"] ?? 0),
                  exceptional:
                    (percentages.Import ?? 0) +
                    (percentages.Exotic ?? 0) +
                    (percentages["Black Market"] ?? 0)
                }
              : null,
            novelty: skillEffects.has("EXP_COLLECTION_FORECAST")
              ? noveltyRatio >= 0.7
                ? "Nouvelles cartes probables"
                : noveltyRatio >= 0.35
                  ? "Mélange nouveautés / doublons"
                  : "Doublons probables"
              : null,
            wishlist: entry.deck.id === user?.gameplayState?.wishlistDeckId,
            pinnedMissing:
              entry.deck.id === user?.gameplayState?.wishlistDeckId
                ? Math.min(3, pinnedMissingCount)
                : 0,
            archiveResonance: archiveProfile.resonantDecks.has(entry.deck.id)
              ? "DECK"
              : archiveProfile.resonantTier
                ? `TIER:${archiveProfile.resonantTier}`
                : null
          }
        };
      })
    };
  }

  async resolveZoneProposals(
    discordGuildId: string,
    worldPosition: number,
    zonePositions: number[]
  ) {
    const { world, available } = await this.zonePool(discordGuildId, worldPosition);
    const proposals = zonePositions.map((position) =>
      available.find((entry) => entry.zone.position === position)
    );
    if (
      proposals.some((entry) => !entry) ||
      ![2, 3].includes(
        proposals.filter((entry) => entry?.zone.access === "FREE").length
      ) ||
      proposals.filter((entry) => entry?.zone.access === "PREMIUM").length !== 1
    ) {
      throw new AppError("Proposition de zones invalide ou expirée.", 409);
    }
    return {
      world,
      proposals: (proposals as Array<(typeof available)[number]>).map((entry) => ({
        ...entry,
        intel: {
          bands: null,
          novelty: null,
          wishlist: false,
          pinnedMissing: 0,
          archiveResonance: null
        }
      }))
    };
  }

  async rerollZone(input: {
    discordGuildId: string;
    userId: string;
    worldPosition: number;
    zonePositions: number[];
    replaceIndex: number;
    seed: string;
    operationKey: string;
  }) {
    if (input.replaceIndex < 0 || input.replaceIndex >= input.zonePositions.length) {
      throw new AppError("Route à remplacer invalide.", 400);
    }
    const guild = await this.getGuild(input.discordGuildId);
    const current = await this.resolveZoneProposals(
      input.discordGuildId,
      input.worldPosition,
      input.zonePositions
    );
    const { available } = await this.zonePool(input.discordGuildId, input.worldPosition);
    const target = current.proposals[input.replaceIndex]!;
    const candidates = available.filter(
      (entry) =>
        entry.zone.access === target.zone.access &&
        !input.zonePositions.includes(entry.zone.position)
    );
    if (candidates.length === 0) {
      throw new AppError("Aucune autre route n'est disponible pour ce reroll.", 409);
    }
    const [gameplayState, learnedSkills] = await Promise.all([
      prisma.userGameplayState.findUnique({ where: { userId: input.userId } }),
      prisma.userSkill.findMany({
        where: { userId: input.userId, rank: { gt: 0 } },
        select: { skill: { select: { effectKey: true } } }
      })
    ]);
    const skillEffects = new Set(learnedSkills.map((entry) => entry.skill.effectKey));
    const compassCheckpoint = Math.floor((gameplayState?.explorations ?? 0) / 3);
    const compassScopeKey = `explore:compass:${input.userId}:${compassCheckpoint}`;
    const compassUsed = compassCheckpoint > 0
      ? await prisma.actionCooldown.findUnique({ where: { scopeKey: compassScopeKey } })
      : null;
    const compassEligible = skillEffects.has("EXP_NAVIGATOR_GRANT_COMPASS")
      && (gameplayState?.explorations ?? 0) > 0
      && (gameplayState?.explorations ?? 0) % 3 === 0
      && !compassUsed;
    const dangerRank = new Map(
      ["CALM", "UNSTABLE", "DANGEROUS", "CRITICAL", "EXTREME"].map(
        (danger, index) => [danger, index]
      )
    );
    const noDowngrade = compassEligible
      && skillEffects.has("EXP_COMPASS_NO_DOWNGRADE")
      && compassCheckpoint % 3 === 0;
    const eligibleCandidates = noDowngrade
      ? candidates.filter((candidate) =>
          (dangerRank.get(candidate.zone.danger) ?? 0) >=
          (dangerRank.get(target.zone.danger) ?? 0)
        )
      : candidates;
    const random = createSeededRandom(input.seed);
    const candidatePool = eligibleCandidates.length > 0 ? eligibleCandidates : candidates;
    const replacementChoices =
      compassEligible &&
      skillEffects.has("EXP_COMPASS_TRIPLE_REROLL") &&
      compassCheckpoint % 3 === 0
        ? sampleUniqueIndices(candidatePool.length, Math.min(3, candidatePool.length), random)
            .map((index) => candidatePool[index]!)
        : [candidatePool[Math.floor(random() * candidatePool.length)]!];
    let replacement = replacementChoices.sort(
      (left, right) =>
        (dangerRank.get(right.zone.danger) ?? 0) - (dangerRank.get(left.zone.danger) ?? 0)
    )[0]!;
    if (
      compassEligible &&
      skillEffects.has("EXP_COMPASS_KEEP_OLD_ROUTE") &&
      (dangerRank.get(replacement.zone.danger) ?? 0) <
        (dangerRank.get(target.zone.danger) ?? 0)
    ) {
      replacement = target;
    }

    await prisma.$transaction(async (tx) => {
      const previousLedger = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: input.operationKey }
      });
      if (previousLedger) {
        return;
      }
      if (compassEligible) {
        await tx.actionCooldown.create({
          data: {
            scopeKey: compassScopeKey,
            action: "EXP_NAVIGATOR_GRANT_COMPASS",
            userId: input.userId,
            guildId: guild.id,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60_000)
          }
        });
        await tx.economicLedgerEntry.create({
          data: {
            userId: input.userId,
            guildId: guild.id,
            asset: "ITEM",
            assetKey: "navigator_compass",
            delta: 0,
            balanceBefore: 1,
            balanceAfter: 1,
            reason: "explore.compass_reroll",
            referenceType: "WorldDefinition",
            referenceId: current.world.id,
            operationKey: input.operationKey,
            metadata: {
              checkpoint: compassCheckpoint,
              replacedZonePosition: target.zone.position,
              replacementZonePosition: replacement.zone.position
            }
          }
        });
        return;
      }
      const prism = await tx.userItem.findFirst({
        where: {
          userId: input.userId,
          quantity: { gt: 0 },
          item: { contentKey: "consumable.bifurcation_prism", status: "PUBLISHED" }
        },
        include: { item: true }
      });
      if (!prism) {
        throw new AppError("Tu ne possèdes aucun Prisme de bifurcation.", 409);
      }
      const consumed = await tx.userItem.updateMany({
        where: { id: prism.id, quantity: { gt: 0 }, version: prism.version },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) {
        throw new AppError("Ton inventaire a changé. Rouvre le menu Objets.", 409);
      }
      await tx.economicLedgerEntry.create({
        data: {
          userId: input.userId,
          guildId: guild.id,
          asset: "ITEM",
          assetKey: prism.item.contentKey,
          delta: -1,
          balanceBefore: prism.quantity,
          balanceAfter: prism.quantity - 1,
          reason: "explore.route_reroll",
          referenceType: "world",
          referenceId: current.world.id,
          operationKey: input.operationKey,
          metadata: {
            replacedZonePosition: target.zone.position,
            replacementZonePosition: replacement.zone.position
          }
        }
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });

    const zonePositions = [...input.zonePositions];
    zonePositions[input.replaceIndex] = replacement.zone.position;
    return this.resolveZoneProposals(input.discordGuildId, input.worldPosition, zonePositions);
  }

  async analyzeProposedZone(input: {
    discordGuildId: string;
    userId: string;
    worldPosition: number;
    zonePositions: number[];
    analyzeIndex: number;
  }) {
    if (input.analyzeIndex < 0 || input.analyzeIndex >= input.zonePositions.length) {
      throw new AppError("Route à analyser invalide.", 400);
    }
    const proposal = await this.resolveZoneProposals(
      input.discordGuildId,
      input.worldPosition,
      input.zonePositions
    );
    const selected = proposal.proposals[input.analyzeIndex]!;
    const [scanner, learnedSkills] = await Promise.all([
      prisma.equippedArtifact.findFirst({
        where: {
          userId: input.userId,
          item: { contentKey: "artifact.spectral_scanner", status: "PUBLISHED" }
        }
      }),
      prisma.userSkill.findMany({
        where: { userId: input.userId, rank: { gt: 0 } },
        select: { skill: { select: { effectKey: true } } }
      })
    ]);
    if (!scanner) {
      throw new AppError(
        "Équipe le Scanner spectral depuis ton profil avant de l'utiliser.",
        409
      );
    }

    const proposalHash = createHash("sha256")
      .update(`${input.worldPosition}:${input.zonePositions.join(",")}`)
      .digest("hex")
      .slice(0, 16);
    const skillEffects = new Set(learnedSkills.map((entry) => entry.skill.effectKey));
    const scanLimit = skillEffects.has("EXP_SCANNER_COMPARE_TWO_ROUTES") ? 2 : 1;
    const scanPrefix = `explore:scan:${input.userId}:${proposalHash}:`;
    const scopeKey = `${scanPrefix}${input.analyzeIndex}`;
    const action = `explore.scan:${selected.zone.id}`;
    const existingScans = await prisma.actionCooldown.count({
      where: {
        scopeKey: { startsWith: scanPrefix },
        expiresAt: { gt: new Date() }
      }
    });
    const sameScan = await prisma.actionCooldown.findUnique({ where: { scopeKey } });
    if (!sameScan && existingScans >= scanLimit) {
      throw new AppError(
        `Le Scanner a déjà analysé ${scanLimit} route(s) sur ce tirage.`,
        409
      );
    }
    const scanState = await prisma.actionCooldown.upsert({
      where: { scopeKey },
      update: {},
      create: {
        scopeKey,
        action,
        userId: input.userId,
        expiresAt: new Date(Date.now() + 10 * 60_000)
      }
    });
    if (scanState.action !== action) {
      throw new AppError("Le Scanner a déjà analysé une autre route de cette exploration.", 409);
    }

    const activeTierEffect = await prisma.userItemEffect.findUnique({
      where: {
        userId_effectKey: {
          userId: input.userId,
          effectKey: "EXP_TIER_WEIGHT_BOOST"
        }
      }
    });
    const validTierTarget =
      activeTierEffect &&
      activeTierEffect.remainingUses > 0 &&
      (!activeTierEffect.expiresAt || activeTierEffect.expiresAt > new Date())
        ? activeTierEffect.targetKey as CoreRarity | null
        : null;
    const weights = rarityWeightsForRoute(
      dangerProfile(selected.zone.danger),
      selected.zone.access === "PREMIUM",
      validTierTarget
    );
    const percentages = roundedRarityPercentages(weights);
    const standard = (percentages.Common ?? 0) + (percentages.Uncommon ?? 0);
    const rare = (percentages.Rare ?? 0) + (percentages["Very Rare"] ?? 0);
    const exceptional =
      (percentages.Import ?? 0) +
      (percentages.Exotic ?? 0) +
      (percentages["Black Market"] ?? 0);

    return {
      world: proposal.world,
      zone: selected.zone,
      deck: selected.deck,
      bands: { standard, rare, exceptional },
      exactPercentages: skillEffects.has("EXP_SCANNER_EXACT_TIER_GROUPS")
        ? percentages
        : null,
      scansRemaining: Math.max(0, scanLimit - existingScans - (sameScan ? 0 : 1))
    };
  }

  async activateTierIncense(input: {
    userId: string;
    contentKey: keyof typeof tierIncenseTargets;
    operationKey: string;
    useHourglass?: boolean;
  }) {
    const targetRarity = tierIncenseTargets[input.contentKey];
    if (!targetRarity) {
      throw new AppError("Encens de tier invalide.", 400);
    }
    const ledgerOperationKey = `${input.operationKey}:tier-incense`;

    return prisma.$transaction(async (tx) => {
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: ledgerOperationKey }
      });
      if (replay) {
        return {
          contentKey: input.contentKey,
          targetRarity,
          remainingUses: TIER_INCENSE_USES,
          replayed: true
        };
      }

      await assertExplorationConsumableSlot(tx, input.userId, "EXP_TIER_WEIGHT_BOOST");
      const active = await tx.userItemEffect.findUnique({
        where: {
          userId_effectKey: {
            userId: input.userId,
            effectKey: "EXP_TIER_WEIGHT_BOOST"
          }
        }
      });
      if (active && active.remainingUses > 0) {
        throw new AppError(
          `Un Encens ${active.targetKey ?? ""} est déjà actif pour ${active.remainingUses} exploration(s).`,
          409
        );
      }

      const owned = await tx.userItem.findFirst({
        where: {
          userId: input.userId,
          quantity: { gt: 0 },
          item: { contentKey: input.contentKey, status: "PUBLISHED" }
        },
        include: { item: true }
      });
      if (!owned) {
        throw new AppError("Tu ne possèdes pas cet Encens.", 409);
      }
      const incenseUses = await incenseUsesWithHourglass(
        tx,
        input.userId,
        input.useHourglass === true
      );
      const consumed = await tx.userItem.updateMany({
        where: {
          id: owned.id,
          quantity: { gt: 0 },
          version: owned.version
        },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) {
        throw new AppError("Ton inventaire a changé. Rouvre le menu Objets.", 409);
      }
      await tx.userItemEffect.upsert({
        where: {
          userId_effectKey: {
            userId: input.userId,
            effectKey: "EXP_TIER_WEIGHT_BOOST"
          }
        },
        update: {
          itemId: owned.itemId,
          targetKey: targetRarity,
          remainingUses: incenseUses,
          activatedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
          version: { increment: 1 },
          metadata: { sourceItemKey: input.contentKey }
        },
        create: {
          userId: input.userId,
          itemId: owned.itemId,
          effectKey: "EXP_TIER_WEIGHT_BOOST",
          targetKey: targetRarity,
          remainingUses: incenseUses,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
          metadata: { sourceItemKey: input.contentKey }
        }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId: input.userId,
          asset: "ITEM",
          assetKey: input.contentKey,
          delta: -1,
          balanceBefore: owned.quantity,
          balanceAfter: owned.quantity - 1,
          reason: "explore.tier_incense_activated",
          referenceType: "ItemDefinition",
          referenceId: owned.itemId,
          operationKey: ledgerOperationKey,
          metadata: {
            targetRarity,
            remainingUses: incenseUses,
            hourglass: input.useHourglass === true
          }
        }
      });
      return {
        contentKey: input.contentKey,
        targetRarity,
        remainingUses: incenseUses,
        replayed: false
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
  }

  async activateAffinityIncense(input: {
    userId: string;
    deckId: string;
    operationKey: string;
    useHourglass?: boolean;
  }) {
    const [wishlistState, wishlistSkill] = await Promise.all([
      prisma.userGameplayState.findUnique({
        where: { userId: input.userId },
        select: { wishlistDeckId: true }
      }),
      prisma.userSkill.findFirst({
        where: {
          userId: input.userId,
          rank: { gt: 0 },
          skill: { effectKey: "COL_DECK_WISHLIST", status: "PUBLISHED" }
        },
        select: { id: true }
      })
    ]);
    const wishlistBonus =
      wishlistSkill && wishlistState?.wishlistDeckId === input.deckId ? 1 : 0;
    const ledgerOperationKey = `${input.operationKey}:affinity-incense`;
    return prisma.$transaction(async (tx) => {
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: ledgerOperationKey }
      });
      if (replay) {
        return {
          deckId: input.deckId,
          remainingUses: Number(
            replay.metadata &&
            typeof replay.metadata === "object" &&
            !Array.isArray(replay.metadata)
              ? (replay.metadata as Record<string, unknown>).remainingUses
              : AFFINITY_INCENSE_USES
          ),
          replayed: true
        };
      }
      await assertExplorationConsumableSlot(tx, input.userId, "EXP_DECK_WEIGHT_BOOST");
      const deck = await tx.deck.findFirst({
        where: { id: input.deckId, status: "PUBLISHED", isActive: true }
      });
      if (!deck) throw new AppError("Deck d'affinité introuvable.", 404);
      const active = await tx.userItemEffect.findUnique({
        where: {
          userId_effectKey: {
            userId: input.userId,
            effectKey: "EXP_DECK_WEIGHT_BOOST"
          }
        }
      });
      if (active && active.remainingUses > 0) {
        throw new AppError(
          `Un Encens d'affinité est déjà actif pour ${active.remainingUses} exploration(s).`,
          409
        );
      }
      const owned = await tx.userItem.findFirst({
        where: {
          userId: input.userId,
          quantity: { gt: 0 },
          item: { contentKey: "consumable.affinity_incense", status: "PUBLISHED" }
        },
        include: { item: true }
      });
      if (!owned) throw new AppError("Tu ne possèdes aucun Encens d'affinité.", 409);
      const incenseUses = await incenseUsesWithHourglass(
        tx,
        input.userId,
        input.useHourglass === true
      );
      const consumed = await tx.userItem.updateMany({
        where: { id: owned.id, quantity: { gt: 0 }, version: owned.version },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) {
        throw new AppError("Ton inventaire a changé. Rouvre le menu Objets.", 409);
      }
      await tx.userItemEffect.upsert({
        where: {
          userId_effectKey: {
            userId: input.userId,
            effectKey: "EXP_DECK_WEIGHT_BOOST"
          }
        },
        update: {
          itemId: owned.itemId,
          targetKey: deck.id,
          remainingUses: incenseUses + wishlistBonus,
          activatedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
          version: { increment: 1 },
          metadata: {
            deckName: deck.name,
            hourglass: input.useHourglass === true,
            wishlistBonus
          }
        },
        create: {
          userId: input.userId,
          itemId: owned.itemId,
          effectKey: "EXP_DECK_WEIGHT_BOOST",
          targetKey: deck.id,
          remainingUses: incenseUses + wishlistBonus,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
          metadata: {
            deckName: deck.name,
            hourglass: input.useHourglass === true,
            wishlistBonus
          }
        }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId: input.userId,
          asset: "ITEM",
          assetKey: owned.item.contentKey,
          delta: -1,
          balanceBefore: owned.quantity,
          balanceAfter: owned.quantity - 1,
          reason: "explore.affinity_incense_activated",
          referenceType: "Deck",
          referenceId: deck.id,
          operationKey: ledgerOperationKey,
          metadata: {
            deckName: deck.name,
            remainingUses: incenseUses + wishlistBonus,
            multiplier: 2,
            wishlistBonus
          }
        }
      });
      return {
        deckId: deck.id,
        deckName: deck.name,
        remainingUses: incenseUses + wishlistBonus,
        replayed: false
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createEncounter(input: {
    discordGuildId: string;
    userId: string;
    channelId: string;
    worldPosition: number;
    zonePosition: number;
    deckId: string;
    premiumPayment?: "PASS" | "CREDITS";
    operationKey: string;
  }) {
    const guild = await this.getGuild(input.discordGuildId);
    const selection = await this.listZoneDecks(
      input.discordGuildId,
      input.worldPosition,
      input.zonePosition,
      input.userId
    );
    if (!selection.decks.some((deck) => deck.id === input.deckId)) {
      throw new AppError("Ce deck n'est pas disponible dans cette zone.", 400);
    }

    await prisma.encounter.updateMany({
      where: {
        guildId: guild.id,
        status: "ACTIVE",
        closesAt: { lte: new Date() }
      },
      data: { status: "EXPIRED", resolvedAt: new Date(), version: { increment: 1 } }
    });
    const activeEncounter = await prisma.encounter.findFirst({
      where: {
        guildId: guild.id,
        initiatorUserId: input.userId,
        status: "ACTIVE",
        initiatorResolvedAt: null,
        closesAt: { gt: new Date() }
      },
      select: { id: true }
    });
    if (activeEncounter) {
      throw new AppError(
        "Tu as déjà une capture privée en cours. Termine-la avant de lancer une nouvelle expédition.",
        409
      );
    }

    const allCards = await prisma.card.findMany({
      where: {
        deckId: input.deckId,
        source: "vault",
        status: "PUBLISHED",
        isActive: true
      },
      include: { deck: true, rarity: true }
    });
    const compatibleCards = allCards.filter((card) =>
      cardMetadata(card.rarityFactors).compatibleZoneNames.includes(selection.zone.name)
    );
    if (compatibleCards.length === 0) {
      throw new AppError("Aucune carte compatible n'est publiée dans cette zone.", 409);
    }

    const [
      activeTierEffect,
      activeAffinityEffect,
      minionBossRun,
      gameplayState,
      learnedSkills,
      archiveVault,
      archivedCards,
      chainReadyState,
      secretRouteState
    ] = await Promise.all([
      prisma.userItemEffect.findUnique({
        where: {
          userId_effectKey: {
            userId: input.userId,
            effectKey: "EXP_TIER_WEIGHT_BOOST"
          }
        }
      }),
      prisma.userItemEffect.findUnique({
        where: {
          userId_effectKey: {
            userId: input.userId,
            effectKey: "EXP_DECK_WEIGHT_BOOST"
          }
        }
      }),
      prisma.bossRun.findFirst({
        where: {
          guildId: guild.id,
          status: "ACTIVE",
          mechanic: "EXPEDITION_MINION",
          endsAt: { gt: new Date() },
          definition: { worldId: selection.world.id }
        },
        include: { definition: true },
        orderBy: [
          { isPersistent: "desc" },
          { startsAt: "asc" }
        ]
      }),
      prisma.userGameplayState.findUnique({ where: { userId: input.userId } }),
      prisma.userSkill.findMany({
        where: { userId: input.userId, rank: { gt: 0 } },
        select: { skill: { select: { effectKey: true } } }
      }),
      prisma.equippedArtifact.findFirst({
        where: {
          userId: input.userId,
          item: { effectKey: "EXP_ARCHIVE_RESONANCE", status: "PUBLISHED" }
        },
        select: { id: true }
      }),
      prisma.archivedCard.findMany({
        where: { userId: input.userId },
        include: {
          inventoryItem: {
            include: {
              card: {
                select: { deckId: true, rarity: { select: { name: true } } }
              }
            }
          }
        }
      }),
      prisma.actionCooldown.findUnique({
        where: { scopeKey: `pioneer-chain-ready:${input.userId}` }
      }),
      prisma.actionCooldown.findUnique({
        where: { scopeKey: `pioneer-secret-route-ready:${input.userId}` }
      })
    ]);
    const skillEffects = new Set(learnedSkills.map((entry) => entry.skill.effectKey));
    const gameplayCounters = jsonRecord(gameplayState?.counters);
    const voidTraces = Math.max(0, Number(gameplayCounters.voidTraces ?? 0));
    const darkHunt =
      skillEffects.has("HUN_SHADOW_GRANT_LANTERN") && voidTraces >= 9;
    const pioneerChain = Boolean(
      skillEffects.has("EXP_PIONEER_GRANT_BEACON") &&
      chainReadyState &&
      chainReadyState.expiresAt > new Date()
    );
    const secretRoute = Boolean(
      skillEffects.has("EXP_SECRET_ROUTE") &&
      secretRouteState &&
      secretRouteState.expiresAt > new Date()
    );
    const validTierEffect =
      activeTierEffect &&
      activeTierEffect.remainingUses > 0 &&
      (!activeTierEffect.expiresAt || activeTierEffect.expiresAt > new Date())
        ? activeTierEffect
        : null;
    const seed = randomUUID();
    const random = createSeededRandom(seed);
    const archiveProfile = archiveVault
      ? archiveResonanceProfile(archivedCards)
      : { resonantDecks: new Set<string>(), resonantTier: null };
    const archiveTier =
      archiveProfile.resonantDecks.has(input.deckId) ? null : archiveProfile.resonantTier;
    const encounterDanger = darkHunt
      ? "Extreme"
      : dangerProfile(selection.zone.danger);
    const rarityWeights = applyRarityWeightMultiplier(
      rarityWeightsForRoute(
        encounterDanger,
        selection.zone.access === "PREMIUM",
        validTierEffect?.targetKey as CoreRarity | null | undefined
      ),
      archiveTier,
      archiveTier ? ARCHIVE_TIER_MULTIPLIER[archiveTier] ?? 1 : 1
    );
    let desiredRarity = rollLimitedRarity(rarityWeights, random);
    if (skillEffects.has("HUN_RARE_PITY") && (gameplayState?.rareMissStreak ?? 0) >= 9) {
      desiredRarity = atLeastRarity(desiredRarity, "Rare");
    }
    if (secretRoute) {
      desiredRarity = atLeastRarity(desiredRarity, "Rare");
    }
    if (
      darkHunt &&
      skillEffects.has("HUN_VOID_EXOTIC_PITY") &&
      (gameplayState?.darkHuntMissStreak ?? 0) >= 3
    ) {
      desiredRarity = atLeastRarity(desiredRarity, "Exotic");
    }
    const rarityPool = compatibleCards.filter((card) => card.rarity.name === desiredRarity);
    const playablePool = (rarityPool.length > 0 ? rarityPool : compatibleCards).filter((card) => {
      const metadata = cardMetadata(card.rarityFactors);
      return Boolean(card.imageUrl || metadata.captureHint);
    });
    const pool = playablePool.length > 0 ? playablePool : rarityPool.length > 0 ? rarityPool : compatibleCards;
    const card = pool[Math.floor(random() * pool.length)]!;
    let alternativeCard: typeof card | null = null;
    let darkHuntProfiles: Array<{
      danger: DangerProfile;
      potentialRarity: CoreRarity;
      deckId: string;
      deckName: string;
    }> | null = null;
    const darkComparisonEligible =
      darkHunt && skillEffects.has("HUN_VOID_COMPARE_HUNTS");
    if (darkComparisonEligible) {
      const alternativeDecks = selection.decks.filter((deck) => deck.id !== input.deckId);
      const profileDeck = alternativeDecks.length > 0
        ? alternativeDecks[Math.floor(random() * alternativeDecks.length)]!
        : selection.decks.find((deck) => deck.id === input.deckId)!;
      const profileCards = await prisma.card.findMany({
        where: {
          deckId: profileDeck.id,
          source: "vault",
          status: "PUBLISHED",
          isActive: true
        },
        include: { deck: true, rarity: true }
      });
      const compatibleProfileCards = profileCards.filter((candidate) =>
        cardMetadata(candidate.rarityFactors).compatibleZoneNames.includes(
          selection.zone.name
        )
      );
      if (compatibleProfileCards.length > 0) {
        const alternativeDanger: DangerProfile = random() < 0.5
          ? "Critical"
          : "Extreme";
        const alternativeArchiveTier =
          archiveProfile.resonantDecks.has(profileDeck.id)
            ? null
            : archiveProfile.resonantTier;
        const alternativeWeights = applyRarityWeightMultiplier(
          rarityWeightsForRoute(
            alternativeDanger,
            selection.zone.access === "PREMIUM",
            validTierEffect?.targetKey as CoreRarity | null | undefined
          ),
          alternativeArchiveTier,
          alternativeArchiveTier
            ? ARCHIVE_TIER_MULTIPLIER[alternativeArchiveTier] ?? 1
            : 1
        );
        let alternativeRarity = rollLimitedRarity(alternativeWeights, random);
        if (
          skillEffects.has("HUN_RARE_PITY") &&
          (gameplayState?.rareMissStreak ?? 0) >= 9
        ) {
          alternativeRarity = atLeastRarity(alternativeRarity, "Rare");
        }
        if (
          skillEffects.has("HUN_VOID_EXOTIC_PITY") &&
          (gameplayState?.darkHuntMissStreak ?? 0) >= 3
        ) {
          alternativeRarity = atLeastRarity(alternativeRarity, "Exotic");
        }
        const alternativeRarityPool = compatibleProfileCards.filter(
          (candidate) => candidate.rarity.name === alternativeRarity
        );
        const alternativePool =
          alternativeRarityPool.length > 0
            ? alternativeRarityPool
            : compatibleProfileCards;
        alternativeCard =
          alternativePool[Math.floor(random() * alternativePool.length)] ?? null;
        if (alternativeCard?.id === card.id) {
          alternativeCard =
            alternativePool.find((candidate) => candidate.id !== card.id) ?? null;
        }
        if (alternativeCard) {
          darkHuntProfiles = [
            {
              danger: encounterDanger,
              potentialRarity: desiredRarity,
              deckId: card.deckId,
              deckName: card.deck.name
            },
            {
              danger: alternativeDanger,
              potentialRarity: alternativeRarity,
              deckId: alternativeCard.deckId,
              deckName: alternativeCard.deck.name
            }
          ];
        }
      }
    }
    if (!alternativeCard) {
      const alternativePool = compatibleCards.filter(
        (candidate) => candidate.id !== card.id
      );
      const targetChoiceEligible =
        skillEffects.has("HUN_EXTRA_TARGET_CHOICE") &&
        ((gameplayState?.explorations ?? 0) + 1) % 3 === 0 &&
        alternativePool.length > 0;
      alternativeCard = targetChoiceEligible
        ? alternativePool[Math.floor(random() * alternativePool.length)]!
        : null;
    }
    const bossMinion = Boolean(minionBossRun && random() < 0.35);
    const explorationEvent = explorationEventFromRoll(random());
    const now = new Date();
    const closesAt = new Date(now.getTime() + ENCOUNTER_DURATION_MS);
    const seedHash = createHash("sha256").update(seed).digest("hex");

    const creation = await prisma.$transaction(async (tx) => {
      const energy = await explorationEnergyService.consumeInTransaction(
        tx,
        input.userId,
        now
      );
      const chargeBalanceAfterConsumption = energy.after;
      let chainChargeRefunded = false;
      if (pioneerChain) {
        await tx.actionCooldown.deleteMany({
          where: { scopeKey: `pioneer-chain-ready:${input.userId}` }
        });
        const refundScopeKey =
          `pioneer-chain-refund:${input.userId}:${now.toISOString().slice(0, 10)}`;
        const refundAlreadyRolled = await tx.actionCooldown.findUnique({
          where: { scopeKey: refundScopeKey }
        });
        if (
          !refundAlreadyRolled &&
          skillEffects.has("EXP_CHAIN_CHARGE_REFUND")
        ) {
          chainChargeRefunded = energy.consumed && random() < 0.33;
          await tx.actionCooldown.create({
            data: {
              scopeKey: refundScopeKey,
              action: "EXP_CHAIN_CHARGE_REFUND",
              userId: input.userId,
              guildId: guild.id,
              expiresAt: nextUtcMidnight(now)
            }
          });
          if (chainChargeRefunded) {
            const refundedCharges = Math.min(
              energy.snapshot.maxCharges,
              energy.snapshot.charges + 1
            );
            const full = refundedCharges >= energy.snapshot.maxCharges;
            await tx.user.update({
              where: { id: input.userId },
              data: {
                explorationCharges: refundedCharges,
                explorationRegenAt: full ? null : energy.snapshot.regenStartedAt
              }
            });
            energy.after = refundedCharges;
            energy.snapshot.charges = refundedCharges;
            energy.snapshot.regenStartedAt = full ? null : energy.snapshot.regenStartedAt;
            energy.snapshot.nextChargeAt = full ? null : energy.snapshot.nextChargeAt;
          }
        }
      }
      if (secretRoute) {
        await tx.actionCooldown.deleteMany({
          where: { scopeKey: `pioneer-secret-route-ready:${input.userId}` }
        });
      }
      await tx.guildMember.upsert({
        where: { guildId_userId: { guildId: guild.id, userId: input.userId } },
        update: { isActive: true, lastActiveAt: now },
        create: { guildId: guild.id, userId: input.userId, isActive: true, lastActiveAt: now }
      });
      if (selection.requiresPremiumAccess && input.premiumPayment === "PASS") {
        const expeditionPass = await tx.userItem.findFirst({
          where: {
            userId: input.userId,
            quantity: { gt: 0 },
            item: { contentKey: "consumable.expedition_pass", status: "PUBLISHED" }
          },
          include: { item: true }
        });
        if (!expeditionPass) {
          throw new AppError("Ton Pass d’expédition n'est plus disponible.", 409);
        }
        const consumed = await tx.userItem.updateMany({
          where: {
            id: expeditionPass.id,
            quantity: { gt: 0 },
            version: expeditionPass.version
          },
          data: { quantity: { decrement: 1 }, version: { increment: 1 } }
        });
        if (consumed.count !== 1) {
          throw new AppError("Ton inventaire a changé. Relance l'exploration.", 409);
        }
        await tx.economicLedgerEntry.create({
          data: {
            userId: input.userId,
            guildId: guild.id,
            asset: "ITEM",
            assetKey: expeditionPass.item.contentKey,
            delta: -1,
            balanceBefore: expeditionPass.quantity,
            balanceAfter: expeditionPass.quantity - 1,
            reason: "explore.premium_zone_pass",
            referenceType: "zone",
            referenceId: selection.zone.id,
            operationKey: `${input.operationKey}:expedition-pass`
          }
        });
      } else if (selection.requiresPremiumAccess && input.premiumPayment === "CREDITS") {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`
        );
        const premiumUser = await tx.user.findUnique({ where: { id: input.userId } });
        if (!premiumUser) {
          throw new AppError("Profil joueur introuvable.", 404);
        }
        if (premiumUser.credits < selection.premiumCreditCost) {
          throw new AppError(
            `Il te faut ${selection.premiumCreditCost} crédit(s) pour cette zone premium.`,
            409
          );
        }
        await tx.user.update({
          where: { id: input.userId },
          data: {
            credits: { decrement: selection.premiumCreditCost },
            balanceVersion: { increment: 1 }
          }
        });
        await tx.economicLedgerEntry.create({
          data: {
            userId: input.userId,
            guildId: guild.id,
            asset: "CREDITS",
            delta: -selection.premiumCreditCost,
            balanceBefore: premiumUser.credits,
            balanceAfter: premiumUser.credits - selection.premiumCreditCost,
            reason: "explore.premium_zone_credits",
            referenceType: "zone",
            referenceId: selection.zone.id,
            operationKey: `${input.operationKey}:premium-credits`
          }
        });
        await tx.transactionLog.create({
          data: {
            userId: input.userId,
            type: "premium_zone",
            amount: -selection.premiumCreditCost,
            metadata: {
              zoneId: selection.zone.id,
              operationKey: input.operationKey
            }
          }
        });
        await tx.economyLog.create({
          data: {
            userId: input.userId,
            type: "premium_zone",
            amount: selection.premiumCreditCost,
            metadata: {
              zoneId: selection.zone.id,
              operationKey: input.operationKey
            }
          }
        });
      } else if (selection.requiresPremiumAccess) {
        throw new AppError(
          "Choisis un Pass d’expédition ou le paiement en crédits.",
          409
        );
      }

      if (validTierEffect) {
        const decremented = await tx.userItemEffect.updateMany({
          where: {
            id: validTierEffect.id,
            remainingUses: { gt: 0 },
            version: validTierEffect.version
          },
          data: {
            remainingUses: { decrement: 1 },
            version: { increment: 1 }
          }
        });
        if (decremented.count !== 1) {
          throw new AppError(
            "Ton Encens actif a été utilisé ailleurs. Relance l'exploration.",
            409
          );
        }
      }
      const validAffinityEffect =
        activeAffinityEffect &&
        activeAffinityEffect.remainingUses > 0 &&
        (!activeAffinityEffect.expiresAt || activeAffinityEffect.expiresAt > now)
          ? activeAffinityEffect
          : null;
      if (validAffinityEffect) {
        const decremented = await tx.userItemEffect.updateMany({
          where: {
            id: validAffinityEffect.id,
            remainingUses: { gt: 0 },
            version: validAffinityEffect.version
          },
          data: { remainingUses: { decrement: 1 }, version: { increment: 1 } }
        });
        if (decremented.count !== 1) {
          throw new AppError(
            "Ton Encens d'affinité a été utilisé ailleurs. Relance l'exploration.",
            409
          );
        }
      }
      const created = await tx.encounter.create({
        data: {
          guildId: guild.id,
          zoneId: selection.zone.id,
          cardId: card.id,
          bossRunId: bossMinion ? minionBossRun?.id : null,
          initiatorUserId: input.userId,
          bossMinion,
          tierIncenseTarget: validTierEffect?.targetKey ?? null,
          eventKey: explorationEvent?.key ?? null,
          eventSpecial: explorationEvent?.isSpecial ?? false,
          eventMetadata: explorationEvent
            ? {
                label: explorationEvent.label,
                xpMultiplier: explorationEvent.xpMultiplier,
                creditMultiplier: explorationEvent.creditMultiplier,
                darkHunt,
                targetChoiceIds: alternativeCard
                  ? [card.id, alternativeCard.id]
                  : undefined,
                targetChoiceSelected: alternativeCard ? false : undefined,
                darkProfileChoice: Boolean(darkHuntProfiles),
                darkHuntProfiles: darkHuntProfiles ?? undefined,
                pioneerChain,
                secretRoute
              }
            : darkHunt || alternativeCard || pioneerChain || secretRoute
              ? {
                  darkHunt,
                  targetChoiceIds: alternativeCard
                    ? [card.id, alternativeCard.id]
                    : undefined,
                  targetChoiceSelected: alternativeCard ? false : undefined,
                  darkProfileChoice: Boolean(darkHuntProfiles),
                  darkHuntProfiles: darkHuntProfiles ?? undefined,
                  pioneerChain,
                  secretRoute
                }
              : Prisma.JsonNull,
          channelId: input.channelId,
          status: "ACTIVE",
          seedHash,
          opensAt: now,
          closesAt
        }
      });
      await tx.userGameplayState.upsert({
        where: { userId: input.userId },
        update: {
          explorations: { increment: 1 },
          counters: darkHunt
            ? {
                ...gameplayCounters,
                voidTraces: Math.max(0, voidTraces - 9),
                darkHunts: Math.max(0, Number(gameplayCounters.darkHunts ?? 0)) + 1
              }
            : undefined,
          version: { increment: 1 }
        },
        create: {
          userId: input.userId,
          explorations: 1,
          counters: darkHunt
            ? {
                ...gameplayCounters,
                voidTraces: Math.max(0, voidTraces - 9),
                darkHunts: 1
              }
            : Prisma.JsonNull
        }
      });
      await tx.scheduledJob.create({
        data: {
          queue: "gameplay",
          type: "encounter.expire",
          dedupeKey: `encounter.expire:${created.id}`,
          payload: { encounterId: created.id },
          runAt: closesAt
        }
      });
      if (energy.consumed) {
        await tx.economicLedgerEntry.create({
          data: {
            userId: input.userId,
            guildId: guild.id,
            asset: "EXPLORATION_CHARGE",
            assetKey: "exploration",
            delta: -1,
            balanceBefore: energy.before,
            balanceAfter: chargeBalanceAfterConsumption,
            reason: "explore.encounter_created",
            referenceType: "Encounter",
            referenceId: created.id,
            operationKey: `${input.operationKey}:exploration-charge`,
            metadata: {
              maxCharges: energy.snapshot.maxCharges,
              regenIntervalMinutes: energy.snapshot.regenIntervalMinutes,
              nextChargeAt: energy.snapshot.nextChargeAt?.toISOString() ?? null
            }
          }
        });
        await tx.transactionLog.create({
          data: {
            userId: input.userId,
            type: "exploration_charge",
            amount: -1,
            metadata: {
              encounterId: created.id,
              operationKey: input.operationKey,
              chargesAfter: energy.after
            }
          }
        });
        if (chainChargeRefunded) {
          await tx.economicLedgerEntry.create({
            data: {
              userId: input.userId,
              guildId: guild.id,
              asset: "EXPLORATION_CHARGE",
              assetKey: "exploration",
              delta: 1,
              balanceBefore: chargeBalanceAfterConsumption,
              balanceAfter: energy.after,
              reason: "explore.chain_charge_refund",
              referenceType: "Encounter",
              referenceId: created.id,
              operationKey: `${input.operationKey}:chain-refund`,
              metadata: { probability: 0.33 }
            }
          });
        }
      }
      return {
        encounter: created,
        energy: energy.snapshot,
        chainChargeRefunded
      };
    }).catch(async (error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const activeForPlayer = await prisma.encounter.findFirst({
          where: {
            guildId: guild.id,
            initiatorUserId: input.userId,
            status: "ACTIVE",
            initiatorResolvedAt: null,
            closesAt: { gt: new Date() }
          },
          select: { id: true }
        });
        if (activeForPlayer) {
          throw new AppError(
            "Tu as déjà une capture privée en cours. Termine-la avant de lancer une nouvelle expédition.",
            409
          );
        }
      }
      throw error;
    });

    return {
      encounter: creation.encounter,
      energy: creation.energy,
      card,
      alternativeCard,
      world: selection.world,
      zone: selection.zone,
      premiumPayment: selection.requiresPremiumAccess ? input.premiumPayment ?? null : null,
      pioneer: pioneerChain || secretRoute
        ? {
            chained: pioneerChain,
            chargeRefunded: creation.chainChargeRefunded,
            secretRoute
          }
        : null,
      tierIncense: validTierEffect
        ? {
            targetRarity: validTierEffect.targetKey,
            remainingUses: validTierEffect.remainingUses - 1
          }
        : null,
      archiveResonance: archiveProfile.resonantDecks.has(input.deckId)
        ? { type: "DECK" as const, target: card.deck.name, multiplier: 1.5 }
        : archiveTier
          ? {
              type: "TIER" as const,
              target: archiveTier,
              multiplier: ARCHIVE_TIER_MULTIPLIER[archiveTier] ?? 1
            }
          : null,
      bossInfluence: bossMinion && minionBossRun
        ? {
            runId: minionBossRun.id,
            bossName: minionBossRun.definition.name
          }
        : null,
      event: explorationEvent,
      darkHunt: darkHunt
        ? {
            profile: encounterDanger,
            profiles: darkHuntProfiles,
            pityActive:
              skillEffects.has("HUN_VOID_EXOTIC_PITY") &&
              (gameplayState?.darkHuntMissStreak ?? 0) >= 3
          }
        : null,
      hint: cardMetadata(card.rarityFactors).captureHint
    };
  }

  async attachEncounterMessage(encounterId: string, messageId: string) {
    const attached = await prisma.encounter.updateMany({
      where: {
        id: encounterId,
        publicationClaimedAt: { not: null },
        publishedAt: null,
        messageId: null,
        status: "ACTIVE"
      },
      data: {
        messageId,
        publishedAt: new Date(),
        publicationClaimedAt: null,
        version: { increment: 1 }
      }
    });
    if (attached.count === 1) return true;

    const existing = await prisma.encounter.findFirst({
      where: { id: encounterId, messageId, publishedAt: { not: null } },
      select: { id: true }
    });
    return Boolean(existing);
  }

  async scheduleEncounterPublication(
    encounterId: string,
    initiatorUserId: string,
    publishAfter: Date
  ) {
    const publicClosesAt = new Date(
      publishAfter.getTime() + ENCOUNTER_DURATION_MS
    );
    const scheduled = await prisma.$transaction(async (tx) => {
      const updated = await tx.encounter.updateMany({
        where: {
          id: encounterId,
          initiatorUserId,
          initiatorResolvedAt: { not: null },
          publishAfter: null,
          publishedAt: null,
          messageId: null,
          status: "ACTIVE"
        },
        data: {
          publishAfter,
          closesAt: publicClosesAt,
          version: { increment: 1 }
        }
      });
      if (updated.count !== 1) return false;
      await tx.scheduledJob.updateMany({
        where: {
          dedupeKey: `encounter.expire:${encounterId}`,
          status: "PENDING"
        },
        data: { runAt: publicClosesAt }
      });
      return true;
    });
    return scheduled ? { publishAfter, closesAt: publicClosesAt } : null;
  }

  claimEncounterPublication(encounterId: string, now = new Date()) {
    return prisma.encounter.updateMany({
      where: {
        id: encounterId,
        initiatorResolvedAt: { not: null },
        publishAfter: { lte: now },
        publicationClaimedAt: null,
        publishedAt: null,
        messageId: null,
        status: "ACTIVE",
        closesAt: { gt: now }
      },
      data: {
        publicationClaimedAt: now,
        version: { increment: 1 }
      }
    });
  }

  releaseEncounterPublication(encounterId: string) {
    return prisma.encounter.updateMany({
      where: {
        id: encounterId,
        messageId: null,
        publishedAt: null,
        publicationClaimedAt: { not: null }
      },
      data: {
        publicationClaimedAt: null,
        version: { increment: 1 }
      }
    });
  }

  cancelEncounter(encounterId: string) {
    return prisma.encounter.updateMany({
      where: { id: encounterId, status: { in: ["SCHEDULED", "ACTIVE"] } },
      data: { status: "CANCELLED", resolvedAt: new Date(), version: { increment: 1 } }
    });
  }

  async revealEncounterHint(encounterId: string, userId: string) {
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: { card: true }
    });
    if (!encounter) {
      throw new AppError("Rencontre introuvable.", 404);
    }
    if (encounter.status !== "ACTIVE" || encounter.closesAt <= new Date()) {
      throw new AppError("Cette rencontre est terminée.", 409);
    }
    const hint = cardMetadata(encounter.card.rarityFactors).captureHint;
    if (!hint) {
      throw new AppError("Cette carte ne possède aucun indice révélable.", 409);
    }
    const operationKey = `explore:hint:${encounterId}:${userId}`;

    await prisma.$transaction(async (tx) => {
      const previous = await tx.economicLedgerEntry.findUnique({
        where: { operationKey }
      });
      if (previous) {
        return;
      }
      const elixir = await tx.userItem.findFirst({
        where: {
          userId,
          quantity: { gt: 0 },
          item: { contentKey: "consumable.lucidity_elixir", status: "PUBLISHED" }
        },
        include: { item: true }
      });
      if (!elixir) {
        throw new AppError("Tu ne possèdes aucun Élixir de lucidité.", 409);
      }
      const consumed = await tx.userItem.updateMany({
        where: { id: elixir.id, quantity: { gt: 0 }, version: elixir.version },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) {
        throw new AppError("Ton inventaire a changé. Rouvre le menu Objets.", 409);
      }
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          guildId: encounter.guildId,
          asset: "ITEM",
          assetKey: elixir.item.contentKey,
          delta: -1,
          balanceBefore: elixir.quantity,
          balanceAfter: elixir.quantity - 1,
          reason: "explore.reveal_hint",
          referenceType: "encounter",
          referenceId: encounter.id,
          operationKey
        }
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });

    return { hint, cardName: encounter.card.name };
  }

  async prepareCaptureWithCatalyst(encounterId: string, userId: string) {
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId }
    });
    if (!encounter) {
      throw new AppError("Rencontre introuvable.", 404);
    }
    if (encounter.status !== "ACTIVE" || encounter.closesAt <= new Date()) {
      throw new AppError("Cette rencontre est terminée.", 409);
    }
    const existingAttempt = await prisma.captureAttempt.findUnique({
      where: { encounterId_userId: { encounterId, userId } }
    });
    if (existingAttempt) {
      throw new AppError("Tu as déjà utilisé ta tentative pour cette rencontre.", 409);
    }
    const catalyst = await prisma.userItem.findFirst({
      where: {
        userId,
        quantity: { gt: 0 },
        item: { contentKey: "consumable.precision_catalyst", status: "PUBLISHED" }
      },
      include: { item: true }
    });
    if (!catalyst) {
      throw new AppError("Tu ne possèdes aucun Catalyseur de précision.", 409);
    }

    const scopeKey = `capture-preparation:${encounterId}:${userId}`;
    await prisma.actionCooldown.upsert({
      where: { scopeKey },
      update: {},
      create: {
        scopeKey,
        action: catalyst.item.contentKey,
        userId,
        guildId: encounter.guildId,
        expiresAt: encounter.closesAt
      }
    });
    return {
      contentKey: catalyst.item.contentKey,
      quantity: catalyst.quantity,
      bonus: 15,
      cap: 90
    };
  }

  async prepareCaptureWithAnchor(encounterId: string, userId: string) {
    const encounter = await prisma.encounter.findUnique({ where: { id: encounterId } });
    if (!encounter || encounter.status !== "ACTIVE" || encounter.closesAt <= new Date()) {
      throw new AppError("Cette rencontre est terminée.", 409);
    }
    const [existingAttempt, anchor] = await Promise.all([
      prisma.captureAttempt.findUnique({
        where: { encounterId_userId: { encounterId, userId } }
      }),
      prisma.userItem.findFirst({
        where: {
          userId,
          quantity: { gt: 0 },
          item: { contentKey: "consumable.anchor_net", status: "PUBLISHED" }
        },
        include: { item: true }
      })
    ]);
    if (existingAttempt) {
      throw new AppError("Tu as déjà utilisé ta tentative pour cette rencontre.", 409);
    }
    if (!anchor) throw new AppError("Tu ne possèdes aucun Filet d'ancrage.", 409);
    await prisma.actionCooldown.upsert({
      where: { scopeKey: `capture-anchor:${encounterId}:${userId}` },
      update: {},
      create: {
        scopeKey: `capture-anchor:${encounterId}:${userId}`,
        action: anchor.item.contentKey,
        userId,
        guildId: encounter.guildId,
        expiresAt: encounter.closesAt
      }
    });
    return { contentKey: anchor.item.contentKey, quantity: anchor.quantity };
  }

  async activateFortuneTalisman(userId: string, operationKey: string) {
    const ledgerOperationKey = `${operationKey}:fortune-talisman`;
    return prisma.$transaction(async (tx) => {
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: ledgerOperationKey }
      });
      if (replay) return { activated: true, replayed: true };
      const active = await tx.userItemEffect.findUnique({
        where: {
          userId_effectKey: { userId, effectKey: "ITEM_DROP_ROLL_TWICE" }
        }
      });
      if (active && active.remainingUses > 0) {
        throw new AppError("Un Talisman de fortune est déjà actif.", 409);
      }
      const owned = await tx.userItem.findFirst({
        where: {
          userId,
          quantity: { gt: 0 },
          item: { contentKey: "consumable.fortune_talisman", status: "PUBLISHED" }
        },
        include: { item: true }
      });
      if (!owned) throw new AppError("Tu ne possèdes aucun Talisman de fortune.", 409);
      const consumed = await tx.userItem.updateMany({
        where: { id: owned.id, quantity: { gt: 0 }, version: owned.version },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) {
        throw new AppError("Ton inventaire a changé. Rouvre le menu Objets.", 409);
      }
      await tx.userItemEffect.upsert({
        where: {
          userId_effectKey: { userId, effectKey: "ITEM_DROP_ROLL_TWICE" }
        },
        update: {
          itemId: owned.itemId,
          remainingUses: 1,
          activatedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
          version: { increment: 1 }
        },
        create: {
          userId,
          itemId: owned.itemId,
          effectKey: "ITEM_DROP_ROLL_TWICE",
          remainingUses: 1,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000)
        }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "ITEM",
          assetKey: owned.item.contentKey,
          delta: -1,
          balanceBefore: owned.quantity,
          balanceAfter: owned.quantity - 1,
          reason: "capture.fortune_talisman_activated",
          referenceType: "User",
          referenceId: userId,
          operationKey: ledgerOperationKey
        }
      });
      return { activated: true, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async rerollDuplicateWithIdol(encounterId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
        include: { card: { include: { rarity: true } } }
      });
      if (!encounter || encounter.status !== "ACTIVE" || encounter.closesAt <= new Date()) {
        throw new AppError("Cette rencontre est terminée.", 409);
      }
      if (encounter.initiatorUserId !== userId) {
        throw new AppError("L'Idole ne peut modifier que ta rencontre privée.", 403);
      }
      const attempt = await tx.captureAttempt.findUnique({
        where: { encounterId_userId: { encounterId, userId } }
      });
      if (attempt) throw new AppError("La capture a déjà été tentée.", 409);
      if (encounter.card.rarity.name === "Limited") {
        throw new AppError("L'Idole ne peut pas modifier une carte Limited.", 409);
      }
      const equipped = await tx.equippedArtifact.findFirst({
        where: {
          userId,
          item: { effectKey: "EXP_DUPLICATE_REROLL", status: "PUBLISHED" }
        }
      });
      if (!equipped) throw new AppError("Équipe l'Idole du collectionneur d'abord.", 409);
      const owned = await tx.inventoryItem.aggregate({
        where: { userId, cardId: encounter.cardId },
        _sum: { quantity: true }
      });
      if ((owned._sum.quantity ?? 0) <= 0) {
        throw new AppError("Cette carte est nouvelle : l'Idole n'a rien à reroll.", 409);
      }
      const dayKey = new Date().toISOString().slice(0, 10);
      const scopeKey = `artifact:collector-idol:${userId}:${dayKey}`;
      const used = await tx.actionCooldown.findUnique({ where: { scopeKey } });
      if (used) throw new AppError("L'Idole a déjà été utilisée aujourd'hui.", 409);
      const pool = await tx.card.findMany({
        where: {
          deckId: encounter.card.deckId,
          rarityId: encounter.card.rarityId,
          id: { not: encounter.cardId },
          source: "vault",
          status: "PUBLISHED",
          isActive: true
        },
        orderBy: { id: "asc" }
      });
      if (pool.length === 0) {
        throw new AppError("Aucune autre carte du même deck et tier n'est disponible.", 409);
      }
      const random = createSeededRandom(`${encounter.seedHash}:${userId}:collector-idol`);
      const replacement = pool[Math.floor(random() * pool.length)]!;
      await tx.encounter.update({
        where: { id: encounter.id },
        data: {
          cardId: replacement.id,
          seedHash: createHash("sha256")
            .update(`${encounter.seedHash}:${replacement.id}`)
            .digest("hex"),
          version: { increment: 1 }
        }
      });
      await tx.actionCooldown.create({
        data: {
          scopeKey,
          action: "EXP_DUPLICATE_REROLL",
          userId,
          guildId: encounter.guildId,
          expiresAt: nextUtcMidnight()
        }
      });
      return {
        previousCard: encounter.card,
        card: await tx.card.findUniqueOrThrow({
          where: { id: replacement.id },
          include: { deck: true, rarity: true }
        })
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async chooseEncounterTarget(encounterId: string, userId: string, cardId: string) {
    return prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findUnique({
        where: { id: encounterId },
        include: {
          card: { include: { deck: true, rarity: true } },
          zone: { include: { world: true } }
        }
      });
      if (!encounter || encounter.status !== "ACTIVE" || encounter.closesAt <= new Date()) {
        throw new AppError("Cette rencontre est terminée.", 409);
      }
      if (encounter.initiatorUserId !== userId) {
        throw new AppError("Seul l'explorateur peut choisir sa cible privée.", 403);
      }
      const previous = await tx.captureAttempt.findUnique({
        where: { encounterId_userId: { encounterId, userId } },
        select: { id: true }
      });
      if (previous) throw new AppError("La capture a déjà été tentée.", 409);
      const metadata = jsonRecord(encounter.eventMetadata);
      const choices = Array.isArray(metadata.targetChoiceIds)
        ? metadata.targetChoiceIds.filter(
            (value): value is string => typeof value === "string"
          )
        : [];
      if (metadata.targetChoiceSelected === true) {
        const selected = await tx.card.findUnique({
          where: { id: encounter.cardId },
          include: { deck: true, rarity: true }
        });
        if (!selected) throw new AppError("Cible sélectionnée introuvable.", 404);
        return {
          encounter,
          card: selected,
          alreadySelected: true,
          darkProfileChoice: metadata.darkProfileChoice === true
        };
      }
      if (!choices.includes(cardId)) {
        throw new AppError("Cette cible ne fait pas partie des choix proposés.", 400);
      }
      const card = await tx.card.findFirst({
        where: { id: cardId, status: "PUBLISHED", isActive: true },
        include: { deck: true, rarity: true }
      });
      const darkProfileChoice = metadata.darkProfileChoice === true;
      if (!card || (!darkProfileChoice && card.deckId !== encounter.card.deckId)) {
        throw new AppError("Cette cible n'est plus disponible.", 409);
      }
      const updated = await tx.encounter.update({
        where: { id: encounter.id },
        data: {
          cardId: card.id,
          eventMetadata: {
            ...metadata,
            targetChoiceSelected: true,
            selectedTargetId: card.id
          },
          version: { increment: 1 }
        },
        include: { zone: { include: { world: true } } }
      });
      return {
        encounter: updated,
        card,
        alreadySelected: false,
        darkProfileChoice
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getAttemptChoices(encounterId: string, userId: string) {
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: { card: { include: { deck: true, rarity: true } } }
    });
    if (!encounter) {
      throw new AppError("Rencontre introuvable.", 404);
    }
    if (encounter.status !== "ACTIVE" || encounter.closesAt <= new Date()) {
      throw new AppError("Cette rencontre est terminée.", 409);
    }
    const [existing, progress, learnedSkills] = await Promise.all([
      prisma.captureAttempt.findUnique({
        where: { encounterId_userId: { encounterId, userId } }
      }),
      prisma.userProgress.findUnique({
        where: { userId },
        select: { level: true }
      }),
      prisma.userSkill.findMany({
        where: { userId, rank: { gt: 0 } },
        select: { skill: { select: { effectKey: true } } }
      })
    ]);
    if (existing) {
      throw new AppError("Tu as déjà utilisé ta tentative pour cette rencontre.", 409);
    }
    const encounterMetadata = jsonRecord(encounter.eventMetadata);
    if (
      Array.isArray(encounterMetadata.targetChoiceIds) &&
      encounterMetadata.targetChoiceSelected !== true
    ) {
      throw new AppError("Choisis d'abord l'une des deux cibles proposées.", 409);
    }

    const now = new Date();
    const desiredDeadline = new Date(Math.min(
      encounter.closesAt.getTime(),
      now.getTime() + CAPTURE_DECISION_DURATION_MS
    ));
    const captureWindow = await prisma.actionCooldown.upsert({
      where: { scopeKey: `capture-answer:${encounterId}:${userId}` },
      update: {},
      create: {
        scopeKey: `capture-answer:${encounterId}:${userId}`,
        action: "capture.answer",
        userId,
        guildId: encounter.guildId,
        expiresAt: desiredDeadline
      }
    });
    if (captureWindow.expiresAt <= now) {
      throw new AppError("Ton compte à rebours de capture est terminé.", 409);
    }
    const preparation = await prisma.actionCooldown.findUnique({
      where: { scopeKey: `capture-preparation:${encounterId}:${userId}` }
    });

    const totalChoices = choiceCountByRarity[encounter.card.rarity.name] ?? 3;
    const decoys = await prisma.card.findMany({
      where: {
        deckId: encounter.card.deckId,
        id: { not: encounter.cardId },
        status: "PUBLISHED",
        isActive: true
      },
      select: { id: true, name: true }
    });
    const random = createSeededRandom(`${encounter.seedHash}:${userId}:quiz`);
    const indices = sampleUniqueIndices(decoys.length, Math.min(totalChoices - 1, decoys.length), random);
    const choices = [
      { id: encounter.card.id, name: encounter.card.name },
      ...indices.map((index) => decoys[index]!)
    ];
    for (let index = choices.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [choices[index], choices[swapIndex]] = [choices[swapIndex]!, choices[index]!];
    }
    const skillEffects = new Set(learnedSkills.map((entry) => entry.skill.effectKey));
    const progressionBonus = Math.min(3, Math.floor((progress?.level ?? 1) / 20));
    const targetPenalty = targetPenaltyByRarity[encounter.card.rarity.name] ?? 0;
    const lowChance = calculateCaptureChance({
      answerCorrect: false,
      preparation: "none",
      progressionBonus,
      targetPenalty
    });
    const highChance = Math.min(
      100,
      calculateCaptureChance({
        answerCorrect: true,
        preparation: "none",
        progressionBonus,
        targetPenalty
      }) + (skillEffects.has("HUN_SCOPE_WEAKNESS_BONUS") ? 9 : 0)
    );
    return {
      encounter,
      choices,
      captureClosesAt: captureWindow.expiresAt,
      captureIntel: skillEffects.has("HUN_CAPTURE_CHANCE_RANGE")
        ? skillEffects.has("HUN_TRACKER_GRANT_SCOPE")
          ? {
              minimum: Math.max(5, highChance - 2),
              maximum: highChance,
              risk:
                highChance >= 80
                  ? "FAVORABLE"
                  : highChance >= 50
                    ? "UNCERTAIN"
                    : "CRITICAL",
              recommendedApproach:
                "identifier précisément la carte grâce aux indices visuels avant de répondre"
            }
          : {
              minimum: lowChance,
              maximum: highChance,
              risk: lowChance >= 50 ? "FAVORABLE" : lowChance >= 25 ? "UNCERTAIN" : "CRITICAL",
              recommendedApproach: null
            }
        : null,
      preparation:
        preparation && preparation.expiresAt > now
          ? preparation.action
          : null
    };
  }

  async submitAttempt(input: {
    encounterId: string;
    userId: string;
    selectedCardId: string;
    operationKey: string;
  }) {
    for (let transactionTry = 0; transactionTry < 3; transactionTry += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findUnique({
        where: { id: input.encounterId },
        include: {
          card: { include: { rarity: true } },
          guild: true,
          zone: { include: { world: true } }
        }
      });
      if (!encounter) {
        throw new AppError("Rencontre introuvable.", 404);
      }
      if (encounter.status !== "ACTIVE" || encounter.closesAt <= new Date()) {
        throw new AppError("Cette rencontre est terminée.", 409);
      }

      const economyConfig = await tx.appConfig.upsert({
        where: { id: "default" },
        update: {},
        create: { id: "default" }
      });
      const creditReward = captureCreditReward(
        economyConfig as unknown as Record<string, unknown>,
        encounter.card.rarity.name
      );
      const previous = await tx.captureAttempt.findUnique({
        where: { encounterId_userId: { encounterId: input.encounterId, userId: input.userId } }
      });
      if (previous) {
        const succeeded = previous.status === "SUCCEEDED";
        if (
          encounter.initiatorUserId === input.userId &&
          !encounter.initiatorResolvedAt
        ) {
          await tx.encounter.update({
            where: { id: encounter.id },
            data: {
              initiatorResolvedAt: previous.resolvedAt ?? new Date(),
              version: { increment: 1 }
            }
          });
        }
        const [item, bossOffering] = succeeded
          ? await Promise.all([
              captureConsumableRewardForAttempt(tx, previous.id),
              captureBossOfferingRewardForAttempt(tx, previous.id)
            ])
          : [null, null];
        return {
          attempt: previous,
          card: encounter.card,
          chancePercent: previous.chancePermille / 10,
          rewards: {
            xp: succeeded ? encounter.card.xpReward : 0,
            credits: succeeded ? creditReward : 0,
            item,
            bossOffering
          },
          gameplay: null,
          publication: encounterPublicationState(encounter, input.userId),
          alreadySubmitted: true
        };
      }

      const now = new Date();
      const captureWindow = await tx.actionCooldown.findUnique({
        where: { scopeKey: `capture-answer:${input.encounterId}:${input.userId}` }
      });
      if (!captureWindow || captureWindow.expiresAt <= now) {
        throw new AppError("Temps écoulé : ta fenêtre de capture de 30 secondes est terminée.", 409);
      }
      const answerCorrect = input.selectedCardId === encounter.cardId;
      const catalystPreparation = await tx.actionCooldown.findUnique({
        where: { scopeKey: `capture-preparation:${input.encounterId}:${input.userId}` }
      });
      const anchorPreparation = await tx.actionCooldown.findUnique({
        where: { scopeKey: `capture-anchor:${input.encounterId}:${input.userId}` }
      });
      const [captureState, learnedSkills, momentumArtifact] = await Promise.all([
        tx.userGameplayState.findUnique({ where: { userId: input.userId } }),
        tx.userSkill.findMany({
          where: { userId: input.userId, rank: { gt: 0 } },
          select: { skill: { select: { effectKey: true } } }
        }),
        tx.equippedArtifact.findFirst({
          where: {
            userId: input.userId,
            item: { effectKey: "CAPTURE_TIER_PITY_90", status: "PUBLISHED" }
          },
          select: { id: true }
        })
      ]);
      const skillEffects = new Set(learnedSkills.map((entry) => entry.skill.effectKey));
      const tierPityActive = Boolean(
        momentumArtifact &&
        captureState?.sameTierFailureKey === encounter.card.rarity.name &&
        (captureState?.sameTierFailureCount ?? 0) >= 3
      );
      const usesCatalyst = Boolean(
        catalystPreparation &&
        catalystPreparation.expiresAt > now &&
        catalystPreparation.action === "consumable.precision_catalyst" &&
        !answerCorrect &&
        !tierPityActive
      );

      const user = await tx.user.findUnique({ where: { id: input.userId } });
      if (!user) {
        throw new AppError("Profil joueur introuvable.", 404);
      }
      await tx.guildMember.upsert({
        where: { guildId_userId: { guildId: encounter.guildId, userId: input.userId } },
        update: { isActive: true, lastActiveAt: now },
        create: {
          guildId: encounter.guildId,
          userId: input.userId,
          isActive: true,
          lastActiveAt: now
        }
      });

      if (usesCatalyst) {
        const catalyst = await tx.userItem.findFirst({
          where: {
            userId: input.userId,
            quantity: { gt: 0 },
            item: { contentKey: "consumable.precision_catalyst", status: "PUBLISHED" }
          },
          include: { item: true }
        });
        if (!catalyst) {
          throw new AppError(
            "Ton Catalyseur de précision n'est plus disponible. Rouvre le menu Objets.",
            409
          );
        }
        const consumed = await tx.userItem.updateMany({
          where: { id: catalyst.id, quantity: { gt: 0 }, version: catalyst.version },
          data: { quantity: { decrement: 1 }, version: { increment: 1 } }
        });
        if (consumed.count !== 1) {
          throw new AppError("Ton inventaire a changé. Rouvre le menu Objets.", 409);
        }
        await tx.economicLedgerEntry.create({
          data: {
            userId: input.userId,
            guildId: encounter.guildId,
            asset: "ITEM",
            assetKey: catalyst.item.contentKey,
            delta: -1,
            balanceBefore: catalyst.quantity,
            balanceAfter: catalyst.quantity - 1,
            reason: "capture.precision_catalyst",
            referenceType: "encounter",
            referenceId: encounter.id,
            operationKey: `${input.operationKey}:precision-catalyst`,
            metadata: { bonus: 15, cap: 90 }
          }
        });
      }

      const progress = await tx.userProgress.upsert({
        where: { userId: input.userId },
        update: {},
        create: { userId: input.userId, level: user.level, xp: user.xp }
      });
      const progressionBonus = Math.min(3, Math.floor(progress.level / 20));
      const targetPenalty = targetPenaltyByRarity[encounter.card.rarity.name] ?? 0;
      const baseChancePercent = calculateCaptureChance({
        answerCorrect,
        preparation: "none",
        progressionBonus,
        targetPenalty
      });
      let chancePercent = usesCatalyst
        ? Math.max(baseChancePercent, Math.min(90, baseChancePercent + 15))
        : baseChancePercent;
      if (answerCorrect && skillEffects.has("HUN_SCOPE_WEAKNESS_BONUS")) {
        // The global balance rule guarantees 95% for a correct answer. The
        // historical scope cap (90%) must never lower that direct player rule.
        chancePercent = Math.min(95, chancePercent + 9);
      }
      if (
        skillEffects.has("HUN_SCOPE_MINIMUM_CHANCE") &&
        ((captureState?.captures ?? 0) + (captureState?.captureFailures ?? 0) + 1) % 9 === 0
      ) {
        chancePercent = Math.max(66, chancePercent);
      }
      if (tierPityActive) {
        chancePercent = Math.max(90, chancePercent);
      }
      let randomRollMillion = randomInt(0, 1_000_000);
      let succeeded = randomRollMillion < Math.round(chancePercent * 10_000);
      let anchorUsed = false;
      let scopeLockUsed = false;
      let momentumUsed = false;
      if (
        !succeeded &&
        anchorPreparation &&
        anchorPreparation.expiresAt > now &&
        anchorPreparation.action === "consumable.anchor_net"
      ) {
        const anchor = await tx.userItem.findFirst({
          where: {
            userId: input.userId,
            quantity: { gt: 0 },
            item: { contentKey: "consumable.anchor_net", status: "PUBLISHED" }
          },
          include: { item: true }
        });
        if (!anchor) {
          throw new AppError("Ton Filet d'ancrage n'est plus disponible.", 409);
        }
        const consumed = await tx.userItem.updateMany({
          where: { id: anchor.id, quantity: { gt: 0 }, version: anchor.version },
          data: { quantity: { decrement: 1 }, version: { increment: 1 } }
        });
        if (consumed.count !== 1) {
          throw new AppError("Ton inventaire a changé. Rouvre le menu Objets.", 409);
        }
        let retryChance = baseChancePercent;
        if (answerCorrect && skillEffects.has("HUN_SCOPE_WEAKNESS_BONUS")) {
          retryChance = Math.min(100, retryChance + 9);
        }
        if (tierPityActive) retryChance = Math.max(90, retryChance);
        randomRollMillion = randomInt(0, 1_000_000);
        succeeded = randomRollMillion < Math.round(retryChance * 10_000);
        anchorUsed = true;
        await tx.economicLedgerEntry.create({
          data: {
            userId: input.userId,
            guildId: encounter.guildId,
            asset: "ITEM",
            assetKey: anchor.item.contentKey,
            delta: -1,
            balanceBefore: anchor.quantity,
            balanceAfter: anchor.quantity - 1,
            reason: "capture.anchor_retry",
            referenceType: "Encounter",
            referenceId: encounter.id,
            operationKey: `${input.operationKey}:anchor`,
            metadata: { retryChance }
          }
        });
      }
      const totalPriorHunts =
        (captureState?.captures ?? 0) + (captureState?.captureFailures ?? 0);
      if (
        !succeeded &&
        !anchorUsed &&
        skillEffects.has("HUN_SCOPE_LOCK_TARGET") &&
        (totalPriorHunts + 1) % 3 === 0
      ) {
        let retryChance = baseChancePercent;
        if (answerCorrect && skillEffects.has("HUN_SCOPE_WEAKNESS_BONUS")) {
          retryChance = Math.min(100, retryChance + 9);
        }
        if (tierPityActive) retryChance = Math.max(90, retryChance);
        randomRollMillion = randomInt(0, 1_000_000);
        succeeded = randomRollMillion < Math.round(retryChance * 10_000);
        scopeLockUsed = true;
      }
      if (
        !succeeded &&
        !anchorUsed &&
        !scopeLockUsed &&
        skillEffects.has("HUN_MOMENTUM_RETRY") &&
        (captureState?.momentum ?? 0) >= 3
      ) {
        let retryChance = baseChancePercent;
        if (answerCorrect && skillEffects.has("HUN_SCOPE_WEAKNESS_BONUS")) {
          retryChance = Math.min(100, retryChance + 9);
        }
        if (tierPityActive) retryChance = Math.max(90, retryChance);
        randomRollMillion = randomInt(0, 1_000_000);
        succeeded = randomRollMillion < Math.round(retryChance * 10_000);
        momentumUsed = true;
      }
      const variant = succeeded
        ? (encounter.tierIncenseTarget ? rollVariantWithIncense : rollVariant)(
            () => randomInt(0, 1_000_000) / 1_000_000
          )
        : null;
      const eventId = randomUUID();
      const eventMetadata = jsonRecord(encounter.eventMetadata);
      const xpMultiplier = Number(eventMetadata.xpMultiplier ?? 1);
      const creditMultiplier = Number(eventMetadata.creditMultiplier ?? 1);
      const rewards: {
        xp: number;
        credits: number;
        item: CaptureConsumableReward | null;
        bossOffering: CaptureBossOfferingReward | null;
      } = {
        xp: succeeded
          ? Math.max(0, Math.round(encounter.card.xpReward * xpMultiplier))
          : 0,
        credits: succeeded
          ? Math.max(0, Math.round(creditReward * creditMultiplier))
          : 0,
        item: null,
        bossOffering: null
      };

      const attempt = await tx.captureAttempt.create({
        data: {
          encounterId: input.encounterId,
          userId: input.userId,
          status: succeeded ? "SUCCEEDED" : "FAILED",
          answerCorrect,
          preparation: [
            usesCatalyst ? "precision_catalyst" : null,
            anchorUsed ? "anchor_retry" : null,
            scopeLockUsed ? "scope_lock_retry" : null,
            momentumUsed ? "momentum_retry" : null
          ].filter(Boolean).join("+") || "none",
          progressionBonus,
          targetPenalty,
          chancePermille: Math.round(chancePercent * 10),
          randomRollMillion,
          variant,
          resolvedAt: now,
          rewardEventId: eventId
        }
      });
      const rarityRank = RARITY_ORDER.indexOf(
        encounter.card.rarity.name as CoreRarity
      );
      const rareOrBetter = rarityRank >= RARITY_ORDER.indexOf("Rare");
      const exoticOrBetter = rarityRank >= RARITY_ORDER.indexOf("Exotic");
      const priorSuccesses = captureState?.successfulExplorations ?? 0;
      const successMomentumGain = succeeded && skillEffects.has("HUN_MOMENTUM_FROM_SUCCESSES")
        && (priorSuccesses + 1) % 3 === 0
        ? 1
        : 0;
      const failureMomentumGain =
        !succeeded && skillEffects.has("HUN_TAMER_GRANT_GAUNTLET") ? 1 : 0;
      const momentumCap = skillEffects.has("HUN_MOMENTUM_CAP_SIX") ? 6 : 3;
      const nextMomentum = Math.min(
        momentumCap,
        Math.max(0, (captureState?.momentum ?? 0) - (momentumUsed ? 3 : 0)) +
          successMomentumGain +
          failureMomentumGain
      );
      const encounterState = jsonRecord(encounter.eventMetadata);
      const isDarkHunt = encounterState.darkHunt === true;
      const isPioneerChain = encounterState.pioneerChain === true;
      const captureCounters = jsonRecord(captureState?.counters);
      const traceGained =
        succeeded &&
        skillEffects.has("HUN_SHADOW_GRANT_LANTERN") &&
        rareOrBetter &&
        (
          (
            rarityRank >= RARITY_ORDER.indexOf("Very Rare") &&
            skillEffects.has("HUN_VOID_TRACE_GUARANTEE")
          ) ||
          randomInt(0, 1_000_000) < 330_000
        )
          ? 1
          : 0;
      const priorChainedSuccesses = Math.max(
        0,
        Number(captureCounters.chainedSuccesses ?? 0)
      );
      const nextChainedSuccesses = isPioneerChain
        ? (succeeded ? priorChainedSuccesses + 1 : 0)
        : priorChainedSuccesses;
      const secretRouteCheckpoint = Math.floor((captureState?.explorations ?? 0) / 9);
      const secretCheckpointScope =
        `pioneer-secret-route-checkpoint:${input.userId}:${secretRouteCheckpoint}`;
      const secretCheckpointUsed = secretRouteCheckpoint > 0
        ? await tx.actionCooldown.findUnique({
            where: { scopeKey: secretCheckpointScope }
          })
        : null;
      const secretRouteUnlocked =
        succeeded &&
        isPioneerChain &&
        skillEffects.has("EXP_SECRET_ROUTE") &&
        nextChainedSuccesses >= 3 &&
        secretRouteCheckpoint > 0 &&
        !secretCheckpointUsed;
      const nextCounters =
        traceGained > 0 || isPioneerChain
          ? {
              ...captureCounters,
              voidTraces: traceGained > 0
                ? Math.min(
                    9,
                    Math.max(0, Number(captureCounters.voidTraces ?? 0)) + 1
                  )
                : Math.max(0, Number(captureCounters.voidTraces ?? 0)),
              chainedSuccesses: secretRouteUnlocked ? 0 : nextChainedSuccesses
            }
          : undefined;
      await tx.userGameplayState.upsert({
        where: { userId: input.userId },
        update: {
          successfulExplorations: succeeded ? { increment: 1 } : undefined,
          captures: succeeded ? { increment: 1 } : undefined,
          captureFailures: succeeded ? undefined : { increment: 1 },
          sameTierFailureKey: succeeded || tierPityActive ? null : encounter.card.rarity.name,
          sameTierFailureCount: succeeded || tierPityActive ||
            captureState?.sameTierFailureKey !== encounter.card.rarity.name
            ? (succeeded ? 0 : 1)
            : { increment: 1 },
          rareMissStreak: rareOrBetter ? 0 : { increment: 1 },
          darkHuntMissStreak: isDarkHunt
            ? (exoticOrBetter ? 0 : { increment: 1 })
            : undefined,
          momentum: skillEffects.has("HUN_TAMER_GRANT_GAUNTLET")
            ? nextMomentum
            : undefined,
          chainSuccesses: skillEffects.has("EXP_PIONEER_GRANT_BEACON")
            ? (succeeded ? { increment: 1 } : 0)
            : undefined,
          counters: nextCounters,
          version: { increment: 1 }
        },
        create: {
          userId: input.userId,
          successfulExplorations: succeeded ? 1 : 0,
          captures: succeeded ? 1 : 0,
          captureFailures: succeeded ? 0 : 1,
          sameTierFailureKey: succeeded || tierPityActive ? null : encounter.card.rarity.name,
          sameTierFailureCount: succeeded || tierPityActive ? 0 : 1,
          rareMissStreak: rareOrBetter ? 0 : 1,
          darkHuntMissStreak: isDarkHunt && !exoticOrBetter ? 1 : 0,
          momentum: skillEffects.has("HUN_TAMER_GRANT_GAUNTLET") ? nextMomentum : 0,
          chainSuccesses:
            skillEffects.has("EXP_PIONEER_GRANT_BEACON") && succeeded ? 1 : 0,
          counters: nextCounters ?? Prisma.JsonNull
        }
      });
      const chainReady =
        succeeded &&
        skillEffects.has("EXP_PIONEER_GRANT_BEACON") &&
        ((captureState?.chainSuccesses ?? 0) + 1) % 3 === 0;
      if (chainReady) {
        await tx.actionCooldown.upsert({
          where: { scopeKey: `pioneer-chain-ready:${input.userId}` },
          update: {
            action: "EXP_PIONEER_GRANT_BEACON",
            guildId: encounter.guildId,
            expiresAt: new Date(now.getTime() + 10 * 60_000),
            version: { increment: 1 }
          },
          create: {
            scopeKey: `pioneer-chain-ready:${input.userId}`,
            action: "EXP_PIONEER_GRANT_BEACON",
            userId: input.userId,
            guildId: encounter.guildId,
            expiresAt: new Date(now.getTime() + 10 * 60_000)
          }
        });
      }
      if (secretRouteUnlocked) {
        await tx.actionCooldown.create({
          data: {
            scopeKey: secretCheckpointScope,
            action: "EXP_SECRET_ROUTE_CHECKPOINT",
            userId: input.userId,
            guildId: encounter.guildId,
            expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60_000)
          }
        });
        await tx.actionCooldown.upsert({
          where: { scopeKey: `pioneer-secret-route-ready:${input.userId}` },
          update: {
            action: "EXP_SECRET_ROUTE",
            guildId: encounter.guildId,
            expiresAt: new Date(now.getTime() + 30 * 60_000),
            version: { increment: 1 }
          },
          create: {
            scopeKey: `pioneer-secret-route-ready:${input.userId}`,
            action: "EXP_SECRET_ROUTE",
            userId: input.userId,
            guildId: encounter.guildId,
            expiresAt: new Date(now.getTime() + 30 * 60_000)
          }
        });
      }
      if (
        encounter.initiatorUserId === input.userId &&
        !encounter.initiatorResolvedAt
      ) {
        await tx.encounter.updateMany({
          where: {
            id: encounter.id,
            initiatorUserId: input.userId,
            initiatorResolvedAt: null
          },
          data: {
            initiatorResolvedAt: now,
            version: { increment: 1 }
          }
        });
      }

      if (succeeded && variant) {
        const inventory = await tx.inventoryItem.findUnique({
          where: {
            userId_cardId_variant: {
              userId: input.userId,
              cardId: encounter.cardId,
              variant
            }
          }
        });
        const balanceBefore = inventory?.quantity ?? 0;
        await tx.inventoryItem.upsert({
          where: {
            userId_cardId_variant: {
              userId: input.userId,
              cardId: encounter.cardId,
              variant
            }
          },
          update: { quantity: { increment: 1 }, version: { increment: 1 } },
          create: {
            userId: input.userId,
            cardId: encounter.cardId,
            variant,
            quantity: 1
          }
        });
        await tx.captureLog.create({
          data: {
            userId: input.userId,
            cardId: encounter.cardId,
            channelId: encounter.channelId
          }
        });

        const xpResult = applyXpGain(progress.level, progress.xp, rewards.xp);
        await tx.userProgress.update({
          where: { userId: input.userId },
          data: {
            level: xpResult.level,
            xp: xpResult.xp,
            unspentSkillPoints: { increment: xpResult.levelsGained },
            version: { increment: 1 }
          }
        });
        await tx.user.update({
          where: { id: input.userId },
          data: {
            level: xpResult.level,
            xp: xpResult.xp,
            credits: { increment: rewards.credits },
            balanceVersion: { increment: 1 }
          }
        });
        await tx.economicLedgerEntry.createMany({
          data: [
            {
              userId: input.userId,
              guildId: encounter.guildId,
              asset: "CARD",
              assetKey: `${encounter.cardId}:${variant}`,
              delta: 1,
              balanceBefore,
              balanceAfter: balanceBefore + 1,
              reason: "explore.capture",
              referenceType: "encounter",
              referenceId: encounter.id,
              operationKey: input.operationKey,
              metadata: { variant, answerCorrect, chancePercent }
            },
            {
              userId: input.userId,
              guildId: encounter.guildId,
              asset: "CREDITS",
              delta: rewards.credits,
              balanceBefore: user.credits,
              balanceAfter: user.credits + rewards.credits,
              reason: "explore.capture_reward",
              referenceType: "encounter",
              referenceId: encounter.id,
              operationKey: `${input.operationKey}:credits`,
              metadata: {
                rarity: encounter.card.rarity.name,
                xp: rewards.xp
              }
            }
          ]
        });
        await tx.transactionLog.create({
          data: {
            userId: input.userId,
            type: "capture_reward",
            amount: rewards.credits,
            metadata: {
              encounterId: encounter.id,
              cardId: encounter.cardId,
              xp: rewards.xp,
              operationKey: input.operationKey
            }
          }
        });
        await tx.economyLog.create({
          data: {
            userId: input.userId,
            type: "capture_reward",
            amount: rewards.credits,
            metadata: {
              encounterId: encounter.id,
              rarity: encounter.card.rarity.name,
              xp: rewards.xp
            }
          }
        });

        const fortuneTalisman = await tx.userItemEffect.findUnique({
          where: {
            userId_effectKey: {
              userId: input.userId,
              effectKey: "ITEM_DROP_ROLL_TWICE"
            }
          }
        });
        const fortuneActive = Boolean(
          fortuneTalisman &&
          fortuneTalisman.remainingUses > 0 &&
          (!fortuneTalisman.expiresAt || fortuneTalisman.expiresAt > now)
        );
        rewards.item = await grantCaptureConsumableDrop(tx, {
          userId: input.userId,
          guildId: encounter.guildId,
          attemptId: attempt.id,
          operationKey: input.operationKey,
          config: economyConfig,
          rollTwice: fortuneActive
        });
        rewards.bossOffering = await grantCaptureBossOfferingDrop(tx, {
          userId: input.userId,
          guildId: encounter.guildId,
          attemptId: attempt.id,
          operationKey: input.operationKey,
          worldId: encounter.zone.worldId,
          worldLabel: encounter.zone.world.name
        });
        if (fortuneActive && rewards.item && fortuneTalisman) {
          await tx.userItemEffect.update({
            where: { id: fortuneTalisman.id },
            data: { remainingUses: 0, version: { increment: 1 } }
          });
        }

        const guildProgress = await tx.guildProgress.findUnique({
          where: { guildId: encounter.guildId }
        });
        if (guildProgress?.frontierWorldId === encounter.zone.worldId) {
          await tx.guildProgress.update({
            where: { guildId: encounter.guildId },
            data: { mastery: { increment: 1 }, version: { increment: 1 } }
          });
          await tx.guildWorldProgress.updateMany({
            where: { guildId: encounter.guildId, worldId: encounter.zone.worldId },
            data: { mastery: { increment: 1 }, version: { increment: 1 } }
          });
        }
      }

      await tx.outboxEvent.create({
        data: {
          eventId,
          aggregateType: "CaptureAttempt",
          aggregateId: attempt.id,
          eventType: succeeded ? "capture.succeeded" : "capture.failed",
          eventVersion: 1,
          payload: {
            encounterId: encounter.id,
            userId: input.userId,
            cardId: encounter.cardId,
            answerCorrect,
            chancePercent,
            preparation: attempt.preparation,
            variant,
            rewards
          }
        }
      });
      if (encounter.eventKey) {
        const eventReward = succeeded
          ? {
              xpBonus: rewards.xp - encounter.card.xpReward,
              creditBonus: rewards.credits - creditReward
            }
          : null;
        await tx.explorationEventCompletion.upsert({
          where: {
            encounterId_userId: {
              encounterId: encounter.id,
              userId: input.userId
            }
          },
          update: {},
          create: {
            encounterId: encounter.id,
            userId: input.userId,
            eventKey: encounter.eventKey,
            isSpecial: encounter.eventSpecial,
            succeeded,
            reward: eventReward ?? Prisma.JsonNull
          }
        });
        await tx.outboxEvent.create({
          data: {
            eventId: `${eventId}:exploration-event`,
            aggregateType: "Encounter",
            aggregateId: encounter.id,
            eventType: "exploration.event.completed",
            eventVersion: 1,
            payload: {
              userId: input.userId,
              encounterId: encounter.id,
              eventKey: encounter.eventKey,
              isSpecialEvent: encounter.eventSpecial,
              succeeded,
              reward: eventReward
            }
          }
        });
      }

      return {
        attempt,
        card: encounter.card,
        chancePercent,
        rewards,
        gameplay: {
          anchorUsed,
          scopeLockUsed,
          momentumUsed,
          momentum: nextMomentum,
          traceGained,
          voidTraces: nextCounters
            ? Number(nextCounters.voidTraces)
            : Math.max(0, Number(captureCounters.voidTraces ?? 0)),
          darkHunt: isDarkHunt,
          chainReady,
          secretRouteUnlocked
        },
        publication: encounterPublicationState(encounter, input.userId),
        alreadySubmitted: false
      };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        const retryable =
          error instanceof CaptureItemInventoryConflict ||
          (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            (error.code === "P2034" || error.code === "P2002")
          );
        if (!retryable) {
          throw error;
        }

        const previous = await prisma.captureAttempt.findUnique({
          where: {
            encounterId_userId: {
              encounterId: input.encounterId,
              userId: input.userId
            }
          },
          include: {
            encounter: {
              include: {
                card: { include: { rarity: true } }
              }
            }
          }
        });
        if (previous) {
          const economyConfig = await prisma.appConfig.upsert({
            where: { id: "default" },
            update: {},
            create: { id: "default" }
          });
          const succeeded = previous.status === "SUCCEEDED";
          const replayRewards = succeeded
            ? await prisma.$transaction((tx) =>
                Promise.all([
                  captureConsumableRewardForAttempt(tx, previous.id),
                  captureBossOfferingRewardForAttempt(tx, previous.id)
                ])
              )
            : [null, null] as const;
          const [item, bossOffering] = replayRewards;
          return {
            attempt: previous,
            card: previous.encounter.card,
            chancePercent: previous.chancePermille / 10,
            rewards: {
              xp: succeeded ? previous.encounter.card.xpReward : 0,
              credits: succeeded
                ? captureCreditReward(
                    economyConfig as unknown as Record<string, unknown>,
                    previous.encounter.card.rarity.name
                  )
                : 0,
              item,
              bossOffering
            },
            gameplay: null,
            publication: encounterPublicationState(previous.encounter, input.userId),
            alreadySubmitted: true
          };
        }
        if (transactionTry === 2) {
          throw new AppError(
            "Ta tentative est en cours de résolution. Réessaie dans quelques secondes.",
            409
          );
        }
      }
    }
    throw new AppError("Impossible de résoudre la tentative.", 409);
  }
}
