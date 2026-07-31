import { describe, expect, it } from "vitest";
import { calculateExplorationEnergy } from "../src/exploration-energy.service.js";

describe("exploration energy regeneration", () => {
  const now = new Date("2026-07-27T18:00:00.000Z");

  it("keeps a full reserve at four charges without a timer", () => {
    expect(calculateExplorationEnergy({
      charges: 4,
      maxCharges: 4,
      regenStartedAt: new Date("2026-07-27T17:00:00.000Z"),
      regenIntervalMinutes: 5,
      now
    })).toEqual({
      charges: 4,
      regenStartedAt: null,
      nextChargeAt: null
    });
  });

  it("regenerates one charge every five minutes", () => {
    const state = calculateExplorationEnergy({
      charges: 1,
      maxCharges: 4,
      regenStartedAt: new Date("2026-07-27T17:52:00.000Z"),
      regenIntervalMinutes: 5,
      now
    });
    expect(state.charges).toBe(2);
    expect(state.regenStartedAt?.toISOString()).toBe("2026-07-27T17:57:00.000Z");
    expect(state.nextChargeAt?.toISOString()).toBe("2026-07-27T18:02:00.000Z");
  });

  it("never regenerates beyond the skill-adjusted maximum", () => {
    const state = calculateExplorationEnergy({
      charges: 3,
      maxCharges: 5,
      regenStartedAt: new Date("2026-07-27T16:00:00.000Z"),
      regenIntervalMinutes: 5,
      now
    });
    expect(state.charges).toBe(5);
    expect(state.regenStartedAt).toBeNull();
    expect(state.nextChargeAt).toBeNull();
  });

  it("starts a timer when a newly increased maximum has an empty slot", () => {
    const state = calculateExplorationEnergy({
      charges: 4,
      maxCharges: 5,
      regenStartedAt: null,
      regenIntervalMinutes: 5,
      now
    });
    expect(state.charges).toBe(4);
    expect(state.regenStartedAt?.toISOString()).toBe(now.toISOString());
    expect(state.nextChargeAt?.toISOString()).toBe("2026-07-27T18:05:00.000Z");
  });
});
