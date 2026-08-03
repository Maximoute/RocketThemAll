import { createHash } from "node:crypto";
import {
  Prisma,
  prisma,
  type QuestDefinition
} from "@rta/database";
import { AppError } from "./errors.js";
import { applyXpGain, xpRequired } from "./xp.service.js";

export type QuestDifficulty = "EASY" | "NORMAL" | "HARD";

type JsonRecord = Record<string, unknown>;
type QuestWithDefinition = Prisma.UserDailyQuestGetPayload<{
  include: { definition: true };
}>;

interface QuestProgressContext {
  eventId: string;
  eventType: string;
  userId: string;
  increment: number;
  succeeded?: boolean;
  zoneId?: string;
  worldId?: string;
  cardId?: string;
  rarity?: string;
  category?: string;
  variant?: string;
  isNew?: boolean;
  isSpecialEvent?: boolean;
  rewardObtained?: boolean;
  afterFirstDailyDiscovery?: boolean;
  previouslyVisitedZone?: boolean;
  visitedZoneEarlierToday?: boolean;
  firstDailyRarity?: string;
}

interface PlayerCapabilities {
  inventoryCount: number;
  boosterCount: number;
  canFuse: boolean;
  credits: number;
}

const DIFFICULTIES: QuestDifficulty[] = ["EASY", "NORMAL", "HARD"];
const TARGET_MULTIPLIERS: Record<QuestDifficulty, number> = {
  EASY: 0.75,
  NORMAL: 1,
  HARD: 1.5
};

const DISTINCT_OBJECTIVES = new Set([
  "EXPLORE_DISTINCT_ZONES",
  "EXPLORE_DISTINCT_WORLDS",
  "DISCOVER_DISTINCT_RARITIES"
]);

const BUCKET_VARIANTS = new Set([
  "zone_exploration",
  "zone_discovery",
  "world_discovery",
  "same_world_without_switch",
  "world_exploration",
  "same_rarity",
  "same_item_category"
]);

const RARITY_RANK: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  "Very Rare": 3,
  Import: 4,
  Exotic: 5,
  "Black Market": 6,
  Limited: 7
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function positiveInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const DAILY_QUEST_TIME_ZONE = "Europe/Paris";

function questZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second"))
  };
}

function questLocalDateToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string
) {
  const localEpoch = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = new Date(localEpoch);
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = questZonedDateParts(candidate, timeZone);
    const representedLocalEpoch = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    candidate = new Date(candidate.getTime() + (localEpoch - representedLocalEpoch));
  }
  return candidate;
}

export function dailyQuestWindow(
  now = new Date(),
  timeZone = DAILY_QUEST_TIME_ZONE
) {
  const localNow = questZonedDateParts(now, timeZone);
  const currentDate = new Date(Date.UTC(
    localNow.year,
    localNow.month - 1,
    localNow.day
  ));
  const nextDate = new Date(currentDate.getTime() + 24 * 60 * 60_000);
  const dayKey =
    `${localNow.year}-${String(localNow.month).padStart(2, "0")}-` +
    String(localNow.day).padStart(2, "0");
  const nextDayKey =
    `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}-` +
    String(nextDate.getUTCDate()).padStart(2, "0");
  return {
    dayKey,
    nextDayKey,
    startsAt: questLocalDateToUtc(
      localNow.year,
      localNow.month,
      localNow.day,
      timeZone
    ),
    expiresAt: questLocalDateToUtc(
      nextDate.getUTCFullYear(),
      nextDate.getUTCMonth() + 1,
      nextDate.getUTCDate(),
      timeZone
    ),
    timeZone
  };
}

export function questTargetForDifficulty(
  definition: Pick<QuestDefinition, "target" | "objectiveKey" | "metadata">,
  difficulty: QuestDifficulty,
  level: number
) {
  const metadata = record(definition.metadata);
  const strategy = String(metadata.targetStrategy ?? "");
  if (strategy === "XP_TARGET_BY_TIER_AND_DIFFICULTY") {
    const ratios: Record<QuestDifficulty, number> = {
      EASY: 0.25,
      NORMAL: 0.5,
      HARD: 1
    };
    return Math.max(25, Math.round(xpRequired(Math.max(1, level)) * ratios[difficulty] / 25) * 25);
  }
  if (strategy === "CREDIT_TARGET_BY_TIER_AND_DIFFICULTY") {
    const base = Math.max(100, 100 + Math.max(0, level - 1) * 20);
    return Math.max(50, Math.round(base * TARGET_MULTIPLIERS[difficulty] / 25) * 25);
  }
  if ([
    "target_zone_then_other_zone",
    "ordered_zone_sequence",
    "all_unlocked_zones_in_world",
    "complete_each_unlocked_zone_in_world"
  ].includes(String(metadata.objectiveVariant ?? ""))) {
    return 2;
  }
  if (String(metadata.objectiveVariant ?? "") === "asymmetric_two_zone_counts") {
    return Math.max(2, Math.round(definition.target * TARGET_MULTIPLIERS[difficulty]) + 1);
  }
  if (strategy === "FIXED_BY_TEMPLATE") {
    return Math.max(1, definition.target);
  }
  const scaled = Math.max(1, Math.round(definition.target * TARGET_MULTIPLIERS[difficulty]));
  // Every published world has two free zones. A daily quest must not force a
  // premium-zone purchase just to be completable.
  if (definition.objectiveKey === "EXPLORE_DISTINCT_ZONES") {
    return Math.min(2, scaled);
  }
  return scaled;
}

