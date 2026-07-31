import { createHash } from "node:crypto";
import { Prisma, prisma, type CardVariant } from "@rta/database";
import {
  createSeededRandom,
  randomValue,
  weightedPick,
  type RandomSource
} from "@rta/game-engine";
import { AppError } from "./errors.js";
import { CollectionService } from "./collection.service.js";
import { normalizeCaptureConsumableTier } from "./capture-item-drop.js";
import { applyXpGain } from "./xp.service.js";

export const CONQUEROR_REWARD_TIERS = [
  "common",
  "uncommon",
  "rare",
  "very_rare",
  "import",
  "exotic"
] as const;

export type ConquerorRewardTier = (typeof CONQUEROR_REWARD_TIERS)[number];

type VariantName = "normal" | "shiny" | "holo";

interface BoosterChoiceSnapshot {
  itemKey: string;
  cardIds: string[];
  variants: VariantName[];
  claimed: boolean;
  selectedIndex?: number;
}

interface ChestOpenSnapshot {
  itemKey: string;
  itemName: string;
  consumableItemId: string;
  consumableKey: string;
  consumableName: string;
  credits: number;
  xp: number;
  resultingLevel: number;
  resultingLevelXp: number;
  levelsGained: number;
}

const CONQUEROR_CARD_WEIGHTS: Record<
  ConquerorRewardTier,
  Partial<Record<string, number>>
> = {
  common: { Common: 70, Uncommon: 25, Rare: 5 },
  uncommon: { Common: 25, Uncommon: 50, Rare: 20, "Very Rare": 5 },
  rare: { Uncommon: 20, Rare: 50, "Very Rare": 25, Import: 5 },
  very_rare: { Rare: 20, "Very Rare": 50, Import: 25, Exotic: 5 },
  import: { "Very Rare": 20, Import: 50, Exotic: 27, "Black Market": 3 },
  exotic: { Import: 25, Exotic: 65, "Black Market": 10 }
};

export const CONQUEROR_CHEST_RANGES: Record<
  ConquerorRewardTier,
  {
    credits: readonly [number, number];
    xp: readonly [number, number];
    consumableTiers: readonly string[];
  }
> = {
  common: { credits: [100, 250], xp: [25, 50], consumableTiers: ["COMMON"] },
  uncommon: {
    credits: [250, 500],
    xp: [50, 100],
    consumableTiers: ["COMMON", "UNCOMMON"]
  },
  rare: {
    credits: [500, 1_000],
    xp: [100, 200],
    consumableTiers: ["UNCOMMON", "RARE"]
  },
  very_rare: {
    credits: [1_000, 2_500],
    xp: [200, 400],
    consumableTiers: ["RARE", "EPIC"]
  },
  import: {
    credits: [2_500, 5_000],
    xp: [400, 750],
    consumableTiers: ["EPIC"]
  },
  exotic: {
    credits: [5_000, 10_000],
    xp: [750, 1_250],
    consumableTiers: ["EPIC", "LEGENDARY"]
  }
};

function jsonRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function tierFromItemKey(itemKey: string, family: "booster" | "chest") {
  const prefix = family === "booster"
    ? "booster.boss_choice."
    : "chest.boss_reward.";
  const tier = itemKey.startsWith(prefix) ? itemKey.slice(prefix.length) : "";
  if (!CONQUEROR_REWARD_TIERS.includes(tier as ConquerorRewardTier)) {
    throw new AppError("Récompense du Conquérant inconnue.", 404);
  }
  return tier as ConquerorRewardTier;
}

function rollInteger(
  [minimum, maximum]: readonly [number, number],
  random: RandomSource
) {
  return minimum + Math.floor(randomValue(random) * (maximum - minimum + 1));
}

function parseBoosterSnapshot(value: Prisma.JsonValue | null): BoosterChoiceSnapshot {
  const candidate = jsonRecord(value);
  if (
    typeof candidate.itemKey !== "string" ||
    !Array.isArray(candidate.cardIds) ||
    candidate.cardIds.length !== 3 ||
    !candidate.cardIds.every((entry) => typeof entry === "string") ||
    !Array.isArray(candidate.variants) ||
    candidate.variants.length !== 3 ||
    !candidate.variants.every(
      (entry) => entry === "normal" || entry === "shiny" || entry === "holo"
    ) ||
    typeof candidate.claimed !== "boolean"
  ) {
    throw new AppError("La sélection enregistrée du booster est invalide.", 500);
  }
  return candidate as unknown as BoosterChoiceSnapshot;
}

