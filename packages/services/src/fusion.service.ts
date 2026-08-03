import { Prisma, prisma } from "@rta/database";
import { createHash } from "node:crypto";
import { createSeededRandom, randomValue } from "@rta/game-engine";
import { AppError } from "./errors.js";

const NEXT_RARITY: Record<string, string | null> = {
  Common: "Uncommon",
  Uncommon: "Rare",
  Rare: "Very Rare",
  "Very Rare": "Import",
  Import: "Exotic",
  Exotic: "Black Market",
  "Black Market": null,
  Limited: null
};

function utcWeekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function fusionCostForSkills(rarity: string, effectKeys: string[]) {
  const discounted = ["Common", "Uncommon", "Rare"].includes(rarity)
    && effectKeys.includes("COL_CRAFT_COST_FIVE");
  return discounted ? 5 : 6;
}

type FusionConsumedCard = {
  inventoryItemId: string;
  cardId: string;
  name: string;
  deckName: string;
  variant: string;
  quantity: number;
};

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function consumedCardsFromMetadata(value: unknown): FusionConsumedCard[] {
  const rows = jsonRecord(value).consumedCards;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((entry) => {
    const row = jsonRecord(entry);
    return typeof row.inventoryItemId === "string" &&
      typeof row.cardId === "string" &&
      typeof row.name === "string" &&
      typeof row.deckName === "string" &&
      typeof row.variant === "string" &&
      Number.isSafeInteger(Number(row.quantity))
      ? [{
          inventoryItemId: row.inventoryItemId,
          cardId: row.cardId,
          name: row.name,
          deckName: row.deckName,
          variant: row.variant,
          quantity: Number(row.quantity)
        }]
      : [];
  });
}