export function renderQuestName(
  quest: Pick<QuestWithDefinition, "definition" | "targetSnapshot" | "contextSnapshot">
) {
  const context = record(quest.contextSnapshot);
  return quest.definition.name
    .replaceAll("{target}", String(quest.targetSnapshot))
    .replaceAll("{xpTarget}", String(quest.targetSnapshot))
    .replaceAll("{creditTarget}", String(quest.targetSnapshot))
    .replaceAll("{zone}", String(context.zoneName ?? "une zone accessible"))
    .replaceAll("{zoneA}", String(context.zoneAName ?? "une première zone"))
    .replaceAll("{zoneB}", String(context.zoneBName ?? "une seconde zone"))
    .replaceAll("{world}", String(context.worldName ?? "un monde accessible"))
    .replaceAll("{rarity}", String(context.rarity ?? "Rare"));
}

function deterministicUnit(seed: string) {
  const digest = createHash("sha256").update(seed).digest();
  const value = digest.readUIntBE(0, 6);
  return (value + 1) / (2 ** 48 + 1);
}

function weightedScore(userId: string, dayKey: string, slot: number, definition: QuestDefinition) {
  const metadata = record(definition.metadata);
  const weight = Math.max(1, positiveInteger(metadata.weight, 1));
  return -Math.log(deterministicUnit(`${userId}:${dayKey}:${slot}:${definition.contentKey}`)) / weight;
}

function difficultyAllowed(definition: QuestDefinition, difficulty: QuestDifficulty) {
  const configured = stringList(record(definition.metadata).difficulties);
  return configured.length === 0 || configured.includes(difficulty);
}

function questIsLive(
  definition: QuestDefinition,
  difficulty: QuestDifficulty,
  level: number,
  capabilities: PlayerCapabilities
) {
  if (level < definition.minLevel || (definition.maxLevel !== null && level > definition.maxLevel)) {
    return false;
  }
  if (!difficultyAllowed(definition, difficulty)) return false;
  const metadata = record(definition.metadata);
  const feature = String(metadata.requiredFeature ?? "");
  if (feature === "boosters" && capabilities.boosterCount <= 0 && capabilities.credits < 1_000) {
    return false;
  }
  if (["sell", "recycle"].includes(feature) && capabilities.inventoryCount <= 0) {
    return false;
  }
  if (feature === "fusion" && !capabilities.canFuse) return false;
  return true;
}

type QuestTargetPool = Array<{
  id: string;
  name: string;
  position: number;
  zones: Array<{ id: string; name: string; access: string }>;
}>;

function deterministicIndex(seed: string, length: number) {
  return length <= 1 ? 0 : Math.floor(deterministicUnit(seed) * length) % length;
}

