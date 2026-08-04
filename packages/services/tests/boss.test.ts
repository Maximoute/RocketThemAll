import { describe, expect, it } from "vitest";
import {
  BOSS_DUPLICATE_CARD_POINT_VALUE,
  BOSS_FRAGMENT_POINT_VALUE,
  BOSS_TIER_BALANCE,
  REGULAR_BOSS_TIER_WEIGHTS,
  bossMechanicCandidates,
  bossCollectionRequirementLabel,
  bossRewardForTier,
  bossTierForAppearance,
  deterministicBossCategory,
  deterministicRegularBossTier,
  eligibleCaptureBossMechanics,
  bossObjectiveTarget,
  bossOfferingObjectives,
  bossSpecialOfferingRequirements,
  dailyBossWindow,
  nextDailyBossSlot,
  nextWeeklyBossSlot,
  preferredBossMechanic,
  rallyBannerProgressAmount,
  selectDailyRegularBoss,
  scaleBossTarget
} from "../src/boss.service.js";

describe("boss offering objectives", () => {
  it("splits a destructive objective into credits, fragments and duplicate cards", () => {
    const objectives = bossOfferingObjectives(1_500, "world-4", "Monde 4");
    expect(objectives.credits).toMatchObject({ target: 700, contributed: 0 });
    expect(objectives.fragments).toMatchObject({
      target: 4,
      pointValue: BOSS_FRAGMENT_POINT_VALUE
    });
    expect(objectives.duplicateCards).toMatchObject({
      target: 4,
      pointValue: BOSS_DUPLICATE_CARD_POINT_VALUE,
      worldId: "world-4"
    });
    expect(objectives.totalPoints).toBe(
      objectives.credits.target +
      objectives.fragments.target * BOSS_FRAGMENT_POINT_VALUE +
      objectives.duplicateCards.target * BOSS_DUPLICATE_CARD_POINT_VALUE
    );
  });

  it("scales ritual requirements with the tier of an offering boss", () => {
    expect(bossSpecialOfferingRequirements({
      tier: "common",
      mechanic: "OFFERING",
      worldId: "world-7",
      worldLabel: "Monde 7"
    })).toMatchObject({
      funeralCandle: { required: 1, deposited: 0 },
      voidFlower: { maximum: 1, deposited: 0 }
    });

    const exotic = bossSpecialOfferingRequirements({
      tier: "exotic",
      mechanic: "OFFERING",
      worldId: "world-7",
      worldLabel: "Monde 7"
    });
    expect(exotic.funeralCandle).toMatchObject({ required: 10, deposited: 0 });
    expect(exotic.silverTear).toMatchObject({ required: 2, deposited: 0 });
    expect(exotic.brokenMask).toMatchObject({
      required: 1,
      sourceType: "WORLD",
      sourceKey: "world-7",
      baseDropRate: 0.005
    });
    expect(exotic.voidFlower.maximum).toBe(3);
  });

  it("allows tier-scaled timer flowers without ritual gates on other mechanics", () => {
    expect(bossSpecialOfferingRequirements({
      tier: "rare",
      mechanic: "HUNT",
      worldId: "world-1",
      worldLabel: "Monde 1"
    })).toEqual({
      voidFlower: { maximum: 2, deposited: 0 }
    });
  });

  it("disables timer flowers on persistent world guardians", () => {
    expect(bossSpecialOfferingRequirements({
      tier: "uncommon",
      mechanic: "EXPEDITION_MINION",
      worldId: "world-2",
      worldLabel: "Monde 2",
      persistent: true
    })).toEqual({
      voidFlower: { maximum: 0, deposited: 0 }
    });
  });
});

describe("simultaneous capture boss progression", () => {
  it("counts a normal capture for every compatible hunt boss", () => {
    expect(eligibleCaptureBossMechanics(false)).toEqual(["HUNT"]);
  });

  it("counts an anomalous trace for hunt and minion bosses together", () => {
    expect(eligibleCaptureBossMechanics(true)).toEqual([
      "HUNT",
      "EXPEDITION_MINION"
    ]);
  });
});

