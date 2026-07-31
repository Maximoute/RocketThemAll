import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";

export const MAX_SELECTED_ACHIEVEMENT_BADGES = 3;

export const ACHIEVEMENT_CATEGORIES = [
  "EXPLORATION",
  "COLLECTION",
  "PROGRESSION",
  "ECONOMY",
  "SOCIAL",
  "CONTENT",
  "SPECIAL"
] as const;

export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

type AchievementMetrics = {
  values: Record<string, number>;
  discoveriesByMinimumRarity: Record<string, number>;
  variantsAcquired: Record<string, number>;
};

type DefinitionLike = {
  objectiveKey: string;
  metadata: Prisma.JsonValue | null;
};

export type AchievementView = {
  id: string;
  contentKey: string;
  name: string;
  description: string | null;
  readableObjective: string | null;
  category: AchievementCategory;
  tier: number;
  tierLabel: string | null;
  target: number;
  progress: number;
  points: number;
  hidden: boolean;
  unlockedAt: Date | null;
  unlocked: boolean;
  selectedAsBadge: boolean;
};

export type AchievementSummary = {
  catalogCount: number;
  templateCount: number;
  total: number;
  unlocked: number;
  points: number;
  completionPercent: number;
  achievements: AchievementView[];
  selectedBadges: AchievementView[];
  latestUnlocked: AchievementView[];
  nearestLocked: AchievementView[];
  categoryCounts: Array<{
    category: AchievementCategory;
    total: number;
    unlocked: number;
  }>;
};

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function numberValue(value: Prisma.JsonValue | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function booleanValue(value: Prisma.JsonValue | undefined) {
  return value === true;
}

function parameterValue(metadata: Prisma.JsonValue | null, key: string) {
  const parameters = textValue(jsonRecord(metadata).parameters);
  if (!parameters) return null;
  const match = parameters.match(new RegExp(`${key}\\s*=\\s*([A-Z_]+)`, "i"));
  return match?.[1]?.toUpperCase() ?? null;
}

function normalizeRarityKey(value: string) {
  return value.trim().toUpperCase().replaceAll(" ", "_");
}

const RARITY_RANK: Record<string, number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  VERY_RARE: 3,
  IMPORT: 4,
  EXOTIC: 5,
  BLACK_MARKET: 6,
  LIMITED: 7
};

export function resolveAchievementMetric(
  definition: DefinitionLike,
  metrics: AchievementMetrics
) {
  if (definition.objectiveKey === "DISCOVERIES_MIN_RARITY") {
    const rarity = parameterValue(definition.metadata, "minimumRarity") ?? "COMMON";
    return metrics.discoveriesByMinimumRarity[rarity] ?? 0;
  }
  if (definition.objectiveKey === "VARIANTS_ACQUIRED") {
    const variant = parameterValue(definition.metadata, "variant") ?? "NORMAL";
    return metrics.variantsAcquired[variant] ?? 0;
  }
  return metrics.values[definition.objectiveKey] ?? 0;
}

function achievementCategory(metadata: Prisma.JsonValue | null): AchievementCategory {
  const category = textValue(jsonRecord(metadata).category)?.toUpperCase();
  return ACHIEVEMENT_CATEGORIES.includes(category as AchievementCategory)
    ? category as AchievementCategory
    : "SPECIAL";
}

function isGeneratorTemplate(metadata: Prisma.JsonValue | null) {
  return booleanValue(jsonRecord(metadata).generatorTemplate);
}

function rewardPoints(reward: Prisma.JsonValue | null) {
  return Math.max(0, Math.floor(numberValue(jsonRecord(reward).points)));
}

function cardIdFromLedger(row: {
  referenceType: string;
  referenceId: string;
  assetKey: string | null;
}) {
  if (row.referenceType === "Card") return row.referenceId;
  if (!row.assetKey) return null;
  const separator = row.assetKey.lastIndexOf(":");
  return separator > 0 ? row.assetKey.slice(0, separator) : row.assetKey;
}

function variantFromAssetKey(assetKey: string | null) {
  const value = assetKey?.split(":").at(-1)?.toUpperCase();
  return value === "SHINY" || value === "HOLO" ? value : "NORMAL";
}

