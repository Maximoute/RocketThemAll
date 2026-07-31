import { describe, expect, it } from "vitest";
import {
  DANGER_RARITY_WEIGHTS,
  DECK_RARITY_COUNTS,
  INCENSE_VARIANT_WEIGHTS,
  VARIANT_WEIGHTS,
  applyRarityWeightMultiplier,
  rarityWeightsForDanger,
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

  it("sets an incense tier to exactly 50 percent when the tier is present", () => {
    for (const [profile, baseWeights] of Object.entries(DANGER_RARITY_WEIGHTS)) {
      for (const boosted of baseWeights) {
        const weights = rarityWeightsForDanger(
          profile as keyof typeof DANGER_RARITY_WEIGHTS,
          boosted.value
        );
        const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
        const boostedWeight = weights.find((entry) => entry.value === boosted.value)?.weight ?? 0;
        expect(boostedWeight / total).toBe(0.5);
      }
    }
  });

  it("does not add an incense tier that is absent from the danger profile", () => {
    const calm = rarityWeightsForDanger("Calm", "Very Rare");
    expect(calm).toEqual(DANGER_RARITY_WEIGHTS.Calm);

    const dangerous = rarityWeightsForDanger("Dangerous", "Rare");
    expect(dangerous.find((entry) => entry.value === "Rare")?.weight).toBe(55);
    expect(rollRarityForDangerWithBoost("Dangerous", "Rare", () => 0.2)).toBe("Rare");
  });

  it("multiplies only an eligible archive resonance tier", () => {
    const base = rarityWeightsForDanger("Dangerous");
    const boosted = applyRarityWeightMultiplier(base, "Rare", 1.3);
    expect(boosted.find((entry) => entry.value === "Rare")?.weight).toBe(5_850);
    expect(boosted.find((entry) => entry.value === "Import")?.weight).toBe(500);
    expect(applyRarityWeightMultiplier(base, "Exotic", 1.4)).toBe(base);
  });
});
