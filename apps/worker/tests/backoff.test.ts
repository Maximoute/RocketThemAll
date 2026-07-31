import { describe, expect, it } from "vitest";
import { retryDelayMs } from "../src/backoff.js";

describe("worker retry backoff", () => {
  it("uses capped exponential delays", () => {
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(2)).toBe(10_000);
    expect(retryDelayMs(4)).toBe(40_000);
    expect(retryDelayMs(100)).toBe(3_600_000);
  });

  it("rejects invalid configuration", () => {
    expect(() => retryDelayMs(0)).toThrow(RangeError);
    expect(() => retryDelayMs(1, 0)).toThrow(RangeError);
    expect(() => retryDelayMs(1, 10, 9)).toThrow(RangeError);
  });
});