function questContextSnapshot(
  definition: QuestDefinition,
  userId: string,
  dayKey: string,
  worlds: QuestTargetPool
) {
  const metadata = record(definition.metadata);
  const variables = stringList(metadata.variables);
  const highestWorld = [
    "Q005", "Q013", "Q042", "Q043", "Q044", "Q045", "Q072", "Q077"
  ].includes(definition.contentKey);
  const world = highestWorld
    ? worlds.at(-1)
    : worlds[deterministicIndex(`${userId}:${dayKey}:${definition.contentKey}:world`, worlds.length)];
  const allZones = (world?.zones ?? []).filter((zone) => zone.access === "FREE");
  const zone = allZones[
    deterministicIndex(`${userId}:${dayKey}:${definition.contentKey}:zone`, allZones.length)
  ];
  const secondZonePool = allZones.filter((candidate) => candidate.id !== zone?.id);
  const zoneB = secondZonePool[
    deterministicIndex(`${userId}:${dayKey}:${definition.contentKey}:zoneB`, secondZonePool.length)
  ];
  const rarities = ["Uncommon", "Rare", "Very Rare"];
  const rarity = rarities[
    deterministicIndex(`${userId}:${dayKey}:${definition.contentKey}:rarity`, rarities.length)
  ];
  return {
    ...(variables.includes("world") || highestWorld || metadata.requiresWorld === true
      || ["all_unlocked_zones_in_world", "complete_each_unlocked_zone_in_world"].includes(
        String(metadata.objectiveVariant ?? "")
      )
      ? { worldId: world?.id, worldName: world?.name }
      : {}),
    ...(variables.includes("zone") || metadata.requiresZone === true
      ? { zoneId: zone?.id, zoneName: zone?.name, worldId: world?.id, worldName: world?.name }
      : {}),
    ...(variables.includes("zoneA")
      ? { zoneAId: zone?.id, zoneAName: zone?.name, worldId: world?.id, worldName: world?.name }
      : {}),
    ...(variables.includes("zoneB")
      ? { zoneBId: zoneB?.id, zoneBName: zoneB?.name, worldId: world?.id, worldName: world?.name }
      : {}),
    ...(variables.includes("rarity") ? { rarity } : {}),
    accessibleZoneIds: allZones.map((entry) => entry.id),
    accessibleWorldIds: worlds.map((entry) => entry.id)
  };
}

function progressKey(context: QuestProgressContext, objectiveKey: string, variant: string) {
  if (objectiveKey === "EXPLORE_DISTINCT_ZONES" || variant === "discoveries_across_distinct_zones") {
    return context.zoneId ? `zone:${context.zoneId}` : null;
  }
  if (objectiveKey === "EXPLORE_DISTINCT_WORLDS" || variant === "discoveries_across_two_worlds") {
    return context.worldId ? `world:${context.worldId}` : null;
  }
  if (objectiveKey === "DISCOVER_DISTINCT_RARITIES" || variant === "distinct_rarities") {
    return context.rarity ? `rarity:${context.rarity}` : null;
  }
  if (variant === "distinct_items") {
    return context.cardId ? `card:${context.cardId}` : null;
  }
  if (variant === "distinct_item_categories" || variant === "same_item_category") {
    return context.category ? `category:${context.category}` : null;
  }
  if (variant === "same_rarity") {
    return context.rarity ? `rarity:${context.rarity}` : null;
  }
  if (variant === "zone_exploration" || variant === "zone_discovery") {
    return context.zoneId ? `zone:${context.zoneId}` : null;
  }
  if (["world_discovery", "same_world_without_switch", "world_exploration"].includes(variant)) {
    return context.worldId ? `world:${context.worldId}` : null;
  }
  if (variant === "different_zone_each_time") {
    return context.zoneId ? `zone:${context.zoneId}` : null;
  }
  if (objectiveKey === "COMPLETE_EVENT_IN_ZONE") {
    return context.zoneId ? `zone:${context.zoneId}` : null;
  }
  if (objectiveKey === "COMPLETE_EVENT_IN_WORLD") {
    return context.worldId ? `world:${context.worldId}` : null;
  }
  return null;
}

function minimumRarityFromName(name: string) {
  if (/Very Rare/i.test(name)) return RARITY_RANK["Very Rare"];
  if (/\bRare\b/i.test(name)) return RARITY_RANK.Rare;
  if (/Uncommon/i.test(name)) return RARITY_RANK.Uncommon;
  return 0;
}

