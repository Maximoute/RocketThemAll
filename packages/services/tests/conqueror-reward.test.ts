import { describe, expect, it } from "vitest";
import {
  CONQUEROR_BOSS_DROP_RATES,
  CONQUEROR_CHEST_RANGES,
  conquerorRewardTierForWorld,
  deterministicBossRewardRoll
} from "../src/index.js";

describe("Conqueror rewards", () => {
  it("maps worlds to the six supported reward tiers", () => {
    expect([
      conquerorRewardTierForWorld(1),
      conquerorRewardTierForWorld(2),
      conquerorRewardTierForWorld(3),
      conquerorRewardTierForWorld(4),
      conquerorRewardTierForWorld(5),
      conquerorRewardTierForWorld(6),
      conquerorRewardTierForWorld(9)
    ]).toEqual([
      "common",
      "uncommon",
      "rare",
      "very_rare",
      "import",
      "exotic",
      "exotic"
    ]);
  });

  it("uses the documented initial boss drop rates", () => {
    expect(CONQUEROR_BOSS_DROP_RATES.common).toEqual({
      booster: 0.01,
      chest: 0.03
    });
    expect(CONQUEROR_BOSS_DROP_RATES.exotic).toEqual({
      booster: 0.1,
      chest: 0.2
    });
  });

  it("keeps deterministic per-player reward rolls in range", () => {
    const first = deterministicBossRewardRoll("run-1", "user-1", "booster");
    expect(first).toBe(deterministicBossRewardRoll("run-1", "user-1", "booster"));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    expect(first).not.toBe(
      deterministicBossRewardRoll("run-1", "user-1", "chest")
    );
  });

  it("keeps every chest range ordered and non-empty", () => {
    for (const range of Object.values(CONQUEROR_CHEST_RANGES)) {
      expect(range.credits[0]).toBeLessThanOrEqual(range.credits[1]);
      expect(range.xp[0]).toBeLessThanOrEqual(range.xp[1]);
      expect(range.consumableTiers.length).toBeGreaterThan(0);
    }
  });
});