function parseChestSnapshot(value: Prisma.JsonValue | null): ChestOpenSnapshot {
  const candidate = jsonRecord(value);
  const stringFields = [
    "itemKey",
    "itemName",
    "consumableItemId",
    "consumableKey",
    "consumableName"
  ];
  const numberFields = [
    "credits",
    "xp",
    "resultingLevel",
    "resultingLevelXp",
    "levelsGained"
  ];
  if (
    !stringFields.every((field) => typeof candidate[field] === "string") ||
    !numberFields.every((field) => Number.isSafeInteger(candidate[field]))
  ) {
    throw new AppError("Le résultat enregistré du coffre est invalide.", 500);
  }
  return candidate as unknown as ChestOpenSnapshot;
}

function openCounts(counters: Prisma.JsonValue | null | undefined) {
  const root = jsonRecord(counters);
  const rawCounts = jsonRecord(root.conquerorBoosterOpenCounts);
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawCounts)) {
    if (Number.isSafeInteger(value) && Number(value) >= 0) {
      counts[key] = Number(value);
    }
  }
  return { root, counts };
}

function variantFor(
  config: {
    normalVariantRate: number;
    shinyVariantRate: number;
    holoVariantRate: number;
  },
  random: RandomSource
): VariantName {
  return weightedPick(
    [
      {
        value: "normal" as const,
        weight: Math.max(0, Math.round(config.normalVariantRate * 1_000_000))
      },
      {
        value: "shiny" as const,
        weight: Math.max(0, Math.round(config.shinyVariantRate * 1_000_000))
      },
      {
        value: "holo" as const,
        weight: Math.max(0, Math.round(config.holoVariantRate * 1_000_000))
      }
    ],
    random
  );
}

export class ConquerorRewardService {
  private readonly collectionService = new CollectionService();

  async prepareBoosterChoices(
    userId: string,
    itemKey: string,
    requestedOpeningNumber?: number
  ) {
    const tier = tierFromItemKey(itemKey, "booster");
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
      );
      const item = await tx.itemDefinition.findUnique({ where: { contentKey: itemKey } });
      if (!item || item.status !== "PUBLISHED" || item.type !== "BOOSTER") {
        throw new AppError("Ce Booster du Conquérant n'est pas disponible.", 404);
      }
      const owned = await tx.userItem.findUnique({
        where: { userId_itemId: { userId, itemId: item.id } }
      });
      if (!owned || owned.quantity < 1) {
        throw new AppError("Tu ne possèdes pas ce Booster du Conquérant.", 409);
      }

      const state = await tx.userGameplayState.upsert({
        where: { userId },
        update: {},
        create: { userId }
      });
      const { counts } = openCounts(state.counters);
      const currentOpeningNumber = counts[itemKey] ?? 0;
      const openingNumber = requestedOpeningNumber ?? currentOpeningNumber;
      if (
        !Number.isSafeInteger(openingNumber) ||
        openingNumber < 0 ||
        openingNumber > currentOpeningNumber
      ) {
        throw new AppError("Numéro d'ouverture du booster invalide.", 400);
      }
      const scopeKey = `conqueror-choice:${userId}:${itemKey}:${openingNumber}`;
      const existing = await tx.idempotencyRecord.findUnique({ where: { scopeKey } });
      if (existing) {
        return {
          snapshot: parseBoosterSnapshot(existing.response),
          tier,
          itemName: item.name,
          openingNumber
        };
      }
      if (openingNumber !== currentOpeningNumber) {
        throw new AppError("Cette ouverture de booster n'existe plus.", 409);
      }

      const random = createSeededRandom(scopeKey);
      const weights = CONQUEROR_CARD_WEIGHTS[tier];
      const rarityNames = Object.keys(weights);
      const pool = await tx.card.findMany({
        where: {
          source: "vault",
          status: "PUBLISHED",
          isActive: true,
          imageUrl: { not: null },
          rarity: { name: { in: rarityNames } },
          deck: { status: "PUBLISHED", isActive: true }
        },
        include: { rarity: true, deck: true },
        orderBy: { id: "asc" }
      });
      if (pool.length < 3) {
        throw new AppError("Le catalogue ne contient pas assez de cartes éligibles.", 500);
      }

