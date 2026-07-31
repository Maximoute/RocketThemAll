import { afterEach, describe, expect, it } from "vitest";
import {
  configuredDiscordSku,
  formatEuro,
  getMonetizationProduct,
  MONETIZATION_PRODUCTS,
  productKeyForDiscordSku
} from "../src/monetization.service.js";

const originalSku = process.env.DISCORD_SKU_CREDITS_12000;

afterEach(() => {
  if (originalSku === undefined) {
    delete process.env.DISCORD_SKU_CREDITS_12000;
  } else {
    process.env.DISCORD_SKU_CREDITS_12000 = originalSku;
  }
});

describe("monetization catalog", () => {
  it("keeps the affordable VIP and supporter founder prices", () => {
    expect(MONETIZATION_PRODUCTS.vip_monthly.priceCents).toBe(199);
    expect(MONETIZATION_PRODUCTS.founder_monthly.priceCents).toBe(1_500);
  });

  it("grants 2,000 bonus credits in the 9.99 EUR pack", () => {
    const pack = getMonetizationProduct("credits_12000");
    expect(pack.priceCents).toBe(999);
    expect(pack.credits).toBe(12_000);
    expect(pack.bonusCredits).toBe(2_000);
  });

  it("maps a configured Discord SKU without accepting malformed ids", () => {
    process.env.DISCORD_SKU_CREDITS_12000 = "1505371908621729954";
    expect(configuredDiscordSku("credits_12000")).toBe("1505371908621729954");
    expect(productKeyForDiscordSku("1505371908621729954")).toBe("credits_12000");

    process.env.DISCORD_SKU_CREDITS_12000 = "replace-me";
    expect(configuredDiscordSku("credits_12000")).toBeNull();
  });

  it("formats catalog prices in euros", () => {
    expect(formatEuro(999)).toContain("9,99");
  });
});
