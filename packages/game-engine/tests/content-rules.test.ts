import { describe, expect, it } from "vitest";
import {
  DANGER_RARITY_WEIGHTS,
  DECK_RARITY_COUNTS,
  INCENSE_VARIANT_WEIGHTS,
  VARIANT_WEIGHTS,
  PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT,
  TIER_INCENSE_TARGET_PERCENT,
  applyRarityWeightMultiplier,
  applyPremiumRouteRarityBonus,
  rarityWeightsForDanger,
  rarityWeightsForRoute,
  rollRarityForDanger,
  rollRarityForDangerWithBoost,
  rollVariant,
  rollVariantWithIncense
} from "../src/index.js";

describe("content rules", () => {
  it("defines exactly 30 cards in a deck", () => {
    expect(Object.values(DECK_RARITY_COUNTS).reduce((sum, count) => sum + count, 0)).toBe(30);
  });

  it("defines variant probabilities totaling one million", () => {
    expect(VARIANT_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0)).toBe(1_000_000);
    expect(INCENSE_VARIANT_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0)).toBe(1_000_000);
  });

  it("selects variants at exact boundaries", () => {
    expect(rollVariant(() => 0)).toBe("normal");
    expect(rollVariant(() => 0.988999)).toBe("normal");
    expect(rollVariant(() => 0.989)).toBe("shiny");
    expect(rollVariant(() => 0.999)).toBe("holo");
  });

  it("uses 5 percent shiny and 1 percent holo while an incense is active", () => {
    expect(rollVariantWithIncense(() => 0.939999)).toBe("normal");
    expect(rollVariantWithIncense(() => 0.94)).toBe("shiny");
    expect(rollVariantWithIncense(() => 0.989999)).toBe("shiny");
    expect(rollVariantWithIncense(() => 0.99)).toBe("holo");
  });

  it.each(Object.entries(DANGER_RARITY_WEIGHTS))("%s danger totals 100", (_profile, weights) => {
    expect(weights.reduce((sum, entry) => sum + entry.weight, 0)).toBe(100);
  });

  it("uses the extreme danger boundary table", () => {
    expect(rollRarityForDanger("Extreme", () => 0.199999)).toBe("Very Rare");
    expect(rollRarityForDanger("Extreme", () => 0.2)).toBe("Import");
    expect(rollRarityForDanger("Extreme", () => 0.95)).toBe("Black Market");
  });

  it("sets an incense tier to exactly 95 percent", () => {
    for (const [profile, baseWeights] of Object.entries(DANGER_RARITY_WEIGHTS)) {
      for (const boosted of baseWeights) {
        const weights = rarityWeightsForDanger(
          profile as keyof typeof DANGER_RARITY_WEIGHTS,
          boosted.value
        );
        const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
        const boostedWeight = weights.find((entry) => entry.value === boosted.value)?.weight ?? 0;
        expect(boostedWeight / total).toBe(TIER_INCENSE_TARGET_PERCENT / 100);
      }
    }
  });

  it("adds an incense tier even when it is absent from the danger profile", () => {
    const calm = rarityWeightsForDanger("Calm", "Very Rare");
    const calmTotal = calm.reduce((sum, entry) => sum + entry.weight, 0);
    expect((calm.find((entry) => entry.value === "Very Rare")?.weight ?? 0) / calmTotal)
      .toBe(TIER_INCENSE_TARGET_PERCENT / 100);

    const dangerous = rarityWeightsForDanger("Dangerous", "Rare");
    const dangerousTotal = dangerous.reduce((sum, entry) => sum + entry.weight, 0);
    expect((dangerous.find((entry) => entry.value === "Rare")?.weight ?? 0) / dangerousTotal)
      .toBe(TIER_INCENSE_TARGET_PERCENT / 100);
    expect(rollRarityForDangerWithBoost("Dangerous", "Rare", () => 0.2)).toBe("Rare");
  });

  it("multiplies only an eligible archive resonance tier", () => {
    const base = rarityWeightsForDanger("Dangerous");
    const boosted = applyRarityWeightMultiplier(base, "Rare", 1.3);
    expect(boosted.find((entry) => entry.value === "Rare")?.weight).toBe(5_850);
    expect(boosted.find((entry) => entry.value === "Import")?.weight).toBe(500);
    expect(applyRarityWeightMultiplier(base, "Exotic", 1.4)).toBe(base);
  });

  it("moves 25 percent of premium route odds up by one rarity tier", () => {
    expect(PREMIUM_ROUTE_RARITY_UPGRADE_PERCENT).toBe(25);
    expect(applyPremiumRouteRarityBonus(DANGER_RARITY_WEIGHTS.Calm)).toEqual([
      { value: "Common", weight: 4_875 },
      { value: "Uncommon", weight: 3_500 },
      { value: "Rare", weight: 1_375 },
      { value: "Very Rare", weight: 250 }
    ]);
  });

  it("keeps premium route odds at the same total and above the free expected rarity", () => {
    for (const profile of Object.keys(DANGER_RARITY_WEIGHTS) as Array<keyof typeof DANGER_RARITY_WEIGHTS>) {
      const free = rarityWeightsForRoute(profile, false);
      const premium = rarityWeightsForRoute(profile, true);
      const freeTotal = free.reduce((sum, entry) => sum + entry.weight, 0);
      const premiumTotal = premium.reduce((sum, entry) => sum + entry.weight, 0);
      const expectedRank = (entries: typeof free, total: number) => entries.reduce(
        (sum, entry) => sum + CORE_RARITY_RANK[entry.value] * entry.weight,
        0
      ) / total;

      expect(premiumTotal).toBe(freeTotal * 100);
      expect(expectedRank(premium, premiumTotal)).toBeGreaterThan(expectedRank(free, freeTotal));
    }
  });

  it("keeps an incense target at exactly 95 percent on a premium route", () => {
    const weights = rarityWeightsForRoute("Calm", true, "Rare");
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    const rare = weights.find((entry) => entry.value === "Rare")?.weight ?? 0;
    expect(rare / total).toBe(TIER_INCENSE_TARGET_PERCENT / 100);
  });
});

const CORE_RARITY_RANK: Record<keyof typeof DECK_RARITY_COUNTS, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  "Very Rare": 3,
  Import: 4,
  Exotic: 5,
  "Black Market": 6
};
