import { Prisma, prisma } from "@rta/database";
import { CollectionService } from "./collection.service.js";
import { AppError } from "./errors.js";
import { assertCardCanLeaveCollection } from "./collection-protection.js";

const TRADE_EXPIRATION_MS = 10 * 60 * 1000;
const MAX_TRADE_QUANTITY = 1_000_000;
const MAX_TRADE_CREDITS = 2_000_000_000;

export class TradeService {
  private readonly collectionService = new CollectionService();

  private requirePositiveQuantity(quantity: number, fieldName: string) {
    const safeValue = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
    if (safeValue <= 0 || safeValue > MAX_TRADE_QUANTITY) {
      throw new AppError(
        `${fieldName} must be a positive integer no greater than ${MAX_TRADE_QUANTITY}`,
        400
      );
    }
    return safeValue;
  }

  createTrade(user1Id: string, user2Id: string) {
    return this.startTrade(user1Id, user2Id);
  }

  async startTrade(user1Id: string, user2Id: string) {
    if (user1Id === user2Id) {
      throw new AppError("Cannot trade with yourself");
    }

    const trade = await prisma.trade.create({
      data: {
        user1Id,
        user2Id,
        status: "pending",
        expiresAt: new Date(Date.now() + TRADE_EXPIRATION_MS)
      }
    });

    await prisma.adminLog.create({
      data: {
        action: "TRADE_STARTED",
        target: trade.id,
        metadata: { user1Id, user2Id }
      }
    });

    return trade;
  }

  async addItem(tradeId: string, userId: string, cardId: string, quantity: number, variant: "normal" | "shiny" | "holo" = "normal") {
    if (!cardId) {
      throw new AppError("cardId is required", 400);
    }
    const safeQuantity = this.requirePositiveQuantity(quantity, "quantity");

    await prisma.$transaction(async (tx) => {
      const trade = await this.lockPendingTrade(tx, tradeId);
      this.assertTradeUser(trade, userId);
      const offerId = `${tradeId}:${userId}:card:${cardId}:${variant}`;
      const [inventory, offered] = await Promise.all([
        tx.inventoryItem.findUnique({
          where: { userId_cardId_variant: { userId, cardId, variant } }
        }),
        tx.tradeItem.findUnique({ where: { id: offerId } })
      ]);
      if (!inventory || inventory.quantity < (offered?.quantity ?? 0) + safeQuantity) {
        throw new AppError("Insufficient cards for trade", 409);
      }
      await assertCardCanLeaveCollection(tx, {
        userId,
        cardId,
        variant,
        quantity: (offered?.quantity ?? 0) + safeQuantity,
        // Adding is followed by the trade's own two-party confirmation.
        confirmedLastCopy: true
      });
      await tx.tradeItem.upsert({
        where: { id: offerId },
        update: { quantity: { increment: safeQuantity } },
        create: {
          id: offerId,
          tradeId,
          userId,
          cardId,
          variant,
          quantity: safeQuantity
        }
      });
      await this.resetConfirmations(tx, tradeId);
      await tx.adminLog.create({
        data: {
          action: "TRADE_ITEM_ADDED",
          target: tradeId,
          metadata: { userId, cardId, quantity: safeQuantity, variant }
        }
      });
    });
  }

  async addBooster(tradeId: string, userId: string, boosterType: "basic" | "rare" | "epic" | "legendary", quantity: number) {
    const safeQuantity = this.requirePositiveQuantity(quantity, "quantity");
    await prisma.$transaction(async (tx) => {
      const trade = await this.lockPendingTrade(tx, tradeId);
      this.assertTradeUser(trade, userId);
      const offerId = `${tradeId}:${userId}:booster:${boosterType}`;
      const [owned, offered] = await Promise.all([
        tx.userBooster.findUnique({
          where: { userId_boosterType: { userId, boosterType } }
        }),
        tx.tradeItem.findUnique({ where: { id: offerId } })
      ]);
      if (!owned || owned.quantity < (offered?.quantity ?? 0) + safeQuantity) {
        throw new AppError("Boosters insuffisants pour ce trade", 409);
      }
      await tx.tradeItem.upsert({
        where: { id: offerId },
        update: { quantity: { increment: safeQuantity } },
        create: {
          id: offerId,
          tradeId,
          userId,
          boosterType,
          quantity: safeQuantity
        }
      });
      await this.resetConfirmations(tx, tradeId);
    });
  }

