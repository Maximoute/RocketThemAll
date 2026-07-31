import { describe, expect, it } from "vitest";
import { explorationEventFromRoll } from "../src/explore.service.js";
import { fusionCostForSkills } from "../src/fusion.service.js";

describe("exploration events", () => {
  it("reserves three percent for special events", () => {
    expect(explorationEventFromRoll(0)?.isSpecial).toBe(true);
    expect(explorationEventFromRoll(0.029999)?.isSpecial).toBe(true);
    expect(explorationEventFromRoll(0.03)?.isSpecial).toBe(false);
  });

  it("has a twenty percent total event window", () => {
    expect(explorationEventFromRoll(0.199999)).not.toBeNull();
    expect(explorationEventFromRoll(0.2)).toBeNull();
    expect(explorationEventFromRoll(0.9)).toBeNull();
  });
});

describe("collector crafting", () => {
  it("uses six cards by default", () => {
    expect(fusionCostForSkills("Common", [])).toBe(6);
    expect(fusionCostForSkills("Rare", [])).toBe(6);
  });

  it("uses five cards only for eligible tiers with the skill", () => {
    const skills = ["COL_CRAFT_COST_FIVE"];
    expect(fusionCostForSkills("Common", skills)).toBe(5);
    expect(fusionCostForSkills("Rare", skills)).toBe(5);
    expect(fusionCostForSkills("Very Rare", skills)).toBe(6);
  });
});
