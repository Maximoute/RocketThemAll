import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@rta/database";
import {
  AchievementService,
  MAX_SELECTED_ACHIEVEMENT_BADGES
} from "../src/achievement.service.js";

const enabled = Boolean(process.env.RTA_TEST_DATABASE_URL);
const suite = enabled ? describe.sequential : describe.skip;
const prefix = `achievement-badge-test-${randomUUID()}`;
const service = new AchievementService();
let userId = "";
let achievementIds: string[] = [];

suite("achievement badge selection PostgreSQL integration", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { discordId: `${prefix}-user`, username: "Badge tester" }
    });
    userId = user.id;
    const definitions = (await prisma.achievementDefinition.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { contentKey: "asc" },
      take: 20
    })).filter((definition) => {
      const metadata = definition.metadata;
      return !(metadata && typeof metadata === "object" && !Array.isArray(metadata)
        && (metadata as Record<string, unknown>).generatorTemplate === true);
    }).slice(0, 5);
    expect(definitions).toHaveLength(5);
    achievementIds = definitions.map((definition) => definition.id);
    await prisma.userAchievement.createMany({
      data: definitions.map((definition, index) => ({
        userId,
        achievementId: definition.id,
        progress: index < 4 ? definition.target : 0,
        unlockedAt: index < 4 ? new Date() : null
      }))
    });
  });

  afterAll(async () => {
    if (!enabled) return;
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("stores and exposes at most three unlocked badges", async () => {
    await service.setSelectedBadges(
      userId,
      achievementIds.slice(0, MAX_SELECTED_ACHIEVEMENT_BADGES)
    );
    const summary = await service.getUserSummary(userId);
    expect(summary.selectedBadges.map((badge) => badge.id).sort()).toEqual(
      achievementIds.slice(0, 3).sort()
    );
    expect(summary.selectedBadges.every((badge) => badge.selectedAsBadge)).toBe(true);
  });

  it("rejects a fourth badge and a locked achievement", async () => {
    await expect(service.setSelectedBadges(userId, achievementIds.slice(0, 4)))
      .rejects.toThrow("au maximum 3 badges");
    await expect(service.setSelectedBadges(userId, [achievementIds[4]!]))
      .rejects.toThrow("achievements débloqués");
  });

  it("replaces and clears the selection", async () => {
    await service.setSelectedBadges(userId, [achievementIds[3]!]);
    expect((await service.getSelectedBadges(userId)).map((row) => row.achievementId))
      .toEqual([achievementIds[3]]);
    await service.setSelectedBadges(userId, []);
    expect(await service.getSelectedBadges(userId)).toHaveLength(0);
  });
});