  async addCredits(tradeId: string, userId: string, amount: number) {
    const safeAmount = Number.isFinite(amount) ? Math.floor(amount) : -1;
    if (safeAmount < 0 || safeAmount > MAX_TRADE_CREDITS) {
      throw new AppError(`amount must be between 0 and ${MAX_TRADE_CREDITS}`, 400);
    }
    await prisma.$transaction(async (tx) => {
      const trade = await this.lockPendingTrade(tx, tradeId);
      this.assertTradeUser(trade, userId);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.credits < safeAmount) {
        throw new AppError("Crédits insuffisants pour ce trade", 409);
      }
      await tx.trade.update({
        where: { id: tradeId },
        data: {
          ...(userId === trade.user1Id
            ? { user1Credits: safeAmount }
            : { user2Credits: safeAmount }),
          user1Confirm: false,
          user2Confirm: false,
          version: { increment: 1 }
        }
      });
    });
  }

  async removeItem(tradeId: string, userId: string, cardId: string, quantity: number, variant: "normal" | "shiny" | "holo" = "normal") {
    if (!cardId) {
      throw new AppError("cardId is required", 400);
    }
    const safeQuantity = this.requirePositiveQuantity(quantity, "quantity");

    await prisma.$transaction(async (tx) => {
      const trade = await this.lockPendingTrade(tx, tradeId);
      this.assertTradeUser(trade, userId);
      const item = await tx.tradeItem.findUnique({
        where: { id: `${tradeId}:${userId}:card:${cardId}:${variant}` }
      });
      if (!item) throw new AppError("Trade item not found", 404);
      if (item.quantity <= safeQuantity) {
        await tx.tradeItem.delete({ where: { id: item.id } });
      } else {
        await tx.tradeItem.update({
          where: { id: item.id },
          data: { quantity: { decrement: safeQuantity } }
        });
      }
      await this.resetConfirmations(tx, tradeId);
      await tx.adminLog.create({
        data: {
          action: "TRADE_ITEM_REMOVED",
          target: tradeId,
          metadata: { userId, cardId, quantity: safeQuantity, variant }
        }
      });
    });
  }

  async removeBooster(tradeId: string, userId: string, boosterType: "basic" | "rare" | "epic" | "legendary", quantity: number) {
    const safeQuantity = this.requirePositiveQuantity(quantity, "quantity");
    await prisma.$transaction(async (tx) => {
      const trade = await this.lockPendingTrade(tx, tradeId);
      this.assertTradeUser(trade, userId);
      const item = await tx.tradeItem.findUnique({
        where: { id: `${tradeId}:${userId}:booster:${boosterType}` }
      });
      if (!item) throw new AppError("Trade booster not found", 404);
      if (item.quantity <= safeQuantity) {
        await tx.tradeItem.delete({ where: { id: item.id } });
      } else {
        await tx.tradeItem.update({
          where: { id: item.id },
          data: { quantity: { decrement: safeQuantity } }
        });
      }
      await this.resetConfirmations(tx, tradeId);
    });
  }

  async removeCredits(tradeId: string, userId: string) {
    await prisma.$transaction(async (tx) => {
      const trade = await this.lockPendingTrade(tx, tradeId);
      this.assertTradeUser(trade, userId);
      await tx.trade.update({
        where: { id: tradeId },
        data: {
          ...(userId === trade.user1Id ? { user1Credits: 0 } : { user2Credits: 0 }),
          user1Confirm: false,
          user2Confirm: false,
          version: { increment: 1 }
        }
      });
    });
  }

  async confirmTrade(tradeId: string, userId: string) {
    const updated = await prisma.$transaction(async (tx) => {
      const trade = await this.lockPendingTrade(tx, tradeId, true);
      this.assertTradeUser(trade, userId);
      if (trade.status === "completed") return trade;
      const data =
        userId === trade.user1Id
          ? { user1Confirm: true, version: { increment: 1 } }
          : { user2Confirm: true, version: { increment: 1 } };
      await tx.trade.update({ where: { id: tradeId }, data });
      return tx.trade.findUniqueOrThrow({ where: { id: tradeId } });
    });

    if (updated.user1Confirm && updated.user2Confirm) {
      return this.executeTrade(tradeId);
    }

    await prisma.adminLog.create({
      data: {
        action: "TRADE_CONFIRMED",
        target: tradeId,
        metadata: { userId }
      }
    });

    return updated;
  }

  async cancelTrade(tradeId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const trade = await this.lockPendingTrade(tx, tradeId);
      this.assertTradeUser(trade, userId);
      const updatedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: { status: "cancelled", version: { increment: 1 } }
      });
      await tx.adminLog.create({
        data: {
          action: "TRADE_CANCELLED",
          target: tradeId,
          metadata: { userId }
        }
      });
      return updatedTrade;
    });
  }

  async expireTrades() {
    await prisma.trade.updateMany({
      where: { status: "pending", expiresAt: { lt: new Date() } },
      data: { status: "expired", version: { increment: 1 } }
    });
  }

  private async executeTrade(tradeId: string) {
    const executionKey = `trade:${tradeId}:execute:v1`;
    const executed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.trade.updateMany({
        where: {
          id: tradeId,
          status: "pending",
          user1Confirm: true,
          user2Confirm: true,
          expiresAt: { gt: new Date() }
        },
        data: { status: "confirmed", executionKey, version: { increment: 1 } }
      });
      if (claimed.count !== 1) return null;

      const trade = await tx.trade.findUniqueOrThrow({ where: { id: tradeId } });
      const items = await tx.tradeItem.findMany({ where: { tradeId } });

      for (const lockedUserId of [trade.user1Id, trade.user2Id].sort()) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${lockedUserId} FOR UPDATE`
        );
      }
      const user1 = await tx.user.findUniqueOrThrow({ where: { id: trade.user1Id } });
      const user2 = await tx.user.findUniqueOrThrow({ where: { id: trade.user2Id } });
      if (user1.credits < trade.user1Credits || user2.credits < trade.user2Credits) {
        throw new AppError("Crédits insuffisants lors de l'exécution du trade", 409);
      }

      for (const item of items) {
        if (item.cardId) {
          await assertCardCanLeaveCollection(tx, {
            userId: item.userId,
            cardId: item.cardId,
            variant: item.variant,
            quantity: item.quantity,
            confirmedLastCopy: true
          });
          const consumed = await tx.inventoryItem.updateMany({
            where: {
              userId: item.userId,
              cardId: item.cardId,
              variant: item.variant,
              quantity: { gte: item.quantity }
            },
            data: { quantity: { decrement: item.quantity }, version: { increment: 1 } }
          });
          if (consumed.count !== 1) {
            throw new AppError("Insufficient cards during trade execution", 409);
          }
        } else if (item.boosterType) {
          const consumed = await tx.userBooster.updateMany({
            where: {
              userId: item.userId,
              boosterType: item.boosterType,
              quantity: { gte: item.quantity }
            },
            data: { quantity: { decrement: item.quantity } }
          });
          if (consumed.count !== 1) {
            throw new AppError("Insufficient boosters during trade execution", 409);
          }
        } else {
          throw new AppError("Invalid trade item", 409);
        }
      }

      for (const item of items) {
        const targetUser = item.userId === trade.user1Id ? trade.user2Id : trade.user1Id;
        if (item.cardId) {
          await tx.inventoryItem.upsert({
            where: {
              userId_cardId_variant: {
                userId: targetUser,
                cardId: item.cardId,
                variant: item.variant
              }
            },
            update: { quantity: { increment: item.quantity }, version: { increment: 1 } },
            create: {
              userId: targetUser,
              cardId: item.cardId,
              variant: item.variant,
              quantity: item.quantity
            }
          });
        } else {
          await tx.userBooster.upsert({
            where: {
              userId_boosterType: { userId: targetUser, boosterType: item.boosterType! }
            },
            update: { quantity: { increment: item.quantity } },
            create: {
              userId: targetUser,
              boosterType: item.boosterType!,
              quantity: item.quantity
            }
          });
        }
      }

      const user1Delta = trade.user2Credits - trade.user1Credits;
      const user2Delta = trade.user1Credits - trade.user2Credits;
      await tx.user.update({
        where: { id: trade.user1Id },
        data: { credits: { increment: user1Delta }, balanceVersion: { increment: 1 } }
      });
      await tx.user.update({
        where: { id: trade.user2Id },
        data: { credits: { increment: user2Delta }, balanceVersion: { increment: 1 } }
      });

      for (const ledger of [
        { user: user1, delta: user1Delta, suffix: "user1" },
        { user: user2, delta: user2Delta, suffix: "user2" }
      ]) {
        if (ledger.delta === 0) continue;
        await tx.economicLedgerEntry.create({
          data: {
            userId: ledger.user.id,
            asset: "CREDITS",
            delta: ledger.delta,
            balanceBefore: ledger.user.credits,
            balanceAfter: ledger.user.credits + ledger.delta,
            reason: "trade.completed",
            referenceType: "Trade",
            referenceId: tradeId,
            operationKey: `${executionKey}:${ledger.suffix}`
          }
        });
      }

      await tx.trade.update({
        where: { id: tradeId },
        data: { status: "completed", completedAt: new Date(), version: { increment: 1 } }
      });
      await tx.adminLog.create({
        data: {
          action: "TRADE_COMPLETED",
          target: tradeId,
          metadata: {
            executionKey,
            itemCount: items.length,
            user1Credits: trade.user1Credits,
            user2Credits: trade.user2Credits
          }
        }
      });
      await tx.transactionLog.create({
        data: {
          userId: trade.user1Id,
          type: "trade",
          amount: user1Delta,
          metadata: { tradeId, executionKey }
        }
      });
      await tx.transactionLog.create({
        data: {
          userId: trade.user2Id,
          type: "trade",
          amount: user2Delta,
          metadata: { tradeId, executionKey }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${executionKey}:completed`,
          aggregateType: "Trade",
          aggregateId: tradeId,
          eventType: "trade.completed",
          eventVersion: 1,
          payload: {
            tradeId,
            user1Id: trade.user1Id,
            user2Id: trade.user2Id,
            itemCount: items.length
          }
        }
      });
      return { user1Id: trade.user1Id, user2Id: trade.user2Id };
    });

    if (!executed) {
      const existing = await prisma.trade.findUnique({
        where: { id: tradeId },
        include: { items: true }
      });
      if (existing?.status === "completed") return existing;
      throw new AppError("Trade could not be claimed for execution", 409);
    }

    await Promise.all([
      this.collectionService.grantCollectionRewards(executed.user1Id),
      this.collectionService.grantCollectionRewards(executed.user2Id)
    ]);
    return prisma.trade.findUnique({ where: { id: tradeId }, include: { items: true } });
  }

  private async lockPendingTrade(
    tx: Prisma.TransactionClient,
    tradeId: string,
    allowCompleted = false
  ) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Trade" WHERE "id" = ${tradeId} FOR UPDATE`);
    const trade = await tx.trade.findUnique({ where: { id: tradeId } });
    if (!trade) {
      throw new AppError("Trade not found", 404);
    }

    if (trade.status !== "pending") {
      if (allowCompleted && trade.status === "completed") return trade;
      throw new AppError("Trade is not pending", 409);
    }

    if (trade.expiresAt.getTime() <= Date.now()) {
      throw new AppError("Trade has expired", 409);
    }

    return trade;
  }

  private assertTradeUser(trade: { user1Id: string; user2Id: string }, userId: string) {
    if (trade.user1Id !== userId && trade.user2Id !== userId) {
      throw new AppError("Not allowed in this trade", 403);
    }
  }

  private async resetConfirmations(tx: Prisma.TransactionClient, tradeId: string) {
    await tx.trade.update({
      where: { id: tradeId },
      data: { user1Confirm: false, user2Confirm: false, version: { increment: 1 } }
    });
  }
}
