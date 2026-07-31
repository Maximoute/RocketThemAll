import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { EconomyService, type VariantName } from "./economy.service.js";
import { assertCardCanLeaveCollection } from "./collection-protection.js";

export class SellService {
  private readonly economyService = new EconomyService();

  async getCardSellPrice(cardId: string, variant: VariantName = "normal") {
    return this.economyService.getDynamicSellPrice(cardId, variant);
  }

  async sellCard(
    userId: string,
    cardId: string,
    quantity: number,
    idempotencyKey: string,
    variant: VariantName = "normal",
    options?: { confirmedLastCopy?: boolean }
  ) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/.test(idempotencyKey)) {
      throw new AppError("A valid idempotency key is required", 400);
    }
    const safeQuantity = Math.max(1, Math.floor(quantity));
    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { rarity: true } });
    if (!card) {
      throw new AppError("Card not found", 404);
    }

    const dynamic = await this.economyService.getDynamicSellPrice(cardId, variant);
    const unitPrice = dynamic.unitPrice;
    const credits = unitPrice * safeQuantity;
    const operationKey = `card-sell:${userId}:${idempotencyKey}`;

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"economy:" + userId}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({ where: { operationKey } });
      if (replay) {
        const metadata =
          replay.metadata && typeof replay.metadata === "object" && !Array.isArray(replay.metadata)
            ? (replay.metadata as Record<string, unknown>)
            : {};
        if (
          metadata.cardId !== cardId ||
          metadata.variant !== variant ||
          Number(metadata.quantity) !== safeQuantity
        ) {
          throw new AppError("Idempotency key was already used for another sale", 409);
        }
        return { replayed: true };
      }

      const inventory = await tx.inventoryItem.findUnique({
        where: { userId_cardId_variant: { userId, cardId, variant } }
      });
      if (!inventory || inventory.quantity < safeQuantity) {
        throw new AppError("Not enough cards in inventory", 409);
      }
      await assertCardCanLeaveCollection(tx, {
        userId,
        cardId,
        quantity: safeQuantity,
        variant,
        confirmedLastCopy: options?.confirmedLastCopy
      });
      const consumed = await tx.inventoryItem.updateMany({
        where: { id: inventory.id, quantity: { gte: safeQuantity } },
        data: { quantity: { decrement: safeQuantity }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) throw new AppError("Inventory changed concurrently", 409);
      await tx.inventoryItem.deleteMany({ where: { id: inventory.id, quantity: 0 } });

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("User not found", 404);
      await tx.user.update({
        where: { id: userId },
        data: { credits: { increment: credits }, balanceVersion: { increment: 1 } }
      });
      const metadata = {
        cardId,
        quantity: safeQuantity,
        variant,
        unitPrice,
        circulationCount: dynamic.circulationCount
      };
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "CREDITS",
          delta: credits,
          balanceBefore: user.credits,
          balanceAfter: user.credits + credits,
          reason: "card.sold",
          referenceType: "Card",
          referenceId: cardId,
          operationKey,
          metadata
        }
      });
      await tx.transactionLog.create({
        data: { userId, type: "sell", amount: credits, metadata: { ...metadata, operationKey } }
      });
      await tx.economyLog.create({
        data: { userId, type: "sell", amount: credits, metadata: { ...metadata, operationKey } }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "card.sold",
          eventVersion: 1,
          payload: { userId, cardId, quantity: safeQuantity, variant, credits }
        }
      });
      return { replayed: false };
    });

    return { credits, quantity: safeQuantity, card, unitPrice, variant, ...result };
  }
}
