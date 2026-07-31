import { describe, expect, it } from "vitest";
import { equipmentSlotLimitFromEffectKeys } from "../src/equipment.service.js";

describe("equipment slots", () => {
  it("provides two slots without any skill modifier", () => {
    expect(equipmentSlotLimitFromEffectKeys([])).toBe(2);
  });

  it("does not confuse the exploration consumable slot with artifact equipment", () => {
    expect(equipmentSlotLimitFromEffectKeys(["EXP_EXTRA_CONSUMABLE_SLOT"])).toBe(2);
  });

  it("ignores unrelated skill effects", () => {
    expect(equipmentSlotLimitFromEffectKeys(["HUN_CAPTURE_CHANCE_RANGE"])).toBe(2);
  });
});
