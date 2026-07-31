import { Prisma, prisma } from "@rta/database";
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

export class FusionService {
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
        cost: 6,
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
    selectedRewardCardId?: string
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
          fusionCost: Number(metadata.consumedQuantity ?? 6)
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
        include: { card: true },
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

      let remaining = cost;
      let consumedIndex = 0;
      for (const item of items) {
        if (remaining <= 0) break;
        const removable = removableByCard.get(item.cardId) ?? 0;
        const remove = Math.min(remaining, item.quantity, removable);
        if (remove <= 0) continue;
        removableByCard.set(item.cardId, removable - remove);
        remaining -= remove;
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
            metadata: { sourceRarity: rarity, variant: item.variant }
          }
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
        consumedQuantity: cost
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
      return Object.assign(reward, { fusionCost: cost });
    });
  }
}