function baseIncrement(quest: QuestWithDefinition, context: QuestProgressContext) {
  const metadata = record(quest.definition.metadata);
  const snapshot = record(quest.contextSnapshot);
  const variant = String(metadata.objectiveVariant ?? "");
  const targetedZoneId = typeof snapshot.zoneId === "string" ? snapshot.zoneId : null;
  const targetedWorldId = typeof snapshot.worldId === "string" ? snapshot.worldId : null;
  if (
    targetedZoneId &&
    !["target_zone_then_other_zone", "ordered_zone_sequence", "asymmetric_two_zone_counts"].includes(
      variant
    ) &&
    context.zoneId !== targetedZoneId
  ) return 0;
  if (targetedWorldId && context.worldId !== targetedWorldId) return 0;
  if (
    typeof snapshot.rarity === "string" &&
    (RARITY_RANK[context.rarity ?? ""] ?? -1) < (RARITY_RANK[snapshot.rarity] ?? 0)
  ) return 0;
  if (variant === "successful_only" && context.succeeded !== true) return 0;
  if (variant === "exploration_with_discovery" && context.succeeded !== true) return 0;
  if (variant === "new_for_collection" && context.isNew !== true) return 0;
  if (variant === "special_variant" && !["shiny", "holo"].includes(
    String(context.variant ?? "").toLowerCase()
  )) return 0;
  if (variant === "special_event" && context.isSpecialEvent !== true) return 0;
  if (variant === "event_reward_obtained" && context.rewardObtained !== true) return 0;
  if (variant === "after_first_daily_discovery" && context.afterFirstDailyDiscovery !== true) {
    return 0;
  }
  if (variant === "previously_visited_zones" && context.previouslyVisitedZone !== true) return 0;
  if (variant === "return_to_zone_visited_today" && context.visitedZoneEarlierToday !== true) {
    return 0;
  }
  if (variant === "rarer_than_first_daily_discovery") {
    const currentRank = RARITY_RANK[context.rarity ?? ""] ?? -1;
    const firstRank = RARITY_RANK[context.firstDailyRarity ?? ""] ?? currentRank;
    if (currentRank <= firstRank) return 0;
  }
  if (variant === "minimum_or_compared_rarity") {
    const rank = RARITY_RANK[context.rarity ?? ""] ?? -1;
    if (rank < minimumRarityFromName(quest.definition.name)) return 0;
  }
  return Math.max(0, Math.floor(context.increment));
}

function rewardFor(definition: QuestDefinition, difficulty: QuestDifficulty, level: number) {
  const configured = record(record(definition.reward)[difficulty]);
  const tier = Math.max(1, Math.ceil(Math.max(1, level) / 10));
  const multiplier = 1 + (tier - 1) * 0.15;
  return {
    difficulty,
    xp: Math.max(0, Math.round(positiveInteger(configured.xp) * multiplier)),
    credits: Math.max(0, Math.round(positiveInteger(configured.credits) * multiplier)),
    tier
  };
}

export class DailyQuestService {
  async getDailyQuests(userId: string, now = new Date()) {
    await this.ensureDailyQuestsForUser(userId, now);
    const { dayKey } = dailyQuestWindow(now);
    return prisma.userDailyQuest.findMany({
      where: { userId, dayKey },
      include: { definition: true },
      orderBy: { slot: "asc" }
    });
  }

