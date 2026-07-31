import { describe, expect, it } from "vitest";
import {
  PREMIUM_ZONE_PASS_SURCHARGE_CREDITS,
  premiumZoneBaseCreditCost
} from "../src/explore.service.js";

describe("premium zone pricing", () => {
  it("charges fifty credits more than the expedition pass reference price", () => {
    expect(PREMIUM_ZONE_PASS_SURCHARGE_CREDITS).toBe(50);
    expect(premiumZoneBaseCreditCost({ creditPrice: 125 })).toBe(175);
  });

  it("uses fifty credits for the current drop-only pass", () => {
    expect(premiumZoneBaseCreditCost({ creditPrice: 0 })).toBe(50);
    expect(premiumZoneBaseCreditCost(null)).toBe(50);
  });
});