describe("boss target scaling", () => {
  it("uses the documented lower bound and player curve", () => {
    expect(scaleBossTarget(100, 0)).toBe(75);
    expect(scaleBossTarget(100, 25)).toBe(175);
  });

  it("caps very large communities", () => {
    expect(scaleBossTarget(100, 10_000)).toBe(250);
  });

  it("keeps mastery thresholds separate from achievable collection objectives", () => {
    expect(bossObjectiveTarget("GUARDIAN", "HARMONIZATION", 1, 1, 30)).toBe(29);
    expect(bossObjectiveTarget(
      "GUARDIAN",
      "COLLECTIVE_COLLECTION",
      8,
      25,
      240
    )).toBe(240);
    expect(bossObjectiveTarget(
      "REGULAR",
      "COLLECTIVE_COLLECTION",
      1,
      1,
      90,
      "common"
    )).toBeGreaterThan(11);
  });

  it("never asks for more unique cards than are actually published", () => {
    expect(bossObjectiveTarget(
      "REGULAR",
      "COLLECTIVE_COLLECTION",
      9,
      100,
      30,
      "exotic"
    )).toBe(30);
  });

  it("makes a regular boss depend on its tier rather than its world", () => {
    expect(bossObjectiveTarget("REGULAR", "HUNT", 1, 9, 0, "rare")).toBe(
      bossObjectiveTarget("REGULAR", "HUNT", 9, 9, 0, "rare")
    );
    expect(
      bossObjectiveTarget("REGULAR", "HUNT", 1, 9, 0, "exotic")
    ).toBeGreaterThan(
      bossObjectiveTarget("REGULAR", "HUNT", 1, 9, 0, "common")
    );
  });
});

describe("rally banner progression", () => {
  it("adds exactly 20 percent cumulatively without inventing fractional points", () => {
    const gains = Array.from({ length: 10 }, (_, prior) =>
      rallyBannerProgressAmount(prior, 1)
    );
    expect(gains).toEqual([1, 1, 1, 1, 2, 1, 1, 1, 1, 2]);
    expect(gains.reduce((sum, gain) => sum + gain, 0)).toBe(12);
  });

  it("supports multi-point contributions with the same cumulative rule", () => {
    expect(rallyBannerProgressAmount(0, 5)).toBe(6);
    expect(rallyBannerProgressAmount(3, 7)).toBe(9);
  });
});

describe("boss collection requirement wording", () => {
  it("names the exact regular-world scope and target", () => {
    expect(bossCollectionRequirementLabel({
      kind: "REGULAR",
      worldPosition: 1,
      worldName: "Monde 1 - Découverte & Culture Web",
      target: 10
    })).toBe("10 cartes différentes parmi Monde 1 - Découverte & Culture Web");
  });

  it("explains the multi-world scope of late progression guardians", () => {
    expect(bossCollectionRequirementLabel({
      kind: "GUARDIAN",
      worldPosition: 8,
      worldName: "Monde 8",
      target: 60
    })).toBe("60 cartes différentes parmi les mondes 1 à 8");
  });
});

