import { describe, expect, it } from "vitest";
import { resolveAchievementMetric } from "../src/achievement.service.js";
import { levelRoleRange } from "../src/discord-achievement-role.service.js";

const metrics = {
  values: {
    EXPLORATIONS_TOTAL: 42,
    MAX_LEVEL: 7
  },
  discoveriesByMinimumRarity: {
    UNCOMMON: 12,
    VERY_RARE: 3,
    BLACK_MARKET: 1
  },
  variantsAcquired: {
    NORMAL: 30,
    SHINY: 4,
    HOLO: 2
  }
};

describe("Achievement metrics", () => {
  it("resolves direct permanent counters", () => {
    expect(resolveAchievementMetric({
      objectiveKey: "EXPLORATIONS_TOTAL",
      metadata: null
    }, metrics)).toBe(42);
  });

  it("resolves minimum-rarity parameters from Vault metadata", () => {
    expect(resolveAchievementMetric({
      objectiveKey: "DISCOVERIES_MIN_RARITY",
      metadata: { parameters: "`minimumRarity=VERY_RARE`" }
    }, metrics)).toBe(3);
  });

  it("resolves shiny and holo variant counters", () => {
    expect(resolveAchievementMetric({
      objectiveKey: "VARIANTS_ACQUIRED",
      metadata: { parameters: "`variant=SHINY`" }
    }, metrics)).toBe(4);
    expect(resolveAchievementMetric({
      objectiveKey: "VARIANTS_ACQUIRED",
      metadata: { parameters: "`variant=HOLO`" }
    }, metrics)).toBe(2);
  });
});

describe("Dynamic Discord level role ranges", () => {
  it.each([
    [-1, 0, 10],
    [0, 0, 10],
    [1, 0, 10],
    [10, 0, 10],
    [11, 11, 20],
    [20, 11, 20],
    [21, 21, 30],
    [99, 91, 100]
  ])("maps level %i to %i–%i", (level, minLevel, maxLevel) => {
    expect(levelRoleRange(level)).toEqual({
      minLevel,
      maxLevel,
      label: `Niveau ${minLevel}–${maxLevel}`
    });
  });
});
