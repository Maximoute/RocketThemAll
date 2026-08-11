import { describe, expect, it } from "vitest";
import { itemResaleUnitPrice } from "../src/item-shop.service.js";
import { itemTechnicalDescription } from "../src/item-copy.js";

describe("special item sales", () => {
  it("uses half the configured shop price", () => {
    expect(itemResaleUnitPrice({ creditPrice: 1_800, rarity: "Rare" })).toBe(900);
  });

  it("gives drop-only items a deterministic tier value", () => {
    expect(itemResaleUnitPrice({ creditPrice: 0, rarity: "Rare" })).toBe(450);
    expect(itemResaleUnitPrice({ creditPrice: 0, rarity: "Légendaire" })).toBe(3_000);
  });
});

describe("technical item descriptions", () => {
  it("states the decisive tier incense odds", () => {
    expect(itemTechnicalDescription({
      contentKey: "consumable.rare_incense",
      effectKey: "EXP_TIER_WEIGHT_BOOST"
    })).toContain("95 %");
  });
});

