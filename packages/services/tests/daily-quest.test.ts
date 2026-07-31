import { describe, expect, it } from "vitest";
import {
  questTargetForDifficulty,
  utcQuestWindow
} from "../src/daily-quest.service.js";

describe("daily quest UTC rotation", () => {
  it("ends at the next 00:00 UTC", () => {
    const window = utcQuestWindow(new Date("2026-07-27T22:42:12.000Z"));
    expect(window.dayKey).toBe("2026-07-27");
    expect(window.expiresAt.toISOString()).toBe("2026-07-28T00:00:00.000Z");
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
});
