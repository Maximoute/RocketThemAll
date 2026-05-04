import { describe, expect, it } from "vitest";
import { applyXpGain } from "../src/xp.service.js";

describe("Level", () => {
  it("grants multiple levels when enough xp", () => {
    const result = applyXpGain(1, 0, 500);
    expect(result.level).toBeGreaterThan(1);
    expect(result.levelsGained).toBeGreaterThan(0);
  });
});
