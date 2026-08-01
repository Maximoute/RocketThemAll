import { weightedPick, type RandomSource, type WeightedValue } from "./random.js";

export type CoreRarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Very Rare"
  | "Import"
  | "Exotic"
  | "Black Market";

export type CardVariant = "normal" | "shiny" | "holo";
export type DangerProfile = "Calm" | "Unstable" | "Dangerous" | "Critical" | "Extreme";

export const VARIANT_WEIGHTS: readonly WeightedValue<CardVariant>[] = [
  { value: "normal", weight: 989_000 },
  { value: "shiny", weight: 10_000 },
  { value: "holo", weight: 1_000 }
];

export const INCENSE_VARIANT_WEIGHTS: readonly WeightedValue<CardVariant>[] = [
  { value: "normal", weight: 940_000 },
  { value: "shiny", weight: 50_000 },
  { value: "holo", weight: 10_000 }
];

export const DANGER_RARITY_WEIGHTS: Readonly<
  Record<DangerProfile, readonly WeightedValue<CoreRarity>[]>
> = {
  Calm: [
    { value: "Common", weight: 65 },
    { value: "Uncommon", weight: 25 },
    { value: "Rare", weight: 10 }
  ],
  Unstable: [
    { value: "Common", weight: 30 },
    { value: "Uncommon", weight: 40 },
    { value: "Rare", weight: 25 },
    { value: "Very Rare", weight: 5 }
  ],
  Dangerous: [
    { value: "Uncommon", weight: 20 },
    { value: "Rare", weight: 45 },
    { value: "Very Rare", weight: 30 },
    { value: "Import", weight: 5 }
  ],
  Critical: [
    { value: "Rare", weight: 20 },
    { value: "Very Rare", weight: 45 },
    { value: "Import", weight: 30 },
    { value: "Exotic", weight: 5 }
  ],
  Extreme: [
    { value: "Very Rare", weight: 20 },
    { value: "Import", weight: 45 },
    { value: "Exotic", weight: 30 },
    { value: "Black Market", weight: 5 }
  ]
};

export const PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT = 25;

const CORE_RARITY_ORDER: readonly CoreRarity[] = [
  "Common",
  "Uncommon",
  "Rare",
  "Very Rare",
  "Import",
  "Exotic",
  "Black Market"
];

export const DECK_RARITY_COUNTS: Readonly<Record<CoreRarity, number>> = {
  Common: 9,
  Uncommon: 7,
  Rare: 5,
  "Very Rare": 4,
  Import: 2,
  Exotic: 2,
  "Black Market": 1
};

export const FUSION_COSTS: Readonly<Partial<Record<CoreRarity, number>>> = {
  Common: 3,
  Uncommon: 5,
  Rare: 7,
  "Very Rare": 9,
  Import: 12,
  Exotic: 18
};

export const DUPLICATE_VARIANT_WEIGHTS: Readonly<Record<CardVariant, number>> = {
  normal: 1,
  shiny: 4,
  holo: 10
};

export const STANDARD_BOOSTER_CARD_COUNT = 3;
export const EQUIPPED_ARTIFACT_LIMIT = 3;
export const DAILY_QUEST_COUNT = 3;

export function rollVariant(random: RandomSource): CardVariant {
  return weightedPick(VARIANT_WEIGHTS, random);
}

export function rollVariantWithIncense(random: RandomSource): CardVariant {
  return weightedPick(INCENSE_VARIANT_WEIGHTS, random);
}

export function rollRarityForDanger(profile: DangerProfile, random: RandomSource): CoreRarity {
  return weightedPick(DANGER_RARITY_WEIGHTS[profile], random);
}

export function rarityWeightsForDanger(
  profile: DangerProfile,
  boostedRarity?: CoreRarity | null
): readonly WeightedValue<CoreRarity>[] {
  const baseWeights = DANGER_RARITY_WEIGHTS[profile];
  if (!boostedRarity || !baseWeights.some((entry) => entry.value === boostedRarity)) {
    return baseWeights;
  }
  const otherWeight = baseWeights.reduce(
    (total, entry) => total + (entry.value === boostedRarity ? 0 : entry.weight),
    0
  );
  return baseWeights.map((entry) => ({
    value: entry.value,
    weight: entry.value === boostedRarity ? otherWeight : entry.weight
  }));
}

/**
 * Premium routes upgrade one quarter of every rarity band to the next tier.
 * The total weight is preserved and Black Market stays at the highest tier.
 */
export function applyPremiumRouteRarityBonus(
  entries: readonly WeightedValue<CoreRarity>[]
): readonly WeightedValue<CoreRarity>[] {
  const weights = new Map<CoreRarity, number>();
  const upgradePercent = PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT;
  const retainedPercent = 100 - upgradePercent;

  for (const entry of entries) {
    const rarityIndex = CORE_RARITY_ORDER.indexOf(entry.value);
    const nextRarity = CORE_RARITY_ORDER[rarityIndex + 1];
    if (!nextRarity) {
      weights.set(entry.value, (weights.get(entry.value) ?? 0) + entry.weight * 100);
      continue;
    }
    weights.set(
      entry.value,
      (weights.get(entry.value) ?? 0) + entry.weight * retainedPercent
    );
    weights.set(
      nextRarity,
      (weights.get(nextRarity) ?? 0) + entry.weight * upgradePercent
    );
  }

  return CORE_RARITY_ORDER.flatMap((value) => {
    const weight = weights.get(value) ?? 0;
    return weight > 0 ? [{ value, weight }] : [];
  });
}

export function rarityWeightsForRoute(
  profile: DangerProfile,
  premium: boolean,
  boostedRarity?: CoreRarity | null
): readonly WeightedValue<CoreRarity>[] {
  const baseWeights = premium
    ? applyPremiumRouteRarityBonus(DANGER_RARITY_WEIGHTS[profile])
    : DANGER_RARITY_WEIGHTS[profile];
  if (!boostedRarity || !baseWeights.some((entry) => entry.value === boostedRarity)) {
    return baseWeights;
  }
  const otherWeight = baseWeights.reduce(
    (total, entry) => total + (entry.value === boostedRarity ? 0 : entry.weight),
    0
  );
  return baseWeights.map((entry) => ({
    value: entry.value,
    weight: entry.value === boostedRarity ? otherWeight : entry.weight
  }));
}

export function applyRarityWeightMultiplier(
  entries: readonly WeightedValue<CoreRarity>[],
  rarity: CoreRarity | null | undefined,
  multiplier: number
): readonly WeightedValue<CoreRarity>[] {
  if (
    !rarity ||
    !entries.some((entry) => entry.value === rarity) ||
    !Number.isFinite(multiplier) ||
    multiplier <= 1
  ) {
    return entries;
  }
  return entries.map((entry) => ({
    value: entry.value,
    // Keep integer weights so the deterministic weighted picker remains auditable.
    weight: Math.max(
      1,
      Math.round(entry.weight * (entry.value === rarity ? multiplier : 1) * 100)
    )
  }));
}

export function rollRarityForDangerWithBoost(
  profile: DangerProfile,
  boostedRarity: CoreRarity | null | undefined,
  random: RandomSource
): CoreRarity {
  return weightedPick(rarityWeightsForDanger(profile, boostedRarity), random);
}

export function rollLimitedRarity(
  weights: readonly WeightedValue<CoreRarity>[],
  random: RandomSource
): CoreRarity {
  return weightedPick(weights, random);
}
