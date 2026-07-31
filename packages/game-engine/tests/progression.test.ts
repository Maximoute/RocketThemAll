import { describe, expect, it } from "vitest";
import {
  calculateGuardianTarget,
  guardianActivityMultiplier,
  selectDailyQuestIndices
} from "../src/index.js";

describe("guardian scaling", () => {
  it("uses the minimum multiplier for an inactive guild", () => {
    expect(guardianActivityMultiplier(0)).toBe(0.75);
    expect(calculateGuardianTarget(250, 0)).toBe(188);
  });

  it("caps high activity at 2.5", () => {
    expect(guardianActivityMultiplier(10_000)).toBe(2.5);
    expect(calculateGuardianTarget(2_700, 10_000)).toBe(6_750);
  });
});

describe("daily quest selection", () => {
  it("selects three stable unique templates per user and UTC day", () => {
    const first = selectDailyQuestIndices("user-1", "2026-07-27", 90);
    const replay = selectDailyQuestIndices("user-1", "2026-07-27", 90);
    expect(first).toEqual(replay);
    expect(first).toHaveLength(3);
    expect(new Set(first).size).toBe(3);
  });

  it("changes when the day changes", () => {
    expect(selectDailyQuestIndices("user-1", "2026-07-27", 90)).not.toEqual(
      selectDailyQuestIndices("user-1", "2026-07-28", 90)
    );
  });
});