export class FusionService {
  async getSacrificeOptions(
    userId: string,
    rarity: string,
    query = "",
    limit = 25
  ) {
    const [items, skills] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: {
          userId,
          quantity: { gt: 0 },
          archive: null,
          card: { rarity: { name: rarity } }
        },
        include: {
          card: { include: { rarity: true, deck: true } }
        },
        orderBy: [
          { card: { name: "asc" } },
          { variant: "asc" }
        ]
      }),
      prisma.userSkill.findMany({
        where: { userId, rank: { gt: 0 } },
        select: { skill: { select: { effectKey: true } } }
      })
    ]);
    const effectKeys = skills.map((entry) => entry.skill.effectKey);
    const protectsLastCopy = effectKeys.includes("COL_PROTECT_LAST_COPY");
    const totalsByCard = new Map<string, number>();
    for (const item of items) {
      totalsByCard.set(item.cardId, (totalsByCard.get(item.cardId) ?? 0) + item.quantity);
    }
    const remainingByCard = new Map(
      [...totalsByCard].map(([cardId, quantity]) => [
        cardId,
        Math.max(0, quantity - (protectsLastCopy ? 1 : 0))
      ])
    );
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return items.flatMap((item) => {
      const remaining = remainingByCard.get(item.cardId) ?? 0;
      const removableQuantity = Math.min(item.quantity, remaining);
      remainingByCard.set(item.cardId, Math.max(0, remaining - removableQuantity));
      if (removableQuantity < 1) return [];
      if (normalizedQuery && ![
        item.card.name,
        item.card.deck.name,
        item.variant
      ].some((value) => value.toLocaleLowerCase("fr").includes(normalizedQuery))) {
        return [];
      }
      return [{
        inventoryItemId: item.id,
        cardId: item.cardId,
        name: item.card.name,
        deckName: item.card.deck.name,
        rarity: item.card.rarity.name,
        variant: item.variant,
        quantity: item.quantity,
        removableQuantity
      }];
    }).slice(0, Math.max(1, Math.min(25, limit)));
  }

  async prepareFusionDraft(input: {
    userId: string;
    rarity: string;
    inventoryItemIds: string[];
    draftKey: string;
  }) {
    const scopeKey = `fusion-draft:${input.userId}:${input.draftKey}`;
    const response = {
      userId: input.userId,
      rarity: input.rarity,
      inventoryItemIds: input.inventoryItemIds
    };
    const requestHash = createHash("sha256")
      .update(JSON.stringify(response))
      .digest("hex");
    const existing = await prisma.idempotencyRecord.findUnique({ where: { scopeKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError("Cette préparation de fusion est déjà utilisée.", 409);
      }
      return input.draftKey;
    }
    await prisma.idempotencyRecord.create({
      data: {
        scopeKey,
        scope: "card.fusion.draft",
        key: input.draftKey,
        requestHash,
        status: "COMPLETED",
        response,
        responseCode: 200,
        expiresAt: new Date(Date.now() + 15 * 60_000)
      }
    });
    return input.draftKey;
  }

  async fusePreparedDraft(
    userId: string,
    draftKey: string,
    selectedRewardCardId: string
  ) {
    const draft = await prisma.idempotencyRecord.findUnique({
      where: { scopeKey: `fusion-draft:${userId}:${draftKey}` }
    });
    if (!draft || draft.expiresAt <= new Date()) {
      throw new AppError("Cette préparation de fusion a expiré. Relance /fusion.", 409);
    }
    const response = jsonRecord(draft.response);
    const inventoryItemIds = Array.isArray(response.inventoryItemIds)
      ? response.inventoryItemIds.filter((entry): entry is string => typeof entry === "string")
      : [];
    if (response.userId !== userId || typeof response.rarity !== "string") {
      throw new AppError("Préparation de fusion invalide.", 409);
    }
    return this.fuse(
      userId,
      response.rarity,
      draftKey,
      selectedRewardCardId,
      inventoryItemIds
    );
  }

  async getFusionChoices(userId: string, rarity: string) {
    const nextRarity = NEXT_RARITY[rarity];
    if (!nextRarity) return { choices: [], checkpoint: null, cost: 6 };
    const [state, learned, rewardPool] = await Promise.all([
      prisma.userGameplayState.findUnique({ where: { userId } }),
      prisma.userSkill.findMany({
        where: { userId, rank: { gt: 0 } },
        select: { skill: { select: { effectKey: true } } }
      }),
      prisma.card.findMany({
        where: {
          rarity: { name: nextRarity },
          source: "vault",
          status: "PUBLISHED",
          isActive: true
        },
        include: { rarity: true, deck: true },
        orderBy: { id: "asc" }
      })
    ]);
    const effectKeys = learned.map((entry) => entry.skill.effectKey);
    if (!effectKeys.includes("COL_ARTISAN_GRANT_CRUCIBLE")) {
      return {
        choices: [],
        checkpoint: null,
        cost: fusionCostForSkills(rarity, effectKeys),
        locked: true
      };
    }
    const checkpoint = Math.floor((state?.transmutations ?? 0) / 9);
    const eligible = effectKeys.includes("COL_CRAFT_THREE_RESULTS")
      && (state?.transmutations ?? 0) > 0
      && (state?.transmutations ?? 0) % 9 === 0
      && checkpoint > 0;
    const [used, usedThisWeek] = eligible
      ? await Promise.all([
          prisma.actionCooldown.findUnique({
            where: { scopeKey: `fusion-choice:${userId}:${checkpoint}` }
          }),
          prisma.actionCooldown.findUnique({
            where: { scopeKey: `fusion-choice-week:${userId}:${utcWeekKey()}` }
          })
        ])
      : [null, null];
    if (!eligible || used || usedThisWeek) {
      return {
        choices: [],
        checkpoint: null,
        cost: fusionCostForSkills(rarity, effectKeys)
      };
    }
    const random = createSeededRandom(`fusion-options:${userId}:${rarity}:${checkpoint}`);
    const pool = [...rewardPool];
    const choices = [];
    while (choices.length < 3 && pool.length > 0) {
      choices.push(pool.splice(Math.floor(randomValue(random) * pool.length), 1)[0]!);
    }
    return {
      choices,
      checkpoint,
      cost: fusionCostForSkills(rarity, effectKeys)
    };
  }

  async canFuse(userId: string, rarity: string) {
    const [items, skills] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { userId, card: { rarity: { name: rarity } }, archive: null },
        include: { card: { include: { rarity: true } } }
      }),
      prisma.userSkill.findMany({
        where: { userId, rank: { gt: 0 } },
        select: { skill: { select: { effectKey: true } } }
      })
    ]);
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const effectKeys = skills.map((entry) => entry.skill.effectKey);
    if (!effectKeys.includes("COL_ARTISAN_GRANT_CRUCIBLE")) return false;
    const cost = fusionCostForSkills(rarity, effectKeys);
    return quantity >= cost && NEXT_RARITY[rarity] !== null;
  }

  async fuse(
    userId: string,
    rarity: string,
    idempotencyKey: string,
    selectedRewardCardId?: string,
    selectedInventoryItemIds: string[] = []
  ) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/.test(idempotencyKey)) {
      throw new AppError("A valid idempotency key is required", 400);
    }
    const nextRarity = NEXT_RARITY[rarity];
    if (!nextRarity) {
      throw new AppError("Cette rareté ne peut pas être fusionnée.", 409);
    }
    const operationKey = `card-fusion:${userId}:${idempotencyKey}`;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"economy:" + userId}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: `${operationKey}:reward` }
      });
      if (replay) {
        const metadata =
          replay.metadata && typeof replay.metadata === "object" && !Array.isArray(replay.metadata)
            ? (replay.metadata as Record<string, unknown>)
            : {};
        if (metadata.sourceRarity !== rarity || typeof metadata.rewardCardId !== "string") {
          throw new AppError("Idempotency key was already used for another fusion", 409);
        }
        const priorReward = await tx.card.findUnique({
          where: { id: metadata.rewardCardId },
          include: { rarity: true, deck: true }
        });
        if (!priorReward) throw new AppError("Fusion replay reward no longer exists", 409);
        return Object.assign(priorReward, {
          fusionCost: Number(metadata.consumedQuantity ?? 6),
          consumedCards: consumedCardsFromMetadata(metadata)
        });
      }

      const config = await tx.appConfig.upsert({
        where: { id: "default" },
        update: {},
        create: { id: "default" }
      });
      if (!config.fusionEnabled) {
        throw new AppError("La fusion est désactivée.", 403);
      }

      const learned = await tx.userSkill.findMany({
        where: { userId, rank: { gt: 0 } },
        select: { skill: { select: { effectKey: true } } }
      });
      const effectKeys = learned.map((entry) => entry.skill.effectKey);
      if (!effectKeys.includes("COL_ARTISAN_GRANT_CRUCIBLE")) {
        throw new AppError(
          "Débloque la spécialisation Artisan et son Creuset avant de transmuter.",
          403
        );
      }
      const cost = fusionCostForSkills(rarity, effectKeys);
      const protectsLastCopy = effectKeys.includes("COL_PROTECT_LAST_COPY");
      const items = await tx.inventoryItem.findMany({
        where: { userId, card: { rarity: { name: rarity } }, archive: null },
        include: { card: { include: { deck: true } } },
        orderBy: [{ quantity: "desc" }, { id: "asc" }]
      });
      const totalsByCard = new Map<string, number>();
      for (const item of items) {
        totalsByCard.set(item.cardId, (totalsByCard.get(item.cardId) ?? 0) + item.quantity);
      }
      const removableByCard = new Map(
        [...totalsByCard].map(([cardId, quantity]) => [
          cardId,
          Math.max(0, quantity - (protectsLastCopy ? 1 : 0))
        ])
      );
      const total = [...removableByCard.values()].reduce((sum, quantity) => sum + quantity, 0);
      if (total < cost) {
        throw new AppError(
          `Il faut ${cost} cartes disponibles de cette rareté pour fusionner ` +
          "(les Archives et derniers exemplaires protégés sont exclus).",
          409
        );
      }
      if (selectedInventoryItemIds.length !== cost) {
        throw new AppError(
          `Choisis exactement ${cost} cartes à détruire pour cette fusion.`,
          400
        );
      }
      const itemsById = new Map(items.map((item) => [item.id, item]));
      const selectedByItem = new Map<string, number>();
      for (const inventoryItemId of selectedInventoryItemIds) {
        if (!itemsById.has(inventoryItemId)) {
          throw new AppError(
            "Une carte choisie n'est plus disponible, n'a pas la bonne rareté ou est archivée.",
            409
          );
        }
        selectedByItem.set(
          inventoryItemId,
          (selectedByItem.get(inventoryItemId) ?? 0) + 1
        );
      }
      const selectedByCard = new Map<string, number>();
      for (const [inventoryItemId, quantity] of selectedByItem) {
        const item = itemsById.get(inventoryItemId)!;
        if (quantity > item.quantity) {
          throw new AppError(
            `Tu ne possèdes plus ${quantity} exemplaires de ${item.card.name} (${item.variant}).`,
            409
          );
        }
        selectedByCard.set(item.cardId, (selectedByCard.get(item.cardId) ?? 0) + quantity);
      }
      for (const [cardId, quantity] of selectedByCard) {
        if (quantity > (removableByCard.get(cardId) ?? 0)) {
          throw new AppError(
            "Cette sélection détruirait un dernier exemplaire protégé. Choisis une autre carte.",
            409
          );
        }
      }

      const rewardPool = await tx.card.findMany({
        where: {
          rarity: { name: nextRarity },
          source: "vault",
          status: "PUBLISHED",
          isActive: true,
        },
        include: { rarity: true, deck: true },
        orderBy: { id: "asc" }
      });
      if (rewardPool.length === 0) {
        throw new AppError("Aucune carte disponible dans la rareté supérieure.", 500);
      }
      const choicePreview = await this.getFusionChoices(userId, rarity);
      const selectedChoice = selectedRewardCardId
        ? choicePreview.choices.find((card) => card.id === selectedRewardCardId)
        : null;
      if (selectedRewardCardId && !selectedChoice) {
        throw new AppError("Ce résultat de fusion n'est plus disponible.", 409);
      }
      const random = createSeededRandom(operationKey);
      const reward = selectedChoice ??
        rewardPool[Math.floor(randomValue(random) * rewardPool.length)]!;

      const consumedCards: FusionConsumedCard[] = [];
      let consumedIndex = 0;
      for (const [inventoryItemId, remove] of selectedByItem) {
        const item = itemsById.get(inventoryItemId)!;
        const consumed = await tx.inventoryItem.updateMany({
          where: { id: item.id, quantity: { gte: remove } },
          data: { quantity: { decrement: remove }, version: { increment: 1 } }
        });
        if (consumed.count !== 1) throw new AppError("Inventory changed concurrently", 409);
        await tx.inventoryItem.deleteMany({ where: { id: item.id, quantity: 0 } });
        await tx.economicLedgerEntry.create({
          data: {
            userId,
            asset: "CARD",
            assetKey: `${item.cardId}:${item.variant}`,
            delta: -remove,
            balanceBefore: item.quantity,
            balanceAfter: item.quantity - remove,
            reason: "card.fusion.consumed",
            referenceType: "Card",
            referenceId: item.cardId,
            operationKey: `${operationKey}:consume:${consumedIndex}`,
            metadata: {
              sourceRarity: rarity,
              variant: item.variant,
              cardName: item.card.name,
              quantity: remove
            }
          }
        });
        consumedCards.push({
          inventoryItemId: item.id,
          cardId: item.cardId,
          name: item.card.name,
          deckName: item.card.deck.name,
          variant: item.variant,
          quantity: remove
        });
        consumedIndex += 1;
      }

      const rewardInventory = await tx.inventoryItem.findUnique({
        where: {
          userId_cardId_variant: { userId, cardId: reward.id, variant: "normal" }
        }
      });
      await tx.inventoryItem.upsert({
        where: { userId_cardId_variant: { userId, cardId: reward.id, variant: "normal" } },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: { userId, cardId: reward.id, variant: "normal", quantity: 1 }
      });

      const metadata = {
        sourceRarity: rarity,
        targetRarity: nextRarity,
        rewardCardId: reward.id,
        consumedQuantity: cost,
        consumedCards
      };
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "CARD",
          assetKey: `${reward.id}:normal`,
          delta: 1,
          balanceBefore: rewardInventory?.quantity ?? 0,
          balanceAfter: (rewardInventory?.quantity ?? 0) + 1,
          reason: "card.fusion.reward",
          referenceType: "Card",
          referenceId: reward.id,
          operationKey: `${operationKey}:reward`,
          metadata
        }
      });
      await tx.transactionLog.create({
        data: { userId, type: "fusion", amount: 1, metadata: { ...metadata, operationKey } }
      });
      await tx.economyLog.create({
        data: { userId, type: "fusion", amount: 1, metadata: { ...metadata, operationKey } }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "card.fusion.completed",
          eventVersion: 1,
          payload: { userId, ...metadata }
        }
      });
      if (choicePreview.checkpoint) {
        await tx.actionCooldown.createMany({
          data: [
            {
              scopeKey: `fusion-choice:${userId}:${choicePreview.checkpoint}`,
              action: "COL_CRAFT_THREE_RESULTS",
              userId,
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60_000)
            },
            {
              scopeKey: `fusion-choice-week:${userId}:${utcWeekKey()}`,
              action: "COL_CRAFT_THREE_RESULTS_WEEKLY",
              userId,
              expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60_000)
            }
          ]
        });
      }
      return Object.assign(reward, { fusionCost: cost, consumedCards });
    });
  }

  async getFusionHistory(userId: string, limit = 5) {
    const rewards = await prisma.economicLedgerEntry.findMany({
      where: { userId, reason: "card.fusion.reward" },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(10, limit))
    });
    const rewardCardIds = rewards.map((entry) => entry.referenceId);
    const cards = await prisma.card.findMany({
      where: { id: { in: rewardCardIds } },
      select: { id: true, name: true, rarity: { select: { name: true } } }
    });
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const history = [];
    for (const reward of rewards) {
      const metadata = jsonRecord(reward.metadata);
      let consumedCards = consumedCardsFromMetadata(metadata);
      if (consumedCards.length === 0) {
        const operationPrefix = reward.operationKey.replace(/:reward$/, ":consume:");
        const consumedEntries = await prisma.economicLedgerEntry.findMany({
          where: {
            userId,
            reason: "card.fusion.consumed",
            operationKey: { startsWith: operationPrefix }
          },
          orderBy: { createdAt: "asc" }
        });
        const consumedIds = consumedEntries.map((entry) => entry.referenceId);
        const consumedDefinitions = await prisma.card.findMany({
          where: { id: { in: consumedIds } },
          select: { id: true, name: true, deck: { select: { name: true } } }
        });
        const definitionsById = new Map(
          consumedDefinitions.map((card) => [card.id, card])
        );
        consumedCards = consumedEntries.flatMap((entry) => {
          const card = definitionsById.get(entry.referenceId);
          const consumedMetadata = jsonRecord(entry.metadata);
          return card ? [{
            inventoryItemId: "historical",
            cardId: card.id,
            name: card.name,
            deckName: card.deck.name,
            variant: String(consumedMetadata.variant ?? "normal"),
            quantity: Math.abs(entry.delta)
          }] : [];
        });
      }
      const card = cardsById.get(reward.referenceId);
      history.push({
        createdAt: reward.createdAt,
        rewardName: card?.name ?? "Carte inconnue",
        rewardRarity: card?.rarity.name ?? String(metadata.targetRarity ?? "Inconnue"),
        sourceRarity: String(metadata.sourceRarity ?? "Inconnue"),
        consumedCards
      });
    }
    return history;
  }
}
