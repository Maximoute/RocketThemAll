import { describe, expect, it } from "vitest";
import {
  rankWeeklyCardCandidates,
  WEEKLY_CARD_SHOP_SLOTS,
  weeklyCardShopWindow
} from "../src/weekly-card-shop.service.js";

describe("weekly card shop rotation", () => {
  it("publishes the requested six-card rarity distribution", () => {
    expect(WEEKLY_CARD_SHOP_SLOTS.map((slot) => slot.rarityName)).toEqual([
      "Common",
      "Common",
      "Rare",
      "Rare",
      "Very Rare",
      "Import"
    ]);
    expect(WEEKLY_CARD_SHOP_SLOTS.map((slot) => slot.price)).toEqual([
      15_000,
      15_000,
      35_000,
      35_000,
      75_000,
      150_000
    ]);
  });

  it("runs from Monday midnight to Monday midnight in Europe/Paris", () => {
    const summer = weeklyCardShopWindow(new Date("2026-08-13T12:00:00.000Z"));
    expect(summer.weekKey).toBe("2026-08-10");
    expect(summer.startsAt.toISOString()).toBe("2026-08-09T22:00:00.000Z");
    expect(summer.endsAt.toISOString()).toBe("2026-08-16T22:00:00.000Z");

    const winter = weeklyCardShopWindow(new Date("2026-01-15T12:00:00.000Z"));
    expect(winter.weekKey).toBe("2026-01-12");
    expect(winter.startsAt.toISOString()).toBe("2026-01-11T23:00:00.000Z");
    expect(winter.endsAt.toISOString()).toBe("2026-01-18T23:00:00.000Z");
  });

  it("always prioritizes cards with the lowest global circulation", () => {
    const ranked = rankWeeklyCardCandidates("2026-08-10", [
      { id: "popular", circulation: 42 },
      { id: "unseen-a", circulation: 0 },
      { id: "scarce", circulation: 2 },
      { id: "unseen-b", circulation: 0 }
    ]);
    expect(ranked.slice(0, 2).map((card) => card.circulation)).toEqual([0, 0]);
    expect(ranked[2]?.id).toBe("scarce");
    expect(ranked[3]?.id).toBe("popular");
  });

  it("uses the week key to rotate equal-circulation tie breaks deterministically", () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      id: `card-${index}`,
      circulation: 0
    }));
    const first = rankWeeklyCardCandidates("2026-08-10", candidates).map((card) => card.id);
    const replay = rankWeeklyCardCandidates("2026-08-10", candidates).map((card) => card.id);
    const nextWeek = rankWeeklyCardCandidates("2026-08-17", candidates).map((card) => card.id);
    expect(replay).toEqual(first);
    expect(nextWeek).not.toEqual(first);
  });
});
