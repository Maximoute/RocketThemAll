import { describe, expect, it } from "vitest";
import {
  accessibleQuestWorlds,
  dailyQuestWindow,
  questTargetForDifficulty,
  requiredAccessibleWorldCount,
} from "../src/daily-quest.service.js";

describe("daily quest accessible worlds", () => {
  const worlds = Array.from({ length: 9 }, (_, index) => ({
    position: index + 1,
    minLevel: 1,
    name: `Monde ${index + 1}`
  }));

  it("never assigns a locked published world", () => {
    expect(accessibleQuestWorlds(worlds, 99, [1]).map((world) => world.position))
      .toEqual([1]);
    expect(accessibleQuestWorlds(worlds, 99, [2, 4]).map((world) => world.position))
      .toEqual([1, 2, 3, 4]);
  });

  it("falls back to the first world when the player has no active guild", () => {
    expect(accessibleQuestWorlds(worlds, 99, []).map((world) => world.position))
      .toEqual([1]);
  });
});

describe("daily quest Paris rotation", () => {
  it("ends at the next local midnight in summer", () => {
    const window = dailyQuestWindow(new Date("2026-07-27T22:42:12.000Z"));
    expect(window.dayKey).toBe("2026-07-28");
    expect(window.expiresAt.toISOString()).toBe("2026-07-28T22:00:00.000Z");
  });

  it("handles the winter UTC offset", () => {
    const window = dailyQuestWindow(new Date("2026-01-27T22:42:12.000Z"));
    expect(window.dayKey).toBe("2026-01-27");
    expect(window.expiresAt.toISOString()).toBe("2026-01-27T23:00:00.000Z");
  });
});

describe("daily quest targets", () => {
  it("scales ordinary targets by difficulty", () => {
    const definition = {
      target: 4,
      objectiveKey: "EXPLORE_TOTAL",
      metadata: { targetStrategy: "GENERAL_EXPLORATION_TABLE" }
    };
    expect(questTargetForDifficulty(definition as any, "EASY", 1)).toBe(3);
    expect(questTargetForDifficulty(definition as any, "NORMAL", 1)).toBe(4);
    expect(questTargetForDifficulty(definition as any, "HARD", 1)).toBe(6);
  });

  it("never forces a premium third zone", () => {
    const definition = {
      target: 3,
      objectiveKey: "EXPLORE_DISTINCT_ZONES",
      metadata: { targetStrategy: "GENERAL_EXPLORATION_TABLE" }
    };
    expect(questTargetForDifficulty(definition as any, "HARD", 1)).toBe(2);
  });

  it("uses player level for XP objectives", () => {
    const definition = {
      target: 1,
      objectiveKey: "GAIN_XP",
      metadata: { targetStrategy: "XP_TARGET_BY_TIER_AND_DIFFICULTY" }
    };
    expect(questTargetForDifficulty(definition as any, "EASY", 1)).toBe(25);
    expect(questTargetForDifficulty(definition as any, "HARD", 1)).toBe(100);
  });

  it("allocates two steps to ordered route quests", () => {
    const definition = {
      target: 1,
      objectiveKey: "EXPLORE_TOTAL",
      metadata: {
        targetStrategy: "FIXED_BY_TEMPLATE",
        objectiveVariant: "ordered_zone_sequence"
      }
    };
    expect(questTargetForDifficulty(definition as any, "EASY", 1)).toBe(2);
    expect(questTargetForDifficulty(definition as any, "HARD", 1)).toBe(2);
  });

  it("requires every distinct world requested by the selected difficulty", () => {
    const definition = {
      target: 3,
      objectiveKey: "EXPLORE_DISTINCT_WORLDS",
      metadata: { targetStrategy: "GENERAL_EXPLORATION_TABLE" }
    };
    expect(requiredAccessibleWorldCount(definition as any, "EASY", 1)).toBe(2);
    expect(requiredAccessibleWorldCount(definition as any, "NORMAL", 1)).toBe(3);
    expect(requiredAccessibleWorldCount(definition as any, "HARD", 1)).toBe(5);
  });

  it("requires two worlds for fixed cross-world discovery quests", () => {
    const definition = {
      target: 2,
      objectiveKey: "DISCOVER_IN_WORLD",
      metadata: {
        targetStrategy: "FIXED_BY_TEMPLATE",
        objectiveVariant: "discoveries_across_two_worlds",
        requiresMultipleWorlds: true
      }
    };
    expect(requiredAccessibleWorldCount(definition as any, "NORMAL", 1)).toBe(2);
  });
});