function boosterCardsFromMetadata(metadata: Prisma.JsonValue | null) {
  const record = jsonRecord(metadata);
  const cardIds = Array.isArray(record.cardIds)
    ? record.cardIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const variants = Array.isArray(record.variants)
    ? record.variants.map((entry) => String(entry).toUpperCase())
    : [];
  return cardIds.map((cardId, index) => ({
    cardId,
    variant: variants[index] === "SHINY" || variants[index] === "HOLO"
      ? variants[index]!
      : "NORMAL"
  }));
}

async function collectMetrics(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<AchievementMetrics> {
  const [
    user,
    progress,
    attempts,
    inventory,
    ledger,
    collectionClaims,
    dailyQuests,
    trades,
    explorationEvents,
    activeZones
  ] = await Promise.all([
    tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { level: true }
    }),
    tx.userProgress.findUnique({
      where: { userId },
      select: { level: true }
    }),
    tx.captureAttempt.findMany({
      where: { userId, resolvedAt: { not: null } },
      select: {
        status: true,
        submittedAt: true,
        variant: true,
        encounter: {
          select: {
            cardId: true,
            zoneId: true,
            zone: { select: { worldId: true } }
          }
        }
      }
    }),
    tx.inventoryItem.findMany({
      where: { userId, quantity: { gt: 0 } },
      select: {
        cardId: true,
        variant: true,
        quantity: true,
        card: {
          select: {
            deckId: true,
            rarity: { select: { name: true } }
          }
        }
      }
    }),
    tx.economicLedgerEntry.findMany({
      where: {
        userId,
        NOT: { reason: { startsWith: "admin." } }
      },
      select: {
        asset: true,
        assetKey: true,
        delta: true,
        reason: true,
        referenceType: true,
        referenceId: true,
        metadata: true
      }
    }),
    tx.collectionRewardClaim.count({ where: { userId } }),
    tx.userDailyQuest.findMany({
      where: { userId, status: "CLAIMED" },
      select: { dayKey: true, slot: true }
    }),
    tx.trade.findMany({
      where: {
        status: "completed",
        OR: [{ user1Id: userId }, { user2Id: userId }]
      },
      select: {
        user1Id: true,
        user2Id: true,
        items: {
          select: {
            userId: true,
            cardId: true,
            variant: true,
            quantity: true
          }
        }
      }
    }),
    tx.explorationEventCompletion.findMany({
      where: { userId },
      select: { isSpecial: true }
    }),
    tx.zoneDefinition.findMany({
      where: {
        status: "PUBLISHED",
        world: { status: "PUBLISHED" }
      },
      select: { id: true, worldId: true }
    })
  ]);

  const zoneCounts = new Map<string, number>();
  const worldCounts = new Map<string, number>();
  const visitedZones = new Set<string>();
  const visitedWorlds = new Set<string>();
  const activeDays = new Set<string>();
  const successfulAttempts = attempts.filter((attempt) => attempt.status === "SUCCEEDED");
  const successfulVariantCounts = { NORMAL: 0, SHINY: 0, HOLO: 0 };

  for (const attempt of attempts) {
    const zoneId = attempt.encounter.zoneId;
    const worldId = attempt.encounter.zone.worldId;
    visitedZones.add(zoneId);
    visitedWorlds.add(worldId);
    zoneCounts.set(zoneId, (zoneCounts.get(zoneId) ?? 0) + 1);
    worldCounts.set(worldId, (worldCounts.get(worldId) ?? 0) + 1);
    activeDays.add(attempt.submittedAt.toISOString().slice(0, 10));
    if (attempt.status === "SUCCEEDED") {
      const variant = attempt.variant?.toUpperCase() ?? "NORMAL";
      successfulVariantCounts[
        variant === "SHINY" || variant === "HOLO" ? variant : "NORMAL"
      ] += 1;
    }
  }

  const zonesByWorld = new Map<string, string[]>();
  for (const zone of activeZones) {
    const zones = zonesByWorld.get(zone.worldId) ?? [];
    zones.push(zone.id);
    zonesByWorld.set(zone.worldId, zones);
  }
  const worldsFullyVisited = [...zonesByWorld.values()]
    .filter((zones) => zones.length > 0 && zones.every((zoneId) => visitedZones.has(zoneId)))
    .length;

  let creditsEarned = 0;
  let creditsSpent = 0;
  let fragmentsEarned = 0;
  let cardsSold = 0;
  let cardsRecycled = 0;
  let boostersOpened = 0;
  let boostersCrafted = 0;
  let fusionsCompleted = 0;
  let cardLedgerAcquisitions = 0;
  const discoveredCardIds = new Set(inventory.map((entry) => entry.cardId));
  const ledgerVariantCounts = { NORMAL: 0, SHINY: 0, HOLO: 0 };
  const boosterAcquisitions: Array<{ cardId: string; variant: string }> = [];

  for (const row of ledger) {
    if (row.asset === "CREDITS") {
      if (row.delta > 0) creditsEarned += row.delta;
      if (row.delta < 0) creditsSpent += -row.delta;
    }
    if (row.asset === "FRAGMENTS" && row.delta > 0) fragmentsEarned += row.delta;
    if (row.asset === "CARD" && row.delta < 0 && row.reason === "card.sold") {
      cardsSold += -row.delta;
    }
    if (row.asset === "CARD" && row.delta < 0 && row.reason === "card.recycled") {
      cardsRecycled += -row.delta;
    }
    if (row.asset === "BOOSTER" && row.delta < 0 && row.reason === "booster.opened") {
      boostersOpened += -row.delta;
      boosterAcquisitions.push(...boosterCardsFromMetadata(row.metadata));
    }
    if (row.asset === "BOOSTER" && row.delta > 0 && row.reason === "booster.crafted") {
      boostersCrafted += row.delta;
    }
    if (row.asset === "CARD" && row.delta > 0) {
      cardLedgerAcquisitions += row.delta;
      const cardId = cardIdFromLedger(row);
      if (cardId) discoveredCardIds.add(cardId);
      ledgerVariantCounts[variantFromAssetKey(row.assetKey)] += row.delta;
      if (row.reason === "card.fusion.reward") fusionsCompleted += row.delta;
    }
  }

  for (const acquisition of boosterAcquisitions) {
    discoveredCardIds.add(acquisition.cardId);
    ledgerVariantCounts[
      acquisition.variant === "SHINY" || acquisition.variant === "HOLO"
        ? acquisition.variant
        : "NORMAL"
    ] += 1;
  }
  for (const attempt of successfulAttempts) {
    discoveredCardIds.add(attempt.encounter.cardId);
  }

  const tradePartners = new Set<string>();
  let tradeItemsTransferred = 0;
  let tradeReceivedCards = 0;
  for (const trade of trades) {
    tradePartners.add(trade.user1Id === userId ? trade.user2Id : trade.user1Id);
    for (const item of trade.items) {
      tradeItemsTransferred += item.quantity;
      if (item.userId !== userId && item.cardId) {
        tradeReceivedCards += item.quantity;
        discoveredCardIds.add(item.cardId);
        const variant = item.variant.toUpperCase();
        ledgerVariantCounts[
          variant === "SHINY" || variant === "HOLO" ? variant : "NORMAL"
        ] += item.quantity;
      }
    }
  }

  const discoveredCards = discoveredCardIds.size > 0
    ? await tx.card.findMany({
        where: { id: { in: [...discoveredCardIds] } },
        select: {
          id: true,
          rarity: { select: { name: true } }
        }
      })
    : [];
  const discoveriesByMinimumRarity: Record<string, number> = {};
  for (const minimum of Object.keys(RARITY_RANK)) {
    const minimumRank = RARITY_RANK[minimum]!;
    discoveriesByMinimumRarity[minimum] = discoveredCards.filter((card) =>
      (RARITY_RANK[normalizeRarityKey(card.rarity.name)] ?? -1) >= minimumRank
    ).length;
  }

  const currentUniqueCards = new Set(inventory.map((entry) => entry.cardId));
  const currentQuantity = inventory.reduce((sum, entry) => sum + entry.quantity, 0);
  const ownedByDeck = new Map<string, Set<string>>();
  for (const entry of inventory) {
    const owned = ownedByDeck.get(entry.card.deckId) ?? new Set<string>();
    owned.add(entry.cardId);
    ownedByDeck.set(entry.card.deckId, owned);
  }
  const deckTotals = await tx.card.groupBy({
    by: ["deckId"],
    where: {
      source: "vault",
      status: "PUBLISHED",
      isActive: true,
      deck: { status: "PUBLISHED", isActive: true }
    },
    _count: { id: true }
  });
  let decksHalfCompleted = 0;
  let decksCompleted = 0;
  for (const deck of deckTotals) {
    const completion = ((ownedByDeck.get(deck.deckId)?.size ?? 0) / Math.max(1, deck._count.id)) * 100;
    if (completion >= 50) decksHalfCompleted += 1;
    if (completion >= 100) decksCompleted += 1;
  }

  const claimedSlotsByDay = new Map<string, Set<number>>();
  for (const quest of dailyQuests) {
    const slots = claimedSlotsByDay.get(quest.dayKey) ?? new Set<number>();
    slots.add(quest.slot);
    claimedSlotsByDay.set(quest.dayKey, slots);
  }
  const perfectDailyDays = [...claimedSlotsByDay.values()]
    .filter((slots) => slots.size >= 3)
    .length;

  const totalAcquisitions = Math.max(
    currentQuantity,
    cardLedgerAcquisitions + boosterAcquisitions.length + tradeReceivedCards,
    successfulAttempts.length + boosterAcquisitions.length + fusionsCompleted + tradeReceivedCards
  );
  const variantsAcquired = {
    NORMAL: Math.max(
      ledgerVariantCounts.NORMAL,
      successfulVariantCounts.NORMAL,
      inventory
        .filter((entry) => entry.variant === "normal")
        .reduce((sum, entry) => sum + entry.quantity, 0)
    ),
    SHINY: Math.max(
      ledgerVariantCounts.SHINY,
      successfulVariantCounts.SHINY,
      inventory
        .filter((entry) => entry.variant === "shiny")
        .reduce((sum, entry) => sum + entry.quantity, 0)
    ),
    HOLO: Math.max(
      ledgerVariantCounts.HOLO,
      successfulVariantCounts.HOLO,
      inventory
        .filter((entry) => entry.variant === "holo")
        .reduce((sum, entry) => sum + entry.quantity, 0)
    )
  };

  return {
    values: {
      EXPLORATIONS_TOTAL: attempts.length,
      DISTINCT_ZONES_VISITED: visitedZones.size,
      DISTINCT_WORLDS_VISITED: visitedWorlds.size,
      MAX_EXPLORATIONS_ONE_ZONE: Math.max(0, ...zoneCounts.values()),
      MAX_EXPLORATIONS_ONE_WORLD: Math.max(0, ...worldCounts.values()),
      EVENTS_COMPLETED: explorationEvents.length,
      SPECIAL_EVENTS_COMPLETED: explorationEvents.filter((event) => event.isSpecial).length,
      ACTIVE_EXPLORATION_DAYS: activeDays.size,
      WORLDS_FULLY_VISITED: worldsFullyVisited,
      MAX_UNIQUE_ITEMS_OWNED: currentUniqueCards.size,
      ITEMS_ACQUIRED_TOTAL: totalAcquisitions,
      NEW_DISCOVERIES: discoveredCardIds.size,
      DECKS_COMPLETED: decksCompleted,
      DECKS_HALF_COMPLETED: decksHalfCompleted,
      MAX_LEVEL: Math.max(user.level, progress?.level ?? 1),
      DAILY_QUESTS_COMPLETED: dailyQuests.length,
      PERFECT_DAILY_DAYS: perfectDailyDays,
      COLLECTION_REWARDS_UNLOCKED: collectionClaims,
      CREDITS_EARNED: creditsEarned,
      CREDITS_SPENT: creditsSpent,
      CARDS_SOLD: cardsSold,
      CARDS_RECYCLED: cardsRecycled,
      FRAGMENTS_EARNED: fragmentsEarned,
      FUSIONS_COMPLETED: fusionsCompleted,
      BOOSTERS_OPENED: boostersOpened,
      BOOSTERS_CRAFTED: boostersCrafted,
      TRADES_COMPLETED: trades.length,
      DISTINCT_TRADE_PARTNERS: tradePartners.size,
      TRADE_ITEMS_TRANSFERRED: tradeItemsTransferred
    },
    discoveriesByMinimumRarity,
    variantsAcquired
  };
}

