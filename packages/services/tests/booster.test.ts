import { describe, expect, it } from "vitest";
import { countBoosterSlots } from "../src/game-logic.js";

describe("Booster", () => {
  it("contains 5 cards", () => {
    expect(countBoosterSlots()).toBe(5);
  });
});
