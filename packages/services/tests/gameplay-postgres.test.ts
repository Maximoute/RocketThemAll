import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@rta/database";
import { AchievementService } from "../src/achievement.service.js";
import { DailyQuestService } from "../src/daily-quest.service.js";
import { RecycleService } from "../src/recycle.service.js";
import { ConquerorRewardService } from "../src/conqueror-reward.service.js";
import { CollectionContractService } from "../src/collection-contract.service.js";
import {
  BossService,
  bossOfferingObjectives,
  bossSpecialOfferingRequirements
} from "../src/boss.service.js";

const enabled = Boolean(process.env.RTA_TEST_DATABASE_URL);
const suite = enabled ? describe.sequential : describe.skip;
const prefix = `gameplay-test-${randomUUID()}`;
const userIds: string[] = [];
const guildIds: string[] = [];
const contractIds: string[] = [];

suite("gameplay PostgreSQL integration", () => {
  beforeAll(async () => {
    expect(await prisma.card.count({ where: { source: "vault" } })).toBe(810);
    expect(await prisma.questDefinition.count({
      where: {
        status: "PUBLISHED",
        metadata: { path: ["source"], equals: "vault" }
      }
    })).toBe(90);
    expect(await prisma.skillDefinition.count({ where: { status: "PUBLISHED" } })).toBe(45);
  });

  afterAll(async () => {
    if (!enabled) return;
    await prisma.economicLedgerEntry.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.transactionLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.economyLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.captureLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { aggregateId: { in: [...userIds, ...contractIds] } },
          { eventId: { startsWith: prefix } }
        ]
      }
    });
    await prisma.scheduledJob.deleteMany({
      where: {
        OR: [
          {
            dedupeKey: {
              in: contractIds.map((id) => `collection-contract.expire:${id}`)
            }
          },
          { dedupeKey: { startsWith: prefix } }
        ]
      }
    });
    await prisma.idempotencyRecord.deleteMany({
      where: {
        OR: [
          { scopeKey: { contains: prefix } },
          { key: { contains: prefix } }
        ]
      }
    });
    await prisma.actionCooldown.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.fragmentBalance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.collectionRewardClaim.deleteMany({
      where: { userId: { in: userIds } }
    });
    await prisma.inventoryItem.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userBooster.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.booster.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.guild.deleteMany({ where: { id: { in: guildIds } } });
    await prisma.questDefinition.deleteMany({
      where: { contentKey: { startsWith: prefix } }
    });
    await prisma.$disconnect();
  });

  it("completes a level-up daily quest without breaking the additive XP ledger", async () => {
    const user = await prisma.user.create({
      data: {
        discordId: `${prefix}-xp`,
        username: "XP integration",
        level: 1,
        xp: 90,
        progress: { create: { level: 1, xp: 90 } }
      }
    });
    userIds.push(user.id);
    const definition = await prisma.questDefinition.create({
      data: {
        contentKey: `${prefix}-quest`,
        name: "Ouvrir un booster",
        eventType: "BOOSTER_OPENED",
        objectiveKey: "OPEN_BOOSTER",
        target: 1,
        reward: {},
        metadata: { difficulties: ["EASY"] },
        status: "PUBLISHED"
      }
    });
    const quest = await prisma.userDailyQuest.create({
      data: {
        userId: user.id,
        definitionId: definition.id,
        dayKey: "2099-01-01",
        slot: 0,
        targetSnapshot: 1,
        rewardSnapshot: { difficulty: "EASY", xp: 200, credits: 0 },
        expiresAt: new Date("2099-01-02T00:00:00.000Z")
      }
    });
    await new DailyQuestService().processDomainEvent({
      eventId: `${prefix}-booster-event`,
      eventType: "booster.opened",
      aggregateId: user.id,
      payload: { userId: user.id }
    });
    const [completed, ledger, progress] = await Promise.all([
      prisma.userDailyQuest.findUniqueOrThrow({ where: { id: quest.id } }),
      prisma.economicLedgerEntry.findUniqueOrThrow({
        where: { operationKey: `daily-quest:${quest.id}:xp` }
      }),
      prisma.userProgress.findUniqueOrThrow({ where: { userId: user.id } })
    ]);
    expect(completed.status).toBe("CLAIMED");
    expect(progress.level).toBeGreaterThan(1);
    expect(ledger.balanceAfter - ledger.balanceBefore).toBe(ledger.delta);
  });

  it("counts normal and special exploration events in achievements", async () => {
    const [zone, card] = await Promise.all([
      prisma.zoneDefinition.findFirstOrThrow({ where: { status: "PUBLISHED" } }),
      prisma.card.findFirstOrThrow({ where: { source: "vault", status: "PUBLISHED" } })
    ]);
    const user = await prisma.user.create({
      data: { discordId: `${prefix}-events`, username: "Event integration" }
    });
    userIds.push(user.id);
    const guild = await prisma.guild.create({
      data: { discordId: `${prefix}-guild`, name: "Integration guild" }
    });
    guildIds.push(guild.id);
    const now = new Date();
    const encounter = await prisma.encounter.create({
      data: {
        guildId: guild.id,
        zoneId: zone.id,
        cardId: card.id,
        initiatorUserId: user.id,
        channelId: "integration",
        status: "RESOLVED",
        seedHash: prefix,
        opensAt: now,
        closesAt: new Date(now.getTime() + 60_000),
        resolvedAt: now,
        eventKey: "COSMIC_JACKPOT",
        eventSpecial: true
      }
    });
    await prisma.explorationEventCompletion.create({
      data: {
        encounterId: encounter.id,
        userId: user.id,
        eventKey: "COSMIC_JACKPOT",
        isSpecial: true,
        succeeded: true,
        reward: { credits: 10 }
      }
    });
    await new AchievementService().evaluateUser(user.id);
    const rows = await prisma.userAchievement.findMany({
      where: {
        userId: user.id,
        achievement: {
          contentKey: { in: ["EVENTS_COMPLETED_T1", "SPECIAL_EVENTS_T1"] }
        }
      },
      include: { achievement: true }
    });
    expect(Object.fromEntries(rows.map((row) => [row.achievement.contentKey, row.progress])))
      .toEqual({ EVENTS_COMPLETED_T1: 1, SPECIAL_EVENTS_T1: 1 });
  });

  it("serializes concurrent recycling and never creates a negative inventory", async () => {
    const card = await prisma.card.findFirstOrThrow({
      where: { source: "vault", status: "PUBLISHED", rarity: { name: "Common" } }
    });
    const protection = await prisma.skillDefinition.findFirstOrThrow({
      where: { effectKey: "COL_PROTECT_LAST_COPY", status: "PUBLISHED" }
    });
    const user = await prisma.user.create({
      data: {
        discordId: `${prefix}-recycle`,
        username: "Concurrency integration",
        inventory: {
          create: { cardId: card.id, variant: "normal", quantity: 1 }
        },
        skills: {
          create: { skillId: protection.id, rank: 1 }
        }
      }
    });
    userIds.push(user.id);
    const service = new RecycleService();
    const results = await Promise.allSettled([
      service.recycleCard(
        user.id,
        card.id,
        1,
        `${prefix}-recycle-a`,
        "normal",
        { confirmedLastCopy: true }
      ),
      service.recycleCard(
        user.id,
        card.id,
        1,
        `${prefix}-recycle-b`,
        "normal",
        { confirmedLastCopy: true }
      )
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const remaining = await prisma.inventoryItem.aggregate({
      where: { userId: user.id, cardId: card.id },
      _sum: { quantity: true }
    });
    expect(remaining._sum.quantity ?? 0).toBe(0);
  });

  it("consumes credits, fragments and one safe duplicate for an offering boss", async () => {
    const definition = await prisma.bossDefinition.findFirstOrThrow({
      where: {
        status: "PUBLISHED",
        kind: "REGULAR",
        metadata: { path: ["primaryMechanics"], array_contains: ["OFFERING"] }
      },
      include: { world: true }
    });
    expect(definition.world).not.toBeNull();
    const card = await prisma.card.findFirstOrThrow({
      where: {
        source: "vault",
        status: "PUBLISHED",
        deck: {
          zones: {
            some: { zone: { worldId: definition.worldId! } }
          }
        }
      }
    });
    const user = await prisma.user.create({
      data: {
        discordId: `${prefix}-boss-offering`,
        username: "Boss offering integration",
        credits: 1_000,
        fragments: 10,
        inventory: {
          create: { cardId: card.id, variant: "normal", quantity: 2 }
        }
      }
    });
    userIds.push(user.id);
    const guild = await prisma.guild.create({
      data: {
        discordId: `${prefix}-boss-offering-guild`,
        name: "Boss offering guild"
      }
    });
    guildIds.push(guild.id);
    const objectives = bossOfferingObjectives(
      1_000,
      definition.world!.id,
      definition.world!.name
    );
    const now = new Date();
    const run = await prisma.bossRun.create({
      data: {
        guildId: guild.id,
        definitionId: definition.id,
        slotKey: `${prefix}-offering-slot`,
        category: "TREASURE_GUARDIAN",
        mechanic: "OFFERING",
        status: "ACTIVE",
        targetSnapshot: objectives.totalPoints,
        activePlayers: 1,
        objectiveSnapshot: {
          offeringObjectives: {
            credits: objectives.credits,
            fragments: objectives.fragments,
            duplicateCards: objectives.duplicateCards
          },
          specialOfferings: bossSpecialOfferingRequirements({
            tier: "common",
            mechanic: "OFFERING",
            worldId: definition.world!.id,
            worldLabel: definition.world!.name
          })
        },
        rewardSnapshot: {},
        scheduledAt: now,
        startsAt: now,
        endsAt: new Date(now.getTime() + 60 * 60_000)
      }
    });
    const service = new BossService();
    const preview = await service.getOfferingContributionPreview({
      bossRunId: run.id,
      userId: user.id
    });
    expect(preview.duplicateCard?.name).toBe(card.name);

    await service.contributeCredits({
      bossRunId: run.id,
      userId: user.id,
      amount: 100,
      operationKey: `${prefix}-boss-credit`
    });
    await service.contributeFragments({
      bossRunId: run.id,
      userId: user.id,
      quantity: 1,
      operationKey: `${prefix}-boss-fragment`
    });
    await service.contributeDuplicateCard({
      bossRunId: run.id,
      userId: user.id,
      operationKey: `${prefix}-boss-card`
    });

    const [updatedUser, updatedRun, inventory] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.bossRun.findUniqueOrThrow({ where: { id: run.id } }),
      prisma.inventoryItem.findUniqueOrThrow({
        where: {
          userId_cardId_variant: {
            userId: user.id,
            cardId: card.id,
            variant: "normal"
          }
        }
      })
    ]);
    expect(updatedUser.credits).toBe(900);
    expect(updatedUser.fragments).toBe(9);
    expect(inventory.quantity).toBe(1);
    expect(updatedRun.progress).toBe(300);
    expect(await prisma.bossContribution.count({
      where: { bossRunId: run.id }
    })).toBe(3);
  });

  it("opens Conqueror boosters and chests atomically and replays safely", async () => {
    const [booster, chest] = await Promise.all([
      prisma.itemDefinition.findUniqueOrThrow({
        where: { contentKey: "booster.boss_choice.rare" }
      }),
      prisma.itemDefinition.findUniqueOrThrow({
        where: { contentKey: "chest.boss_reward.rare" }
      })
    ]);
    const user = await prisma.user.create({
      data: {
        discordId: `${prefix}-conqueror`,
        username: "Conqueror integration",
        progress: { create: {} },
        items: {
          create: [
            { itemId: booster.id, quantity: 1 },
            { itemId: chest.id, quantity: 1 }
          ]
        }
      }
    });
    userIds.push(user.id);
    const service = new ConquerorRewardService();
    const prepared = await service.prepareBoosterChoices(user.id, booster.contentKey);
    expect(prepared.choices).toHaveLength(3);
    expect(new Set(prepared.choices.map((choice) => choice.card.id)).size).toBe(3);

    const claimed = await service.claimBoosterChoice(
      user.id,
      booster.contentKey,
      prepared.openingNumber,
      1
    );
    const replay = await service.claimBoosterChoice(
      user.id,
      booster.contentKey,
      prepared.openingNumber,
      1
    );
    expect(replay.replayed).toBe(true);
    expect(replay.card.id).toBe(claimed.card.id);
    expect(await prisma.userItem.findUniqueOrThrow({
      where: { userId_itemId: { userId: user.id, itemId: booster.id } }
    })).toMatchObject({ quantity: 0 });

    const chestKey = `${prefix}-chest-open`;
    const opened = await service.openChest(user.id, chest.contentKey, chestKey);
    const openedReplay = await service.openChest(user.id, chest.contentKey, chestKey);
    expect(openedReplay.replayed).toBe(true);
    expect(openedReplay.consumableKey).toBe(opened.consumableKey);
    expect(opened.credits).toBeGreaterThanOrEqual(500);
    expect(opened.credits).toBeLessThanOrEqual(1_000);
    expect(await prisma.userItem.findUniqueOrThrow({
      where: { userId_itemId: { userId: user.id, itemId: chest.id } }
    })).toMatchObject({ quantity: 0 });
  });

  it("escrows, fulfills and settles a collection search contract", async () => {
    const card = await prisma.card.findFirstOrThrow({
      where: { source: "vault", status: "PUBLISHED", rarity: { name: "Common" } }
    });
    const broker = await prisma.skillDefinition.findFirstOrThrow({
      where: {
        effectKey: "COL_BROKER_GRANT_CONTRACT_TABLE",
        status: "PUBLISHED"
      }
    });
    const requester = await prisma.user.create({
      data: {
        discordId: `${prefix}-contract-requester`,
        username: "Contract requester",
        credits: 1_000,
        skills: { create: { skillId: broker.id, rank: 1 } }
      }
    });
    const fulfiller = await prisma.user.create({
      data: {
        discordId: `${prefix}-contract-fulfiller`,
        username: "Contract fulfiller",
        inventory: {
          create: { cardId: card.id, variant: "normal", quantity: 2 }
        }
      }
    });
    userIds.push(requester.id, fulfiller.id);
    const guild = await prisma.guild.create({
      data: {
        discordId: `${prefix}-contract-guild`,
        name: "Contract guild",
        config: { create: { gameChannelId: "integration" } },
        members: {
          create: [
            { userId: requester.id, isActive: true },
            { userId: fulfiller.id, isActive: true }
          ]
        }
      }
    });
    guildIds.push(guild.id);

    const service = new CollectionContractService();
    const contract = await service.createContract({
      discordGuildId: guild.discordId,
      userId: requester.id,
      cardId: card.id,
      type: "SEARCH",
      rewardCredits: 500,
      operationKey: `${prefix}-contract-create`
    });
    contractIds.push(contract.id);
    expect((await prisma.user.findUniqueOrThrow({
      where: { id: requester.id }
    })).credits).toBe(500);

    const fulfilled = await service.fulfillContract(
      contract.id,
      fulfiller.id,
      `${prefix}-contract-fulfill`
    );
    expect(fulfilled.contract.status).toBe("COMPLETED");
    expect((await prisma.user.findUniqueOrThrow({
      where: { id: fulfiller.id }
    })).credits).toBe(500);
    const [requesterQuantity, fulfillerQuantity] = await Promise.all([
      prisma.inventoryItem.aggregate({
        where: { userId: requester.id, cardId: card.id },
        _sum: { quantity: true }
      }),
      prisma.inventoryItem.aggregate({
        where: { userId: fulfiller.id, cardId: card.id },
        _sum: { quantity: true }
      })
    ]);
    expect(requesterQuantity._sum.quantity).toBe(1);
    expect(fulfillerQuantity._sum.quantity).toBe(1);
  });
});