export class AchievementService {
  async evaluateUser(userId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"achievements:" + userId}, 0))`
      );
      const [definitions, existing, metrics] = await Promise.all([
        tx.achievementDefinition.findMany({
          where: { status: "PUBLISHED" },
          orderBy: [{ eventType: "asc" }, { target: "asc" }]
        }),
        tx.userAchievement.findMany({ where: { userId } }),
        collectMetrics(tx, userId)
      ]);
      const gameplayDefinitions = definitions.filter(
        (definition) => !isGeneratorTemplate(definition.metadata)
      );
      const existingByAchievement = new Map(
        existing.map((entry) => [entry.achievementId, entry])
      );
      const now = new Date();
      const creates: Prisma.UserAchievementCreateManyInput[] = [];
      const updates: Array<ReturnType<typeof tx.userAchievement.update>> = [];
      const newlyUnlocked: string[] = [];

      for (const definition of gameplayDefinitions) {
        const stored = existingByAchievement.get(definition.id);
        const measured = Math.max(0, Math.floor(resolveAchievementMetric(definition, metrics)));
        const progress = Math.min(
          definition.target,
          Math.max(stored?.progress ?? 0, measured)
        );
        const unlockedAt = stored?.unlockedAt ?? (
          progress >= definition.target ? now : null
        );
        if (!stored) {
          creates.push({
            userId,
            achievementId: definition.id,
            progress,
            unlockedAt
          });
          if (unlockedAt) newlyUnlocked.push(definition.contentKey);
          continue;
        }
        if (stored.progress !== progress || (!stored.unlockedAt && unlockedAt)) {
          updates.push(tx.userAchievement.update({
            where: { id: stored.id },
            data: {
              progress,
              unlockedAt,
              version: { increment: 1 }
            }
          }));
          if (!stored.unlockedAt && unlockedAt) newlyUnlocked.push(definition.contentKey);
        }
      }

      if (creates.length > 0) {
        await tx.userAchievement.createMany({ data: creates, skipDuplicates: true });
      }
      if (updates.length > 0) await Promise.all(updates);

      return {
        evaluated: gameplayDefinitions.length,
        newlyUnlocked
      };
    }, { maxWait: 5_000, timeout: 30_000 });
  }

  async processDomainEvent(input: {
    eventId: string;
    eventType: string;
    aggregateId: string;
    payload: Prisma.JsonValue;
  }) {
    const payload = jsonRecord(input.payload);
    const userIds = new Set<string>();
    for (const key of ["userId", "user1Id", "user2Id"]) {
      const value = payload[key];
      if (typeof value === "string" && value.length > 0) userIds.add(value);
    }
    for (const userId of userIds) await this.evaluateUser(userId);
    return { eventId: input.eventId, usersEvaluated: userIds.size };
  }

  async setSelectedBadges(userId: string, requestedAchievementIds: string[]) {
    const achievementIds = [...new Set(
      requestedAchievementIds.map((value) => value.trim()).filter(Boolean)
    )];
    if (achievementIds.length > MAX_SELECTED_ACHIEVEMENT_BADGES) {
      throw new AppError(
        `Tu peux afficher au maximum ${MAX_SELECTED_ACHIEVEMENT_BADGES} badges.`,
        400
      );
    }

    await this.evaluateUser(userId);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"achievement-badges:" + userId}, 0))`
      );
      const unlocked = achievementIds.length === 0
        ? []
        : await tx.userAchievement.findMany({
            where: {
              userId,
              achievementId: { in: achievementIds },
              unlockedAt: { not: null },
              achievement: { status: "PUBLISHED" }
            },
            select: { achievementId: true }
          });
      if (unlocked.length !== achievementIds.length) {
        throw new AppError(
          "Tu ne peux sélectionner que des badges d'achievements débloqués.",
          400
        );
      }

      await tx.achievementBadgeSelection.deleteMany({
        where: achievementIds.length === 0
          ? { userId }
          : { userId, achievementId: { notIn: achievementIds } }
      });
      if (achievementIds.length > 0) {
        await tx.achievementBadgeSelection.createMany({
          data: achievementIds.map((achievementId) => ({ userId, achievementId })),
          skipDuplicates: true
        });
      }
    }, { maxWait: 5_000, timeout: 15_000 });

    return this.getSelectedBadges(userId);
  }

  async getSelectedBadges(userId: string) {
    return prisma.achievementBadgeSelection.findMany({
      where: {
        userId,
        achievement: { status: "PUBLISHED" }
      },
      include: { achievement: true },
      orderBy: { selectedAt: "asc" },
      take: MAX_SELECTED_ACHIEVEMENT_BADGES
    });
  }

  async getUserSummary(userId: string): Promise<AchievementSummary> {
    await this.evaluateUser(userId);
    const [definitions, progress, badgeSelections] = await Promise.all([
      prisma.achievementDefinition.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ eventType: "asc" }, { target: "asc" }]
      }),
      prisma.userAchievement.findMany({ where: { userId } }),
      prisma.achievementBadgeSelection.findMany({ where: { userId } })
    ]);
    const templateCount = definitions.filter(
      (definition) => isGeneratorTemplate(definition.metadata)
    ).length;
    const gameplayDefinitions = definitions.filter(
      (definition) => !isGeneratorTemplate(definition.metadata)
    );
    const progressByAchievement = new Map(
      progress.map((entry) => [entry.achievementId, entry])
    );
    const selectedBadgeIds = new Set(
      badgeSelections.map((entry) => entry.achievementId)
    );
    const achievements = gameplayDefinitions.map<AchievementView>((definition) => {
      const state = progressByAchievement.get(definition.id);
      const metadata = jsonRecord(definition.metadata);
      return {
        id: definition.id,
        contentKey: definition.contentKey,
        name: definition.name,
        description: textValue(metadata.description),
        readableObjective: textValue(metadata.readableObjective),
        category: achievementCategory(definition.metadata),
        tier: Math.max(0, Math.floor(numberValue(metadata.tier))),
        tierLabel: textValue(metadata.tierLabel),
        target: definition.target,
        progress: Math.min(definition.target, state?.progress ?? 0),
        points: rewardPoints(definition.reward),
        hidden: definition.hidden,
        unlockedAt: state?.unlockedAt ?? null,
        unlocked: Boolean(state?.unlockedAt),
        selectedAsBadge: selectedBadgeIds.has(definition.id) && Boolean(state?.unlockedAt)
      };
    }).sort((left, right) =>
      left.category.localeCompare(right.category)
      || left.contentKey.replace(/_T\d+$/, "").localeCompare(
        right.contentKey.replace(/_T\d+$/, "")
      )
      || left.tier - right.tier
      || left.name.localeCompare(right.name, "fr")
    );
    const unlocked = achievements.filter((achievement) => achievement.unlocked);
    const points = unlocked.reduce((sum, achievement) => sum + achievement.points, 0);
    const categoryCounts = ACHIEVEMENT_CATEGORIES
      .map((category) => {
        const categoryAchievements = achievements.filter(
          (achievement) => achievement.category === category
        );
        return {
          category,
          total: categoryAchievements.length,
          unlocked: categoryAchievements.filter((achievement) => achievement.unlocked).length
        };
      })
      .filter((category) => category.total > 0);
    const latestUnlocked = unlocked
      .slice()
      .sort((left, right) =>
        (right.unlockedAt?.getTime() ?? 0) - (left.unlockedAt?.getTime() ?? 0)
      )
      .slice(0, 5);
    const nearestLocked = achievements
      .filter((achievement) => !achievement.unlocked && !achievement.hidden)
      .sort((left, right) =>
        (right.progress / Math.max(1, right.target))
        - (left.progress / Math.max(1, left.target))
        || left.target - right.target
      )
      .slice(0, 5);

    return {
      catalogCount: definitions.length,
      templateCount,
      total: achievements.length,
      unlocked: unlocked.length,
      points,
      completionPercent: achievements.length > 0
        ? Math.round((unlocked.length / achievements.length) * 100)
        : 0,
      achievements,
      selectedBadges: achievements.filter((achievement) => achievement.selectedAsBadge),
      latestUnlocked,
      nearestLocked,
      categoryCounts
    };
  }
}
