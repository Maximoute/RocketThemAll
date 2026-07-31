import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";

const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/;

function creditPrice(value: Prisma.JsonValue | null): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const price = Number((value as Record<string, Prisma.JsonValue>).creditPrice);
  return Number.isSafeInteger(price) && price > 0 ? price : 0;
}

export class ItemShopService {
  async buyItem(userId: string, contentKey: string, idempotencyKey: string) {
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppError("Une clé d'idempotence valide est requise", 400);
    }
    const operationKey = `item-buy:${userId}:${idempotencyKey}`;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({ where: { operationKey } });
      if (replay) {
        return {
          contentKey: replay.referenceId,
          price: Math.abs(replay.delta),
          replayed: true
        };
      }

      const item = await tx.itemDefinition.findUnique({ where: { contentKey } });
      const price = creditPrice(item?.metadata ?? null);
      if (!item || item.status !== "PUBLISHED" || item.type === "BOOSTER" || price <= 0) {
        throw new AppError("Objet non disponible à l'achat", 404);
      }

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("Utilisateur introuvable", 404);
      if (user.credits < price) throw new AppError("Crédits insuffisants", 409);

      const stock = await tx.userItem.findUnique({
        where: { userId_itemId: { userId, itemId: item.id } }
      });
      if ((stock?.quantity ?? 0) >= item.maxStack) {
        throw new AppError("Stock maximum atteint pour cet objet", 409);
      }

      await tx.user.update({
        where: { id: userId },
        data: { credits: { decrement: price }, balanceVersion: { increment: 1 } }
      });
      await tx.userItem.upsert({
        where: { userId_itemId: { userId, itemId: item.id } },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: { userId, itemId: item.id, quantity: 1 }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "CREDITS",
          delta: -price,
          balanceBefore: user.credits,
          balanceAfter: user.credits - price,
          reason: "item.purchased",
          referenceType: "ItemDefinition",
          referenceId: item.contentKey,
          operationKey,
          metadata: { price, itemName: item.name, itemType: item.type }
        }
      });
      await tx.transactionLog.create({
        data: {
          userId,
          type: "item",
          amount: -price,
          metadata: { action: "buy", contentKey: item.contentKey, operationKey }
        }
      });
      await tx.economyLog.create({
        data: {
          userId,
          type: "buy_item",
          amount: price,
          metadata: { contentKey: item.contentKey, operationKey }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "item.purchased",
          eventVersion: 1,
          payload: { userId, contentKey: item.contentKey, price }
        }
      });

      return { contentKey: item.contentKey, price, replayed: false };
    });
  }
}
