import { describe, expect, it } from "vitest";
import { canTrade } from "../src/game-logic.js";

describe("Trade", () => {
  it("rejects trade when inventory is insufficient", () => {
    expect(canTrade(1, 2)).toBe(false);
  });

  it("accepts valid trade quantity", () => {
    expect(canTrade(4, 2)).toBe(true);
  });
});
