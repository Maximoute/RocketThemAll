import { describe, expect, it } from "vitest";
import { applyXpGain, xpRequired } from "../src/xp.service.js";

describe("XP and level", () => {
  it("calculates required xp with formula", () => {
    expect(xpRequired(1)).toBe(100);
    expect(xpRequired(4)).toBe(Math.floor(100 * Math.pow(4, 1.5)));
  });

  it("levels up and keeps overflow xp", () => {
    const result = applyXpGain(1, 90, 30);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(20);
    expect(result.levelsGained).toBe(1);
  });
});
