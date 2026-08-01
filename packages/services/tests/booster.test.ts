import { describe, expect, it } from "vitest";
import { BOOSTER_CARD_RARITY } from "../src/booster.service.js";
import { boosterSelectionRule } from "../src/conqueror-reward.service.js";
import { countBoosterSlots } from "../src/game-logic.js";

describe("Booster", () => {
  it("starts with three proposed cards", () => {
    expect(countBoosterSlots()).toBe(3);
  });

  it("maps every booster to one exact card rarity", () => {
    expect(BOOSTER_CARD_RARITY).toEqual({
      basic: "Common",
      rare: "Rare",
      epic: "Very Rare",
      legendary: "Black Market"
    });
  });

  it("always discards two cards and keeps more at each Conqueror tier", () => {
    expect([
      "common",
      "uncommon",
      "rare",
      "very_rare",
      "import",
      "exotic"
    ].map((tier) => boosterSelectionRule(`booster.boss_choice.${tier}`))).toEqual([
      { offered: 3, kept: 1, discarded: 2 },
      { offered: 4, kept: 2, discarded: 2 },
      { offered: 5, kept: 3, discarded: 2 },
      { offered: 6, kept: 4, discarded: 2 },
      { offered: 7, kept: 5, discarded: 2 },
      { offered: 8, kept: 6, discarded: 2 }
    ]);
  });

  it("uses the same discard-two rule for shop boosters", () => {
    expect([
      "booster.basic",
      "booster.rare",
      "booster.epic",
      "booster.legendary"
    ].map(boosterSelectionRule)).toEqual([
      { offered: 3, kept: 1, discarded: 2 },
      { offered: 4, kept: 2, discarded: 2 },
      { offered: 5, kept: 3, discarded: 2 },
      { offered: 6, kept: 4, discarded: 2 }
    ]);
  });
});
