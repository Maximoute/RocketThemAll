import { describe, expect, it } from "vitest";
import { createSeededRandom, sampleUniqueIndices, weightedPick } from "../src/index.js";

describe("deterministic random helpers", () => {
  it("replays the same sequence for the same seed", () => {
    const first = createSeededRandom("encounter:42");
    const second = createSeededRandom("encounter:42");
    expect(Array.from({ length: 10 }, first)).toEqual(Array.from({ length: 10 }, second));
  });

  it("rejects invalid random sources and weights", () => {
    expect(() => weightedPick([{ value: "x", weight: 0 }], () => 0)).toThrow(RangeError);
    expect(() => weightedPick([{ value: "x", weight: 1 }], () => 1)).toThrow(RangeError);
  });

  it("samples unique indices deterministically", () => {
    const result = sampleUniqueIndices(90, 3, createSeededRandom("daily"));
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
    expect(result.every((value) => value >= 0 && value < 90)).toBe(true);
  });
});