  async ensureDailyQuestsForUser(userId: string, now = new Date()) {
    const { dayKey, expiresAt } = dailyQuestWindow(now);
    await prisma.userDailyQuest.updateMany({
      where: {
        userId,
        status: { in: ["ACTIVE", "COMPLETED"] },
        OR: [
          { expiresAt: { lte: now } },
          { dayKey: { not: dayKey } }
        ]
      },
      data: { status: "EXPIRED", version: { increment: 1 } }
    });
    await prisma.userDailyQuest.updateMany({
      where: {
        userId,
        dayKey,
        status: { in: ["ACTIVE", "COMPLETED"] },
        expiresAt: { not: expiresAt }
      },
      data: { expiresAt, version: { increment: 1 } }
    });

    const [user, existing, definitions, boosters, inventory, worldRows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: { progress: true }
      }),
      prisma.userDailyQuest.findMany({
        where: { userId, dayKey },
        include: { definition: true },
        orderBy: { slot: "asc" }
      }),
      prisma.questDefinition.findMany({
        where: { status: "PUBLISHED" }
      }),
      prisma.userBooster.findMany({
        where: { userId, quantity: { gt: 0 } },
        select: { quantity: true }
      }),
      prisma.inventoryItem.findMany({
        where: { userId, quantity: { gt: 0 } },
        select: {
          quantity: true,
          card: { select: { rarityId: true } }
        }
      }),
      prisma.worldDefinition.findMany({
        where: { status: "PUBLISHED" },
        include: {
          zones: {
            where: { status: "PUBLISHED" },
            orderBy: { position: "asc" }
          }
        },
        orderBy: { position: "asc" }
      })
    ]);
    if (!user) throw new AppError("Joueur introuvable.", 404);
    const level = user.progress?.level ?? user.level;
    for (const quest of existing) {
      const difficulty = DIFFICULTIES[quest.slot];
      const snapshot = record(quest.rewardSnapshot);
      if (difficulty && quest.status === "ACTIVE" && quest.progress === 0
        && snapshot.difficulty !== difficulty) {
        await prisma.userDailyQuest.update({
          where: { id: quest.id },
          data: {
            targetSnapshot: questTargetForDifficulty(quest.definition, difficulty, level),
            rewardSnapshot: rewardFor(quest.definition, difficulty, level),
            version: { increment: 1 }
          }
        });
      }
    }
    if (existing.length >= 3) {
      await this.ensureNextRotation(now);
      return existing;
    }

    const rarityTotals = new Map<string, number>();
    for (const item of inventory) {
      rarityTotals.set(
        item.card.rarityId,
        (rarityTotals.get(item.card.rarityId) ?? 0) + item.quantity
      );
    }
    const capabilities: PlayerCapabilities = {
      inventoryCount: inventory.reduce((sum, item) => sum + item.quantity, 0),
      boosterCount: boosters.reduce((sum, booster) => sum + booster.quantity, 0),
      canFuse: [...rarityTotals.values()].some((quantity) => quantity >= 6),
      credits: user.credits
    };
    const selectedIds = new Set(existing.map((quest) => quest.definitionId));
    const selectedGroups = new Set(existing.map((quest) =>
      String(record(quest.definition.metadata).similarityGroup ?? quest.definition.objectiveKey)
    ));

    for (let slot = 0; slot < 3; slot += 1) {
      if (existing.some((quest) => quest.slot === slot)) continue;
      const difficulty = DIFFICULTIES[slot]!;
      const definition = definitions
        .filter((candidate) => !selectedIds.has(candidate.id))
        .filter((candidate) => questIsLive(candidate, difficulty, level, capabilities))
        .filter((candidate) => {
          const group = String(record(candidate.metadata).similarityGroup ?? candidate.objectiveKey);
          return !selectedGroups.has(group);
        })
        .map((candidate) => ({
          candidate,
          score: weightedScore(userId, dayKey, slot, candidate)
        }))
        .sort((left, right) =>
          left.score - right.score || left.candidate.contentKey.localeCompare(right.candidate.contentKey)
        )[0]?.candidate;
      if (!definition) continue;
      selectedIds.add(definition.id);
      selectedGroups.add(String(
        record(definition.metadata).similarityGroup ?? definition.objectiveKey
      ));
      await prisma.userDailyQuest.upsert({
        where: { userId_dayKey_slot: { userId, dayKey, slot } },
        update: {},
        create: {
          userId,
          definitionId: definition.id,
          dayKey,
          slot,
          targetSnapshot: questTargetForDifficulty(definition, difficulty, level),
          rewardSnapshot: rewardFor(definition, difficulty, level),
          contextSnapshot: questContextSnapshot(
            definition,
            userId,
            dayKey,
            worldRows
              .filter((world) => world.minLevel <= level)
              .map((world) => ({
                id: world.id,
                name: world.name,
                position: world.position,
                zones: world.zones.map((zone) => ({
                  id: zone.id,
                  name: zone.name,
                  access: zone.access
                }))
              }))
          ),
          expiresAt
        }
      });
    }
    await this.ensureNextRotation(now);
    return prisma.userDailyQuest.findMany({
      where: { userId, dayKey },
      include: { definition: true },
      orderBy: { slot: "asc" }
    });
  }

  async rotateDailyQuests(now = new Date()) {
    await prisma.userDailyQuest.updateMany({
      where: {
        status: { in: ["ACTIVE", "COMPLETED"] },
        expiresAt: { lte: now }
      },
      data: { status: "EXPIRED", version: { increment: 1 } }
    });
    const users = await prisma.user.findMany({
      select: { id: true },
      orderBy: { createdAt: "asc" }
    });
    for (const user of users) {
      await this.ensureDailyQuestsForUser(user.id, now);
    }
    await this.ensureNextRotation(now);
    return users.length;
  }

  async ensureNextRotation(now = new Date()) {
    const { expiresAt, nextDayKey } = dailyQuestWindow(now);
    await prisma.scheduledJob.upsert({
      where: { dedupeKey: `quest.rotate:${nextDayKey}` },
      update: {},
      create: {
        queue: "daily-quests",
        type: "quest.rotate",
        dedupeKey: `quest.rotate:${nextDayKey}`,
        payload: { dayKey: nextDayKey },
        runAt: expiresAt
      }
    });
  }

  async processDomainEvent(input: {
    eventId: string;
    eventType: string;
    aggregateId: string;
    payload: Prisma.JsonValue;
  }) {
    const contexts = await this.contextsForEvent(input);
    for (const context of contexts) {
      await this.applyContext(context);
    }
  }

  private async contextsForEvent(input: {
    eventId: string;
    eventType: string;
    aggregateId: string;
    payload: Prisma.JsonValue;
  }): Promise<QuestProgressContext[]> {
    const payload = record(input.payload);
    const userId = typeof payload.userId === "string" ? payload.userId : "";
    if (input.eventType === "capture.succeeded" || input.eventType === "capture.failed") {
      const attempt = await prisma.captureAttempt.findUnique({
        where: { id: input.aggregateId },
        include: {
          encounter: {
            include: {
              zone: true,
              card: { include: { rarity: true } }
            }
          }
        }
      });
      if (!attempt) throw new AppError("Tentative de capture introuvable.", 404);
      const succeeded = input.eventType === "capture.succeeded";
      const rewards = record(payload.rewards);
      const submittedDay = dailyQuestWindow(attempt.submittedAt).startsAt;
      const [successfulToday, priorZoneVisits, priorZoneVisitsToday, firstDiscoveryToday] =
        await Promise.all([
          prisma.captureAttempt.count({
            where: {
              userId: attempt.userId,
              status: "SUCCEEDED",
              submittedAt: { gte: submittedDay, lt: attempt.submittedAt }
            }
          }),
          prisma.captureAttempt.count({
            where: {
              userId: attempt.userId,
              id: { not: attempt.id },
              resolvedAt: { not: null },
              encounter: { zoneId: attempt.encounter.zoneId }
            }
          }),
          prisma.captureAttempt.count({
            where: {
              userId: attempt.userId,
              id: { not: attempt.id },
              resolvedAt: { not: null },
              submittedAt: { gte: submittedDay, lt: attempt.submittedAt },
              encounter: { zoneId: attempt.encounter.zoneId }
            }
          }),
          prisma.captureAttempt.findFirst({
            where: {
              userId: attempt.userId,
              status: "SUCCEEDED",
              submittedAt: { gte: submittedDay, lte: attempt.submittedAt }
            },
            orderBy: { submittedAt: "asc" },
            select: {
              encounter: {
                select: { card: { select: { rarity: { select: { name: true } } } } }
              }
            }
          })
        ]);
      const contexts: QuestProgressContext[] = [{
        eventId: input.eventId,
        eventType: "EXPLORATION_COMPLETED",
        userId: attempt.userId,
        increment: 1,
        succeeded,
        zoneId: attempt.encounter.zoneId,
        worldId: attempt.encounter.zone.worldId,
        afterFirstDailyDiscovery: successfulToday > 0,
        previouslyVisitedZone: priorZoneVisits > 0,
        visitedZoneEarlierToday: priorZoneVisitsToday > 0
      }];
      if (succeeded) {
        const owned = await prisma.inventoryItem.aggregate({
          where: { userId: attempt.userId, cardId: attempt.encounter.cardId },
          _sum: { quantity: true }
        });
        const discovery = {
          eventId: input.eventId,
          userId: attempt.userId,
          succeeded: true,
          zoneId: attempt.encounter.zoneId,
          worldId: attempt.encounter.zone.worldId,
          cardId: attempt.encounter.cardId,
          rarity: attempt.encounter.card.rarity.name,
          category: attempt.encounter.card.category ?? undefined,
          variant: attempt.variant ?? undefined,
          isNew: (owned._sum.quantity ?? 0) <= 1
          ,
          firstDailyRarity:
            firstDiscoveryToday?.encounter.card.rarity.name ??
            attempt.encounter.card.rarity.name
        };
        contexts.push({
          ...discovery,
          eventType: "ITEM_DISCOVERED",
          increment: 1
        });
        contexts.push({
          ...discovery,
          eventType: "XP_GAINED",
          increment: positiveInteger(rewards.xp)
        });
        contexts.push({
          ...discovery,
          eventType: "CREDITS_GAINED",
          increment: positiveInteger(rewards.credits)
        });
      }
      return contexts;
    }
    if (!userId) return [];
    if (input.eventType === "booster.opened") {
      return [{
        eventId: input.eventId,
        eventType: "BOOSTER_OPENED",
        userId,
        increment: 1
      }];
    }
    if (input.eventType === "card.sold") {
      return [
        {
          eventId: input.eventId,
          eventType: "CARDS_SOLD",
          userId,
          increment: positiveInteger(payload.quantity, 1)
        },
        {
          eventId: input.eventId,
          eventType: "CREDITS_GAINED",
          userId,
          increment: positiveInteger(payload.credits)
        }
      ];
    }
    if (input.eventType === "card.recycled") {
      return [
        {
          eventId: input.eventId,
          eventType: "CARDS_RECYCLED",
          userId,
          increment: positiveInteger(payload.quantity, 1)
        },
        {
          eventId: input.eventId,
          eventType: "CREDITS_GAINED",
          userId,
          increment: positiveInteger(payload.credits)
        }
      ];
    }
    if (input.eventType === "card.fusion.completed") {
      return [{
        eventId: input.eventId,
        eventType: "FUSION_COMPLETED",
        userId,
        increment: 1
      }];
    }
    if (input.eventType === "daily_quest.completed") {
      return [{
        eventId: input.eventId,
        eventType: "DAILY_QUEST_COMPLETED",
        userId,
        increment: 1
      }];
    }
    if (input.eventType === "exploration.event.completed") {
      const completion = await prisma.explorationEventCompletion.findUnique({
        where: {
          encounterId_userId: {
            encounterId: input.aggregateId,
            userId
          }
        },
        include: { encounter: { include: { zone: true } } }
      });
      if (!completion) return [];
      return [{
        eventId: input.eventId,
        eventType: "EXPLORATION_EVENT_COMPLETED",
        userId,
        increment: 1,
        succeeded: completion.succeeded,
        zoneId: completion.encounter.zoneId,
        worldId: completion.encounter.zone.worldId,
        isSpecialEvent: completion.isSpecial,
        rewardObtained: completion.reward !== null
      }];
    }
    return [];
  }

  private async applyContext(context: QuestProgressContext) {
    if (context.increment <= 0) return;
    const now = new Date();
    const quests = await prisma.userDailyQuest.findMany({
      where: {
        userId: context.userId,
        status: "ACTIVE",
        expiresAt: { gt: now },
        definition: {
          status: "PUBLISHED",
          eventType: context.eventType
        }
      },
      include: { definition: true },
      orderBy: { slot: "asc" }
    });
    for (const quest of quests) {
      await this.applyContextToQuest(quest.id, context, now);
    }
  }

  private async applyContextToQuest(
    questId: string,
    context: QuestProgressContext,
    now: Date
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "UserDailyQuest" WHERE "id" = ${questId} FOR UPDATE`
      );
      const quest = await tx.userDailyQuest.findUnique({
        where: { id: questId },
        include: { definition: true }
      });
      if (!quest || quest.status !== "ACTIVE" || quest.expiresAt <= now) return;
      const alreadyApplied = await tx.questEventApplication.findUnique({
        where: { questId_eventId: { questId, eventId: context.eventId } }
      });
      if (alreadyApplied) return;

      const metadata = record(quest.definition.metadata);
      const variant = String(metadata.objectiveVariant ?? "");
      const key = progressKey(context, quest.definition.objectiveKey, variant);
      let increment = baseIncrement(quest, context);
      if (variant === "target_zone_then_other_zone" || variant === "ordered_zone_sequence") {
        const snapshot = record(quest.contextSnapshot);
        const zoneAId = String(
          variant === "target_zone_then_other_zone" ? snapshot.zoneId ?? "" : snapshot.zoneAId ?? ""
        );
        const zoneBId = variant === "ordered_zone_sequence"
          ? String(snapshot.zoneBId ?? "")
          : null;
        const firstStep = await tx.questEventApplication.findFirst({
          where: { questId, progressKey: "sequence:1", increment: { gt: 0 } }
        });
        if (!firstStep) {
          increment = context.zoneId === zoneAId ? 1 : 0;
        } else {
          increment = (
            zoneBId ? context.zoneId === zoneBId : context.zoneId !== zoneAId
          ) ? 1 : 0;
        }
      }
      if (variant === "asymmetric_two_zone_counts") {
        const snapshot = record(quest.contextSnapshot);
        const zoneAId = String(snapshot.zoneAId ?? "");
        const zoneBId = String(snapshot.zoneBId ?? "");
        const zoneAComplete = await tx.questEventApplication.findFirst({
          where: { questId, progressKey: "zone-a", increment: { gt: 0 } }
        });
        if (context.zoneId === zoneAId && !zoneAComplete) increment = 1;
        else if (context.zoneId === zoneBId) increment = 1;
        else increment = 0;
      }
      const applicationKey =
        variant === "target_zone_then_other_zone" || variant === "ordered_zone_sequence"
          ? `sequence:${quest.progress + 1}`
          : variant === "asymmetric_two_zone_counts" && context.zoneId ===
            String(record(quest.contextSnapshot).zoneAId ?? "")
            ? "zone-a"
            : key;
      if ((DISTINCT_OBJECTIVES.has(quest.definition.objectiveKey)
        || variant.startsWith("distinct_")
        || variant.startsWith("discoveries_across_")
        || variant === "different_zone_each_time"
        || (metadata.requiresMultipleZones === true && variant !== "asymmetric_two_zone_counts")
        || metadata.requiresMultipleWorlds === true) && key) {
        const duplicate = await tx.questEventApplication.findFirst({
          where: { questId, progressKey: key, increment: { gt: 0 } }
        });
        if (duplicate) increment = 0;
      }
      if (BUCKET_VARIANTS.has(variant) && key) {
        const firstBucket = await tx.questEventApplication.findFirst({
          where: { questId, progressKey: { not: null }, increment: { gt: 0 } },
          orderBy: { createdAt: "asc" }
        });
        if (firstBucket?.progressKey && firstBucket.progressKey !== key) increment = 0;
      }
      if (
        quest.definition.objectiveKey === "COMPLETE_EVENT_IN_WORLD" &&
        !record(quest.contextSnapshot).worldId &&
        key
      ) {
        const firstBucket = await tx.questEventApplication.findFirst({
          where: { questId, progressKey: { not: null }, increment: { gt: 0 } },
          orderBy: { createdAt: "asc" }
        });
        if (firstBucket?.progressKey && firstBucket.progressKey !== key) increment = 0;
      }
      await tx.questEventApplication.create({
        data: {
          questId,
          eventId: context.eventId,
          progressKey: applicationKey,
          increment
        }
      });
      if (increment <= 0) return;

      const progress = Math.min(quest.targetSnapshot, quest.progress + increment);
      if (progress < quest.targetSnapshot) {
        await tx.userDailyQuest.update({
          where: { id: quest.id },
          data: { progress, version: { increment: 1 } }
        });
        return;
      }
      await this.completeQuest(tx, quest, now);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async completeQuest(
    tx: Prisma.TransactionClient,
    quest: QuestWithDefinition,
    now: Date
  ) {
    const reward = record(quest.rewardSnapshot);
    const credits = positiveInteger(reward.credits);
    const xp = positiveInteger(reward.xp);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${quest.userId} FOR UPDATE`);
    const user = await tx.user.findUniqueOrThrow({ where: { id: quest.userId } });
    const progress = await tx.userProgress.upsert({
      where: { userId: quest.userId },
      update: {},
      create: { userId: quest.userId, level: user.level, xp: user.xp }
    });
    const xpResult = applyXpGain(progress.level, progress.xp, xp);

    await tx.user.update({
      where: { id: quest.userId },
      data: {
        credits: { increment: credits },
        level: xpResult.level,
        xp: xpResult.xp,
        balanceVersion: { increment: 1 }
      }
    });
    await tx.userProgress.update({
      where: { userId: quest.userId },
      data: {
        level: xpResult.level,
        xp: xpResult.xp,
        unspentSkillPoints: { increment: xpResult.levelsGained },
        version: { increment: 1 }
      }
    });
    if (credits > 0) {
      await tx.economicLedgerEntry.create({
        data: {
          userId: quest.userId,
          asset: "CREDITS",
          delta: credits,
          balanceBefore: user.credits,
          balanceAfter: user.credits + credits,
          reason: "daily_quest.reward",
          referenceType: "UserDailyQuest",
          referenceId: quest.id,
          operationKey: `daily-quest:${quest.id}:credits`,
          metadata: { definitionKey: quest.definition.contentKey, dayKey: quest.dayKey }
        }
      });
    }
    if (xp > 0) {
      await tx.economicLedgerEntry.create({
        data: {
          userId: quest.userId,
          asset: "XP",
          delta: xp,
          balanceBefore: progress.xp,
          // Ledger balances are additive. Level rollover changes the persisted
          // in-level XP, so keep the additive accounting balance here and
          // record the resulting in-level XP in metadata.
          balanceAfter: progress.xp + xp,
          reason: "daily_quest.reward",
          referenceType: "UserDailyQuest",
          referenceId: quest.id,
          operationKey: `daily-quest:${quest.id}:xp`,
          metadata: {
            definitionKey: quest.definition.contentKey,
            dayKey: quest.dayKey,
            levelsGained: xpResult.levelsGained,
            resultingLevel: xpResult.level,
            resultingLevelXp: xpResult.xp
          }
        }
      });
    }
    await tx.transactionLog.create({
      data: {
        userId: quest.userId,
        type: "daily_quest_reward",
        amount: credits,
        metadata: {
          questId: quest.id,
          definitionKey: quest.definition.contentKey,
          xp,
          credits
        }
      }
    });
    await tx.userDailyQuest.update({
      where: { id: quest.id },
      data: {
        progress: quest.targetSnapshot,
        status: "CLAIMED",
        claimedAt: now,
        version: { increment: 1 }
      }
    });
    await tx.outboxEvent.create({
      data: {
        eventId: `daily-quest:${quest.id}:completed`,
        aggregateType: "UserDailyQuest",
        aggregateId: quest.id,
        eventType: "daily_quest.completed",
        eventVersion: 1,
        payload: {
          userId: quest.userId,
          questId: quest.id,
          definitionKey: quest.definition.contentKey,
          rewards: { xp, credits }
        }
      }
    });
  }
}