      const cards = [];
      const usedCardIds = new Set<string>();
      for (let index = 0; index < 3; index += 1) {
        const availableRarities = rarityNames.filter((rarityName) =>
          pool.some((card) =>
            card.rarity.name === rarityName && !usedCardIds.has(card.id)
          )
        );
        const rarityName = weightedPick(
          availableRarities.map((name) => ({
            value: name,
            weight: Math.max(0, weights[name] ?? 0)
          })),
          random
        );
        const candidates = pool.filter(
          (card) => card.rarity.name === rarityName && !usedCardIds.has(card.id)
        );
        const card = candidates[Math.floor(randomValue(random) * candidates.length)];
        if (!card) throw new AppError("Le tirage du booster a échoué.", 500);
        usedCardIds.add(card.id);
        cards.push(card);
      }

      const config = await tx.appConfig.upsert({
        where: { id: "default" },
        update: {},
        create: { id: "default" }
      });
      const snapshot: BoosterChoiceSnapshot = {
        itemKey,
        cardIds: cards.map((card) => card.id),
        variants: cards.map(() => variantFor(config, random)),
        claimed: false
      };
      const requestHash = createHash("sha256").update(scopeKey).digest("hex");
      await tx.idempotencyRecord.create({
        data: {
          scopeKey,
          scope: "conqueror.booster.choice",
          key: scopeKey,
          requestHash,
          status: "COMPLETED",
          response: snapshot as unknown as Prisma.InputJsonObject,
          responseCode: 200,
          expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60_000)
        }
      });
      return { snapshot, tier, itemName: item.name, openingNumber };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const cards = await prisma.card.findMany({
      where: { id: { in: result.snapshot.cardIds } },
      include: { rarity: true, deck: true }
    });
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    return {
      tier: result.tier,
      itemName: result.itemName,
      openingNumber: result.openingNumber,
      claimed: result.snapshot.claimed,
      selectedIndex: result.snapshot.selectedIndex,
      choices: result.snapshot.cardIds.map((cardId, index) => {
        const card = cardsById.get(cardId);
        if (!card) throw new AppError("Une carte réservée n'existe plus.", 500);
        return { card, variant: result.snapshot.variants[index]! };
      })
    };
  }

  async claimBoosterChoice(
    userId: string,
    itemKey: string,
    openingNumber: number,
    selectedIndex: number
  ) {
    const tier = tierFromItemKey(itemKey, "booster");
    if (!Number.isSafeInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 2) {
      throw new AppError("Choix de carte invalide.", 400);
    }
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
      );
      const item = await tx.itemDefinition.findUnique({ where: { contentKey: itemKey } });
      if (!item || item.status !== "PUBLISHED" || item.type !== "BOOSTER") {
        throw new AppError("Ce Booster du Conquérant n'est pas disponible.", 404);
      }
      const state = await tx.userGameplayState.upsert({
        where: { userId },
        update: {},
        create: { userId }
      });
      const { root, counts } = openCounts(state.counters);
      const currentOpeningNumber = counts[itemKey] ?? 0;
      if (!Number.isSafeInteger(openingNumber) || openingNumber < 0) {
        throw new AppError("Numéro d'ouverture du booster invalide.", 400);
      }
      const scopeKey = `conqueror-choice:${userId}:${itemKey}:${openingNumber}`;
      const selection = await tx.idempotencyRecord.findUnique({ where: { scopeKey } });
      if (!selection) {
        throw new AppError("Ouvre d'abord le booster pour générer ses trois choix.", 409);
      }
      const snapshot = parseBoosterSnapshot(selection.response);
      if (snapshot.claimed) {
        const replayIndex = snapshot.selectedIndex;
        if (replayIndex === undefined) {
          throw new AppError("La sélection enregistrée est incomplète.", 500);
        }
        return {
          cardId: snapshot.cardIds[replayIndex]!,
          variant: snapshot.variants[replayIndex]!,
          replayed: true
        };
      }
      if (openingNumber !== currentOpeningNumber) {
        throw new AppError("Cette sélection de booster n'est plus active.", 409);
      }

      const owned = await tx.userItem.findUnique({
        where: { userId_itemId: { userId, itemId: item.id } }
      });
      if (!owned || owned.quantity < 1) {
        throw new AppError("Tu ne possèdes plus ce Booster du Conquérant.", 409);
      }
      const cardId = snapshot.cardIds[selectedIndex]!;
      const variant = snapshot.variants[selectedIndex]!;
      const card = await tx.card.findUnique({ where: { id: cardId } });
      if (!card || card.status !== "PUBLISHED" || !card.isActive) {
        throw new AppError("La carte choisie n'est plus disponible.", 409);
      }
      const inventory = await tx.inventoryItem.findUnique({
        where: {
          userId_cardId_variant: {
            userId,
            cardId,
            variant: variant as CardVariant
          }
        }
      });
      const consumed = await tx.userItem.updateMany({
        where: { id: owned.id, quantity: { gt: 0 }, version: owned.version },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) throw new AppError("Ton inventaire a changé.", 409);
      await tx.inventoryItem.upsert({
        where: {
          userId_cardId_variant: {
            userId,
            cardId,
            variant: variant as CardVariant
          }
        },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: { userId, cardId, variant: variant as CardVariant, quantity: 1 }
      });
      await tx.economicLedgerEntry.createMany({
        data: [
          {
            userId,
            asset: "ITEM",
            assetKey: itemKey,
            delta: -1,
            balanceBefore: owned.quantity,
            balanceAfter: owned.quantity - 1,
            reason: "conqueror.booster_opened",
            referenceType: "ItemDefinition",
            referenceId: item.id,
            operationKey: `${scopeKey}:item`
          },
          {
            userId,
            asset: "CARD",
            assetKey: `${cardId}:${variant}`,
            delta: 1,
            balanceBefore: inventory?.quantity ?? 0,
            balanceAfter: (inventory?.quantity ?? 0) + 1,
            reason: "conqueror.booster_choice",
            referenceType: "ItemDefinition",
            referenceId: item.id,
            operationKey: `${scopeKey}:card`,
            metadata: { selectedIndex, tier }
          }
        ]
      });
      await tx.transactionLog.create({
        data: {
          userId,
          type: "booster",
          amount: 1,
          metadata: {
            action: "open_conqueror",
            itemKey,
            cardId,
            variant,
            selectedIndex
          }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${scopeKey}:opened`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "booster.opened",
          eventVersion: 1,
          payload: { userId, boosterType: itemKey, cardIds: [cardId], variants: [variant] }
        }
      });
      const updatedSnapshot: BoosterChoiceSnapshot = {
        ...snapshot,
        claimed: true,
        selectedIndex
      };
      await tx.idempotencyRecord.update({
        where: { scopeKey },
        data: { response: updatedSnapshot as unknown as Prisma.InputJsonObject }
      });
      await tx.userGameplayState.update({
        where: { userId },
        data: {
          counters: {
            ...root,
            conquerorBoosterOpenCounts: {
              ...counts,
              [itemKey]: currentOpeningNumber + 1
            }
          } as Prisma.InputJsonObject,
          version: { increment: 1 }
        }
      });
      return { cardId, variant, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const card = await prisma.card.findUniqueOrThrow({
      where: { id: result.cardId },
      include: { rarity: true, deck: true }
    });
    if (!result.replayed) await this.collectionService.grantCollectionRewards(userId);
    return { ...result, card };
  }

  async openChest(
    userId: string,
    itemKey: string,
    idempotencyKey: string
  ) {
    const tier = tierFromItemKey(itemKey, "chest");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/.test(idempotencyKey)) {
      throw new AppError("Une clé d'idempotence valide est requise.", 400);
    }
    const scopeKey = `conqueror-chest:${userId}:${idempotencyKey}`;
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ userId, itemKey }))
      .digest("hex");
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${scopeKey}, 0))`
      );
      const replay = await tx.idempotencyRecord.findUnique({ where: { scopeKey } });
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new AppError("Cette opération a déjà servi pour un autre coffre.", 409);
        }
        return { snapshot: parseChestSnapshot(replay.response), replayed: true };
      }

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
      );
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("Utilisateur introuvable.", 404);
      const item = await tx.itemDefinition.findUnique({ where: { contentKey: itemKey } });
      if (!item || item.status !== "PUBLISHED" || item.type !== "CHEST") {
        throw new AppError("Ce Coffre du Conquérant n'est pas disponible.", 404);
      }
      const owned = await tx.userItem.findUnique({
        where: { userId_itemId: { userId, itemId: item.id } }
      });
      if (!owned || owned.quantity < 1) {
        throw new AppError("Tu ne possèdes pas ce Coffre du Conquérant.", 409);
      }
      const progress = await tx.userProgress.upsert({
        where: { userId },
        update: {},
        create: { userId, level: user.level, xp: user.xp }
      });
      const chest = CONQUEROR_CHEST_RANGES[tier];
      const allowedTiers = new Set(chest.consumableTiers);
      const candidates = (await tx.itemDefinition.findMany({
        where: {
          status: "PUBLISHED",
          type: "CONSUMABLE",
          contentKey: { not: "consumable.expedition_pass" }
        },
        include: {
          users: { where: { userId }, take: 1 }
        },
        orderBy: { contentKey: "asc" }
      })).filter((candidate) => {
        const metadata = jsonRecord(candidate.metadata);
        const candidateTier = normalizeCaptureConsumableTier(metadata.rarity);
        const quantity = candidate.users[0]?.quantity ?? 0;
        return candidateTier !== null
          && allowedTiers.has(candidateTier)
          && quantity < candidate.maxStack;
      });
      if (candidates.length === 0) {
        throw new AppError("Aucun consommable éligible n'est disponible pour ce coffre.", 409);
      }

      const random = createSeededRandom(`${scopeKey}:${requestHash}`);
      const consumable = candidates[Math.floor(randomValue(random) * candidates.length)]!;
      const consumableStock = consumable.users[0]?.quantity ?? 0;
      const credits = rollInteger(chest.credits, random);
      const xp = rollInteger(chest.xp, random);
      const xpResult = applyXpGain(progress.level, progress.xp, xp);

      const consumed = await tx.userItem.updateMany({
        where: { id: owned.id, quantity: { gt: 0 }, version: owned.version },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) throw new AppError("Ton inventaire a changé.", 409);
      await tx.userItem.upsert({
        where: { userId_itemId: { userId, itemId: consumable.id } },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: { userId, itemId: consumable.id, quantity: 1 }
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: { increment: credits },
          level: xpResult.level,
          xp: xpResult.xp,
          balanceVersion: { increment: 1 }
        }
      });
      await tx.userProgress.update({
        where: { userId },
        data: {
          level: xpResult.level,
          xp: xpResult.xp,
          unspentSkillPoints: { increment: xpResult.levelsGained },
          version: { increment: 1 }
        }
      });
      const snapshot: ChestOpenSnapshot = {
        itemKey,
        itemName: item.name,
        consumableItemId: consumable.id,
        consumableKey: consumable.contentKey,
        consumableName: consumable.name,
        credits,
        xp,
        resultingLevel: xpResult.level,
        resultingLevelXp: xpResult.xp,
        levelsGained: xpResult.levelsGained
      };
      await tx.economicLedgerEntry.createMany({
        data: [
          {
            userId,
            asset: "ITEM",
            assetKey: itemKey,
            delta: -1,
            balanceBefore: owned.quantity,
            balanceAfter: owned.quantity - 1,
            reason: "conqueror.chest_opened",
            referenceType: "ItemDefinition",
            referenceId: item.id,
            operationKey: `${scopeKey}:chest`
          },
          {
            userId,
            asset: "ITEM",
            assetKey: consumable.contentKey,
            delta: 1,
            balanceBefore: consumableStock,
            balanceAfter: consumableStock + 1,
            reason: "conqueror.chest_consumable",
            referenceType: "ItemDefinition",
            referenceId: item.id,
            operationKey: `${scopeKey}:consumable`
          },
          {
            userId,
            asset: "CREDITS",
            delta: credits,
            balanceBefore: user.credits,
            balanceAfter: user.credits + credits,
            reason: "conqueror.chest_credits",
            referenceType: "ItemDefinition",
            referenceId: item.id,
            operationKey: `${scopeKey}:credits`
          },
          {
            userId,
            asset: "XP",
            delta: xp,
            balanceBefore: progress.xp,
            balanceAfter: progress.xp + xp,
            reason: "conqueror.chest_xp",
            referenceType: "ItemDefinition",
            referenceId: item.id,
            operationKey: `${scopeKey}:xp`,
            metadata: {
              levelsGained: xpResult.levelsGained,
              resultingLevel: xpResult.level,
              resultingLevelXp: xpResult.xp
            }
          }
        ]
      });
      await tx.transactionLog.create({
        data: {
          userId,
          type: "boss_chest_reward",
          amount: credits,
          metadata: snapshot as unknown as Prisma.InputJsonObject
        }
      });
      await tx.economyLog.create({
        data: {
          userId,
          type: "boss_chest_credits",
          amount: credits,
          metadata: { itemKey, tier, consumableKey: consumable.contentKey }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${scopeKey}:opened`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "boss_chest.opened",
          eventVersion: 1,
          payload: { userId, tier, ...snapshot }
        }
      });
      await tx.idempotencyRecord.create({
        data: {
          scopeKey,
          scope: "conqueror.chest.open",
          key: idempotencyKey,
          requestHash,
          status: "COMPLETED",
          response: snapshot as unknown as Prisma.InputJsonObject,
          responseCode: 200,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60_000)
        }
      });
      return { snapshot, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { tier, ...result.snapshot, replayed: result.replayed };
  }
}
