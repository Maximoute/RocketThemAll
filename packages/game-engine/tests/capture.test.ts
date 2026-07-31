import { describe, expect, it } from "vitest";
import { calculateCaptureChance, rollCapture } from "../src/index.js";

describe("capture chance", () => {
  it("gives every correct answer a fixed 95 percent capture chance", () => {
    expect(
      calculateCaptureChance({
        answerCorrect: true,
        preparation: "complete",
        progressionBonus: 3,
        targetPenalty: 20
      })
    ).toBe(95);
    expect(
      calculateCaptureChance({
        answerCorrect: true,
        preparation: "none",
        progressionBonus: 0,
        targetPenalty: 0
      })
    ).toBe(95);
  });

  it("keeps the existing severe modifiers for a wrong answer", () => {
    expect(
      calculateCaptureChance({
        answerCorrect: false,
        preparation: "partial",
        progressionBonus: 2,
        targetPenalty: 10
      })
    ).toBe(20);
  });

  it("keeps wrong-answer chances within the configured bounds", () => {
    expect(
      calculateCaptureChance({
        answerCorrect: false,
        preparation: "complete",
        progressionBonus: 3,
        targetPenalty: 0
      })
    ).toBe(35);
    expect(
      calculateCaptureChance({
        answerCorrect: false,
        preparation: "none",
        progressionBonus: 0,
        targetPenalty: 20
      })
    ).toBe(5);
  });

  it("rejects modifiers outside their configured ranges", () => {
    expect(() =>
      calculateCaptureChance({
        answerCorrect: true,
        preparation: "none",
        progressionBonus: 4,
        targetPenalty: 0
      })
    ).toThrow(RangeError);
  });

  it("uses a strict probability boundary", () => {
    expect(rollCapture(25, () => 0.249999)).toBe(true);
    expect(rollCapture(25, () => 0.25)).toBe(false);
  });
});
