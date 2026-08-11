import { describe, expect, it } from "vitest";
import {
  FRAGMENT_BOOSTER_COST,
  FRAGMENT_CARD_COST,
  guaranteedTransmutationVariant,
  TRANSMUTATION_CARD_COST
} from "../src/transmutation.service.js";

describe("Réacteur d’Anomalies", () => {
  it("uses the requested economic costs", () => {
    expect(TRANSMUTATION_CARD_COST).toBe(5);
    expect(FRAGMENT_CARD_COST).toBe(100);
    expect(FRAGMENT_BOOSTER_COST).toBe(50);
  });

  it("guarantees a variant only when all five sacrifices match", () => {
    expect(guaranteedTransmutationVariant(Array(5).fill("shiny"))).toBe("shiny");
    expect(guaranteedTransmutationVariant(Array(5).fill("holo"))).toBe("holo");
    expect(guaranteedTransmutationVariant(["shiny", "holo", "shiny", "holo", "shiny"]))
      .toBe("shiny");
    expect(guaranteedTransmutationVariant(["shiny", "shiny", "shiny", "shiny", "normal"]))
      .toBeNull();
  });
});
