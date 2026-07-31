import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";
import {
  FRAGMENT_REWARD_KEYS,
  RECYCLE_PRICE_KEYS,
  getEconomyConfig,
  getFragmentReward,
  getRecyclePrice
} from "./economy-config.js";
import { assertCardCanLeaveCollection } from "./collection-protection.js";

export class RecycleService {
  async getRecycleQuote(
    userId: string,
    cardId: string,
    quantity = 1,
    variant?: "normal" | "shiny" | "holo"
  ) {
    const safeQuantity = Math.max(1, Math.floor(quantity));
    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { rarity: true } });
    if (!card) {
      throw new AppError("Card not found", 404);
    }
    if (
      !(card.rarity.name in RECYCLE_PRICE_KEYS)
      || !(card.rarity.name in FRAGMENT_REWARD_KEYS)
    ) {
      throw new AppError("Cette rareté ne peut pas être recyclée.", 409);
    }

    const config = await getEconomyConfig();
    const unitCredits = getRecyclePrice(config, card.rarity.name as keyof typeof import("./economy-config.js").RECYCLE_PRICE_KEYS);
    const unitFragments = getFragmentReward(config, card.rarity.name as keyof typeof import("./economy-config.js").FRAGMENT_REWARD_KEYS);
    const credits = unitCredits * safeQuantity;
    const fragments = unitFragments * safeQuantity;
    const owned = await prisma.inventoryItem.aggregate({
      where: {
        userId,
        cardId,
        ...(variant ? { variant } : {})
      },
      _sum: { quantity: true }
    });
    if ((owned._sum.quantity ?? 0) < safeQuantity) {
      throw new AppError("Not enough cards in inventory", 409);
    }
    return {
      card,
      quantity: safeQuantity,
      variant: variant ?? null,
      unitCredits,
      unitFragments,
      credits,
      fragments
    };
  }

  async recycleCard(
    userId: string,
    cardId: string,
    quantity: number,
    idempotencyKey: string,
    variant?: "normal" | "shiny" | "holo",
    options?: { confirmedLastCopy?: boolean }
  ) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/.test(idempotencyKey)) {
      throw new AppError("A valid idempotency key is required", 400);
    }
    const quote = await this.getRecycleQuote(userId, cardId, quantity, variant);
    const {
      card,
      quantity: safeQuantity,
      unitCredits,
      unitFragments,
      credits,
      fragments: baseFragments
    } = quote;
    const operationKey = `card-recycle:${userId}:${idempotencyKey}`;

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"economy:" + userId}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: `${operationKey}:credits` }
      });
      if (replay) {
        const metadata =
          replay.metadata && typeof replay.metadata === "object" && !Array.isArray(replay.metadata)
            ? (replay.metadata as Record<string, unknown>)
            : {};
        if (
          metadata.cardId !== cardId
          || Number(metadata.quantity) !== safeQuantity
          || (metadata.variant ?? null) !== (variant ?? null)
        ) {
          throw new AppError("Idempotency key was already used for another recycle", 409);
        }
        return {
          credits: Number(metadata.credits ?? replay.delta),
          fragments: Number(metadata.fragments ?? 0),
          replayed: true
        };
      }
      let fragments = baseFragments;
      const bonusSkill = await tx.userSkill.findFirst({
        where: {
          userId,
          rank: { gt: 0 },
          skill: { effectKey: "COL_TRANSMUTE_DAILY_FRAGMENT_BONUS", status: "PUBLISHED" }
        }
      });
      const dayKey = new Date().toISOString().slice(0, 10);
      const gameplay = await tx.userGameplayState.findUnique({ where: { userId } });
      const daily = gameplay?.dailyStateKey === dayKey &&
        gameplay.dailyState &&
        typeof gameplay.dailyState === "object" &&
        !Array.isArray(gameplay.dailyState)
        ? gameplay.dailyState as Record<string, unknown>
        : {};
      const transmutationsToday = Math.max(0, Number(daily.transmutations ?? 0));
      const fragmentBonus = bonusSkill && transmutationsToday < 3 ? 1 : 0;
      fragments += fragmentBonus;

      const inventoryRows = await tx.inventoryItem.findMany({
        where: {
          userId,
          cardId,
          ...(variant ? { variant } : {})
        },
        orderBy: [
          { variant: "asc" },
          { quantity: "desc" },
          { id: "asc" }
        ]
      });
      const totalOwned = inventoryRows.reduce((sum, row) => sum + row.quantity, 0);
      if (totalOwned < safeQuantity) {
        throw new AppError("Not enough cards in inventory", 409);
      }
      await assertCardCanLeaveCollection(tx, {
        userId,
        cardId,
        quantity: safeQuantity,
        variant,
        confirmedLastCopy: options?.confirmedLastCopy
      });

      let remaining = safeQuantity;
      for (const row of inventoryRows) {
        if (remaining <= 0) break;
        const remove = Math.min(remaining, row.quantity);
        remaining -= remove;
        const consumed = await tx.inventoryItem.updateMany({
          where: { id: row.id, quantity: { gte: remove } },
          data: { quantity: { decrement: remove }, version: { increment: 1 } }
        });
        if (consumed.count !== 1) throw new AppError("Inventory changed concurrently", 409);
        await tx.inventoryItem.deleteMany({ where: { id: row.id, quantity: 0 } });
      }

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("User not found", 404);
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: { increment: credits },
          fragments: { increment: fragments },
          balanceVersion: { increment: 1 }
        }
      });
      await tx.fragmentBalance.upsert({
        where: { userId_rarityId: { userId, rarityId: card.rarityId } },
        update: { quantity: { increment: fragments } },
        create: { userId, rarityId: card.rarityId, quantity: fragments }
      });
      await tx.userGameplayState.upsert({
        where: { userId },
        update: {
          transmutations: { increment: 1 },
          dailyStateKey: dayKey,
          dailyState: {
            ...daily,
            transmutations: transmutationsToday + 1
          },
          version: { increment: 1 }
        },
        create: {
          userId,
          transmutations: 1,
          dailyStateKey: dayKey,
          dailyState: { transmutations: 1 }
        }
      });
      const metadata = {
        cardId,
        quantity: safeQuantity,
        variant: variant ?? null,
        credits,
        fragments,
        unitCredits,
        unitFragments
        ,
        fragmentBonus
      };
      await tx.economicLedgerEntry.createMany({
        data: [
          {
            userId,
            asset: "CREDITS",
            delta: credits,
            balanceBefore: user.credits,
            balanceAfter: user.credits + credits,
            reason: "card.recycled",
            referenceType: "Card",
            referenceId: cardId,
            operationKey: `${operationKey}:credits`,
            metadata
          },
          {
            userId,
            asset: "FRAGMENTS",
            assetKey: card.rarity.name,
            delta: fragments,
            balanceBefore: user.fragments,
            balanceAfter: user.fragments + fragments,
            reason: "card.recycled",
            referenceType: "Card",
            referenceId: cardId,
            operationKey: `${operationKey}:fragments`,
            metadata
          }
        ]
      });
      await tx.transactionLog.create({
        data: { userId, type: "recycle", amount: credits, metadata: { ...metadata, operationKey } }
      });
      await tx.economyLog.create({
        data: {
          userId,
          type: "sell",
          amount: credits,
          metadata: { action: "recycle", ...metadata, operationKey }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "card.recycled",
          eventVersion: 1,
          payload: { userId, ...metadata }
        }
      });
      return { credits, fragments, replayed: false };
    });

    return { ...result, quantity: safeQuantity, variant: variant ?? null, card };
  }
}