describe("daily boss slot", () => {
  it("uses the current Paris midnight and a fixed 24-hour duration", () => {
    const window = dailyBossWindow(
      new Date("2026-07-28T12:00:00.000Z"),
      "Europe/Paris"
    );
    expect(window.dayKey).toBe("2026-07-28");
    expect(window.startsAt.toISOString()).toBe("2026-07-27T22:00:00.000Z");
    expect(window.endsAt.toISOString()).toBe("2026-07-28T22:00:00.000Z");
  });

  it("finds the next local midnight even late in the evening", () => {
    expect(nextDailyBossSlot(
      new Date("2026-07-28T21:30:00.000Z"),
      "Europe/Paris"
    ).toISOString()).toBe("2026-07-28T22:00:00.000Z");
  });

  it("ends at the next Paris midnight across the spring clock change", () => {
    const window = dailyBossWindow(
      new Date("2026-03-29T12:00:00.000Z"),
      "Europe/Paris"
    );
    expect(window.startsAt.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(window.endsAt.toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });

  it("ends at the next Paris midnight across the autumn clock change", () => {
    const window = dailyBossWindow(
      new Date("2026-10-25T12:00:00.000Z"),
      "Europe/Paris"
    );
    expect(window.startsAt.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(window.endsAt.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("weekly progression guardian slot", () => {
  it("converts the Paris winter slot to UTC", () => {
    expect(nextWeeklyBossSlot(
      new Date("2026-01-05T12:00:00.000Z"),
      0,
      "18:00",
      "Europe/Paris"
    ).toISOString()).toBe("2026-01-11T17:00:00.000Z");
  });

  it("converts the Paris summer slot to UTC", () => {
    expect(nextWeeklyBossSlot(
      new Date("2026-07-27T12:00:00.000Z"),
      0,
      "18:00",
      "Europe/Paris"
    ).toISOString()).toBe("2026-08-02T16:00:00.000Z");
  });
});

describe("boss mechanic selection", () => {
  it("uses the first supported Vault primary mechanic", () => {
    expect(preferredBossMechanic({
      primaryMechanics: ["UNKNOWN", "COLLECTIVE_COLLECTION"],
      allowedMechanics: ["HUNT"]
    })).toBe("COLLECTIVE_COLLECTION");
  });

  it("falls back to capture hunting", () => {
    expect(preferredBossMechanic(null)).toBe("HUNT");
  });

  it("keeps every supported mechanic declared by a regular boss", () => {
    expect(bossMechanicCandidates({
      primaryMechanics: ["COLLECTIVE_COLLECTION"],
      allowedMechanics: ["COLLECTIVE_COLLECTION", "HUNT", "OFFERING", "UNKNOWN"]
    })).toEqual(["COLLECTIVE_COLLECTION", "HUNT", "OFFERING"]);
  });

  it("selects the unlocked world before the boss and its mechanic", () => {
    const definitions = [
      {
        contentKey: "boss.world_01",
        worldId: "world-1",
        metadata: {
          primaryMechanics: ["COLLECTIVE_COLLECTION"],
          allowedMechanics: ["COLLECTIVE_COLLECTION", "HUNT", "OFFERING"]
        }
      },
      {
        contentKey: "boss.world_02",
        worldId: "world-2",
        metadata: {
          primaryMechanics: ["EXPEDITION_MINION"],
          allowedMechanics: ["EXPEDITION_MINION", "HUNT"]
        }
      },
      {
        contentKey: "boss.locked",
        worldId: "world-9",
        metadata: { allowedMechanics: ["OFFERING"] }
      }
    ];
    const selections = Array.from({ length: 500 }, (_, index) =>
      selectDailyRegularBoss({
        definitions,
        unlockedWorldIds: ["world-1", "world-2"],
        seed: `guild:2026-08-${index}`
      })
    );
    expect(new Set(selections.map((selection) => selection?.definition.worldId)))
      .toEqual(new Set(["world-1", "world-2"]));
    expect(selections.some((selection) => selection?.definition.worldId === "world-9"))
      .toBe(false);
    expect(new Set(
      selections
        .filter((selection) => selection?.definition.worldId === "world-1")
        .map((selection) => selection?.mechanic)
    )).toEqual(new Set(["COLLECTIVE_COLLECTION", "HUNT", "OFFERING"]));
  });
});

describe("regular boss category selection", () => {
  it("is deterministic and stays inside the Vault compatibility list", () => {
    const metadata = {
      categories: ["TREASURE_GUARDIAN", "CARD_PREDATOR", "WORLD_INVADER"]
    };
    const first = deterministicBossCategory(metadata, "boss:2026-07-30");
    expect(deterministicBossCategory(metadata, "boss:2026-07-30")).toBe(first);
    expect(metadata.categories).toContain(first);
  });

  it("falls back to the treasure category for invalid metadata", () => {
    expect(deterministicBossCategory({ categories: ["UNKNOWN"] }, "seed"))
      .toBe("TREASURE_GUARDIAN");
  });
});

describe("boss apparition tiers", () => {
  it("keeps every regular tier possible in every world with stable weights", () => {
    expect(Object.values(REGULAR_BOSS_TIER_WEIGHTS).reduce(
      (sum, weight) => sum + weight,
      0
    )).toBe(100);
    const tiers = new Set(
      Array.from({ length: 5_000 }, (_, index) =>
        deterministicRegularBossTier(`world-any:${index}`)
      )
    );
    expect(tiers).toEqual(new Set([
      "common",
      "uncommon",
      "rare",
      "very_rare",
      "import",
      "exotic"
    ]));
  });

  it("fixes guardian tiers from the progression world only", () => {
    expect(bossTierForAppearance({
      kind: "GUARDIAN",
      worldPosition: 1,
      seed: "ignored"
    })).toBe("common");
    expect(bossTierForAppearance({
      kind: "GUARDIAN",
      worldPosition: 8,
      seed: "ignored"
    })).toBe("exotic");
  });

  it("increases every guaranteed reward with the tier", () => {
    expect(BOSS_TIER_BALANCE.exotic.credits)
      .toBeGreaterThan(BOSS_TIER_BALANCE.common.credits);
    expect(BOSS_TIER_BALANCE.exotic.xp)
      .toBeGreaterThan(BOSS_TIER_BALANCE.common.xp);
    expect(BOSS_TIER_BALANCE.exotic.fragments)
      .toBeGreaterThan(BOSS_TIER_BALANCE.common.fragments);
    expect(bossRewardForTier(
      "REGULAR",
      "TREASURE_GUARDIAN",
      "exotic"
    )).toMatchObject({
      credits: 800,
      xp: 550,
      fragments: 12,
      conquerorTier: "exotic"
    });
    expect(bossRewardForTier(
      "GUARDIAN",
      "WORLD_GUARDIAN",
      "common"
    )).toMatchObject({
      credits: 156,
      xp: 100,
      fragments: 2,
      conquerorTier: "common"
    });
  });
});
