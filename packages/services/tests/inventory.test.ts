import { describe, expect, it } from "vitest";
import { nextInventoryQty } from "../src/game-logic.js";

describe("Inventory", () => {
  it("allows duplicates count increments", () => {
    expect(nextInventoryQty(2, 3)).toBe(5);
  });

  it("never goes negative", () => {
    expect(nextInventoryQty(1, -5)).toBe(0);
  });
});
