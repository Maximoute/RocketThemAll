import { describe, expect, it } from "vitest";
import { canCapture } from "../src/game-logic.js";

describe("Capture", () => {
  it("enforces cooldown", () => {
    expect(canCapture(0, 3000, 5)).toBe(false);
    expect(canCapture(0, 5000, 5)).toBe(true);
  });
});
