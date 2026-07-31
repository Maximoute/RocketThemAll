export const CAPTURE_ITEM_ROLL_SCALE = 1_000_000;
export const DEFAULT_CAPTURE_CONSUMABLE_DROP_RATE = 0.1;

export const CAPTURE_CONSUMABLE_TIERS = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "EPIC",
  "LEGENDARY"
] as const;

export type CaptureConsumableTier = (typeof CAPTURE_CONSUMABLE_TIERS)[number];

export const DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS: Record<
  CaptureConsumableTier,
  number
> = {
  COMMON: 50,
  UNCOMMON: 30,
  RARE: 15,
  EPIC: 4,
  LEGENDARY: 1
};

const tierLabels: Record<CaptureConsumableTier, string> = {
  COMMON: "Commun",
  UNCOMMON: "Peu commun",
  RARE: "Rare",
  EPIC: "Épique",
  LEGENDARY: "Légendaire"
};

export function captureConsumableTierLabel(tier: CaptureConsumableTier) {
  return tierLabels[tier];
}

export function normalizeCaptureConsumableTier(value: unknown): CaptureConsumableTier | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

  const aliases: Record<string, CaptureConsumableTier> = {
    common: "COMMON",
    commun: "COMMON",
    uncommon: "UNCOMMON",
    "peu commun": "UNCOMMON",
    rare: "RARE",
    epic: "EPIC",
    epique: "EPIC",
    legendary: "LEGENDARY",
    legendaire: "LEGENDARY"
  };
  return aliases[normalized] ?? null;
}

export function captureConsumableDropTriggers(
  configuredRate: number,
  rollMillion: number
) {
  const rate = Number.isFinite(configuredRate)
    ? Math.min(1, Math.max(0, configuredRate))
    : DEFAULT_CAPTURE_CONSUMABLE_DROP_RATE;
  return rollMillion < Math.round(rate * CAPTURE_ITEM_ROLL_SCALE);
}

export function pickCaptureConsumableTier(
  availableTiers: Iterable<CaptureConsumableTier>,
  configuredWeights: Partial<Record<CaptureConsumableTier, number>>,
  rollMillion: number
): CaptureConsumableTier | null {
  const available = new Set(availableTiers);
  const weightedTiers = CAPTURE_CONSUMABLE_TIERS.flatMap((tier) => {
    if (!available.has(tier)) return [];
    const configured = configuredWeights[tier];
    const weight = Number.isFinite(configured)
      ? Math.max(0, Number(configured))
      : DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS[tier];
    return weight > 0 ? [{ tier, weight }] : [];
  });
  const totalWeight = weightedTiers.reduce((total, entry) => total + entry.weight, 0);
  if (totalWeight <= 0) return null;

  const boundedRoll = Math.min(
    CAPTURE_ITEM_ROLL_SCALE - 1,
    Math.max(0, Math.floor(rollMillion))
  );
  const target = (boundedRoll / CAPTURE_ITEM_ROLL_SCALE) * totalWeight;
  let cumulative = 0;
  for (const entry of weightedTiers) {
    cumulative += entry.weight;
    if (target < cumulative) return entry.tier;
  }
  return weightedTiers.at(-1)?.tier ?? null;
}
