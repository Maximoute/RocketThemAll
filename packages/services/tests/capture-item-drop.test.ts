import { describe, expect, it } from "vitest";
import {
  captureConsumableDropTriggers,
  DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS,
  normalizeCaptureConsumableTier,
  pickCaptureConsumableTier
} from "../src/capture-item-drop.js";

describe("capture consumable drops", () => {
  it("triggers on exactly 10% of the one-million roll space", () => {
    expect(captureConsumableDropTriggers(0.1, 0)).toBe(true);
    expect(captureConsumableDropTriggers(0.1, 99_999)).toBe(true);
    expect(captureConsumableDropTriggers(0.1, 100_000)).toBe(false);
    expect(captureConsumableDropTriggers(0.1, 999_999)).toBe(false);
  });

  it("uses the 50/30/15/4/1 tier boundaries", () => {
    const tiers = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const;
    expect(pickCaptureConsumableTier(tiers, DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS, 0)).toBe("COMMON");
    expect(pickCaptureConsumableTier(tiers, DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS, 499_999)).toBe("COMMON");
    expect(pickCaptureConsumableTier(tiers, DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS, 500_000)).toBe("UNCOMMON");
    expect(pickCaptureConsumableTier(tiers, DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS, 800_000)).toBe("RARE");
    expect(pickCaptureConsumableTier(tiers, DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS, 950_000)).toBe("EPIC");
    expect(pickCaptureConsumableTier(tiers, DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS, 990_000)).toBe("LEGENDARY");
  });

  it("renormalizes weights when a tier has no eligible item", () => {
    expect(
      pickCaptureConsumableTier(
        ["EPIC", "LEGENDARY"],
        DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS,
        799_999
      )
    ).toBe("EPIC");
    expect(
      pickCaptureConsumableTier(
        ["EPIC", "LEGENDARY"],
        DEFAULT_CAPTURE_CONSUMABLE_TIER_WEIGHTS,
        800_000
      )
    ).toBe("LEGENDARY");
  });

  it("recognizes the French rarity labels imported from the vault", () => {
    expect(normalizeCaptureConsumableTier("Commun")).toBe("COMMON");
    expect(normalizeCaptureConsumableTier("Peu commun")).toBe("UNCOMMON");
    expect(normalizeCaptureConsumableTier("Épique")).toBe("EPIC");
    expect(normalizeCaptureConsumableTier("Légendaire")).toBe("LEGENDARY");
  });
});
