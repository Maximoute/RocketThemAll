import { describe, expect, it } from "vitest";
import { BOOSTER_CARD_RARITY } from "../src/booster.service.js";
import { countBoosterSlots } from "../src/game-logic.js";

describe("Booster", () => {
  it("contains exactly one card", () => {
    expect(countBoosterSlots()).toBe(1);
  });

  it("maps every booster to one exact card rarity", () => {
    expect(BOOSTER_CARD_RARITY).toEqual({
      basic: "Common",
      rare: "Rare",
      epic: "Very Rare",
      legendary: "Black Market"
    });
  });
});
