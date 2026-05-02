import { prisma } from "@rta/database";
import { CollectionService } from "./collection.service.js";
import { AppError } from "./errors.js";

const TRADE_EXPIRATION_MS = 10 * 60 * 1000;

export class TradeService {
  private readonly collectionService = new CollectionService();

  private requirePositiveQuantity(quantity: number, fieldName: string) {
    const safeValue = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
    if (safeValue <= 0) {
      throw new AppError(`${fieldName} must be a positive integer`, 400);
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

    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);

    const item = await prisma.inventoryItem.findUnique({
      where: { userId_cardId_variant: { userId, cardId, variant } }
    });
    if (!item || item.quantity < safeQuantity) {
      throw new AppError("Insufficient cards for trade", 409);
    }

    await prisma.tradeItem.upsert({
      where: {
        id: `${tradeId}:${userId}:card:${cardId}:${variant}`
      },
      update: {
        quantity: { increment: safeQuantity }
      },
      create: {
        id: `${tradeId}:${userId}:card:${cardId}:${variant}`,
        tradeId,
        userId,
        cardId,
        variant,
        quantity: safeQuantity
      }
    });

    await this.resetConfirmations(tradeId);
    await prisma.adminLog.create({
      data: {
        action: "TRADE_ITEM_ADDED",
        target: tradeId,
        metadata: { userId, cardId, quantity: safeQuantity, variant }
      }
    });
  }

  async addBooster(tradeId: string, userId: string, boosterType: "basic" | "rare" | "epic" | "legendary", quantity: number) {
    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);

    const safeQuantity = Math.max(1, Math.floor(quantity));
    const owned = await prisma.userBooster.findUnique({ where: { userId_boosterType: { userId, boosterType } } });
    if (!owned || owned.quantity < safeQuantity) {
      throw new AppError("Boosters insuffisants pour ce trade", 409);
    }

    await prisma.tradeItem.upsert({
      where: { id: `${tradeId}:${userId}:booster:${boosterType}` },
      update: { quantity: { increment: safeQuantity } },
      create: {
        id: `${tradeId}:${userId}:booster:${boosterType}`,
        tradeId,
        userId,
        boosterType,
        quantity: safeQuantity
      }
    });

    await this.resetConfirmations(tradeId);
  }

  async addCredits(tradeId: string, userId: string, amount: number) {
    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);
    const safeAmount = Math.max(0, Math.floor(amount));
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.credits < safeAmount) {
      throw new AppError("Crédits insuffisants pour ce trade", 409);
    }

    await prisma.trade.update({
      where: { id: tradeId },
      data: userId === trade.user1Id ? { user1Credits: safeAmount } : { user2Credits: safeAmount }
    });
    await this.resetConfirmations(tradeId);
  }

  async removeItem(tradeId: string, userId: string, cardId: string, quantity: number, variant: "normal" | "shiny" | "holo" = "normal") {
    if (!cardId) {
      throw new AppError("cardId is required", 400);
    }
    const safeQuantity = this.requirePositiveQuantity(quantity, "quantity");

    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);

    const item = await prisma.tradeItem.findUnique({
      where: { id: `${tradeId}:${userId}:card:${cardId}:${variant}` }
    });

    if (!item) {
      throw new AppError("Trade item not found", 404);
    }

    if (item.quantity <= safeQuantity) {
      await prisma.tradeItem.delete({ where: { id: item.id } });
    } else {
      await prisma.tradeItem.update({
        where: { id: item.id },
        data: { quantity: { decrement: safeQuantity } }
      });
    }

    await this.resetConfirmations(tradeId);
    await prisma.adminLog.create({
      data: {
        action: "TRADE_ITEM_REMOVED",
        target: tradeId,
        metadata: { userId, cardId, quantity: safeQuantity, variant }
      }
    });
  }

  async removeBooster(tradeId: string, userId: string, boosterType: "basic" | "rare" | "epic" | "legendary", quantity: number) {
    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);

    const item = await prisma.tradeItem.findUnique({ where: { id: `${tradeId}:${userId}:booster:${boosterType}` } });
    if (!item) {
      throw new AppError("Trade booster not found", 404);
    }

    const safeQuantity = Math.max(1, Math.floor(quantity));
    if (item.quantity <= safeQuantity) {
      await prisma.tradeItem.delete({ where: { id: item.id } });
    } else {
      await prisma.tradeItem.update({ where: { id: item.id }, data: { quantity: { decrement: safeQuantity } } });
    }

    await this.resetConfirmations(tradeId);
  }

  async removeCredits(tradeId: string, userId: string) {
    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);
    await prisma.trade.update({
      where: { id: tradeId },
      data: userId === trade.user1Id ? { user1Credits: 0 } : { user2Credits: 0 }
    });
    await this.resetConfirmations(tradeId);
  }

  async confirmTrade(tradeId: string, userId: string) {
    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);

    const data = userId === trade.user1Id ? { user1Confirm: true } : { user2Confirm: true };
    const updated = await prisma.trade.update({ where: { id: tradeId }, data });

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
    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);

    const updatedTrade = await prisma.trade.update({
      where: { id: tradeId },
      data: { status: "cancelled" }
    });

    await prisma.adminLog.create({
      data: {
        action: "TRADE_CANCELLED",
        target: tradeId,
        metadata: { userId }
      }
    });

    return updatedTrade;
  }

  async expireTrades() {
    await prisma.trade.updateMany({
      where: { status: "pending", expiresAt: { lt: new Date() } },
      data: { status: "expired" }
    });
  }

  private async executeTrade(tradeId: string) {
    const items = await prisma.tradeItem.findMany({ where: { tradeId } });

    try {
      await prisma.$transaction(async (tx) => {
        const trade = await tx.trade.findUniqueOrThrow({ where: { id: tradeId } });
        const user1 = await tx.user.findUniqueOrThrow({ where: { id: trade.user1Id } });
        const user2 = await tx.user.findUniqueOrThrow({ where: { id: trade.user2Id } });

        if (user1.credits < trade.user1Credits || user2.credits < trade.user2Credits) {
          throw new AppError("Crédits insuffisants lors de l'exécution du trade", 409);
        }

        for (const item of items) {
          if (item.cardId) {
            const inv = await tx.inventoryItem.findUnique({
              where: { userId_cardId_variant: { userId: item.userId, cardId: item.cardId, variant: item.variant } }
            });

            if (!inv || inv.quantity < item.quantity) {
              throw new AppError("Insufficient cards during trade execution", 409);
            }

            if (inv.quantity === item.quantity) {
              await tx.inventoryItem.delete({ where: { id: inv.id } });
            } else {
              await tx.inventoryItem.update({
                where: { id: inv.id },
                data: { quantity: { decrement: item.quantity } }
              });
            }
          } else {
            const ownedBooster = await tx.userBooster.findUnique({ where: { userId_boosterType: { userId: item.userId, boosterType: item.boosterType! } } });
            if (!ownedBooster || ownedBooster.quantity < item.quantity) {
              throw new AppError("Insufficient boosters during trade execution", 409);
            }
            await tx.userBooster.update({ where: { userId_boosterType: { userId: item.userId, boosterType: item.boosterType! } }, data: { quantity: { decrement: item.quantity } } });
          }
        }

        for (const item of items) {
          const targetUser = item.userId === trade.user1Id ? trade.user2Id : trade.user1Id;
          if (item.cardId) {
            await tx.inventoryItem.upsert({
              where: { userId_cardId_variant: { userId: targetUser, cardId: item.cardId, variant: item.variant } },
              update: { quantity: { increment: item.quantity } },
              create: { userId: targetUser, cardId: item.cardId, variant: item.variant, quantity: item.quantity }
            });
          } else {
            await tx.userBooster.upsert({
              where: { userId_boosterType: { userId: targetUser, boosterType: item.boosterType! } },
              update: { quantity: { increment: item.quantity } },
              create: { userId: targetUser, boosterType: item.boosterType!, quantity: item.quantity }
            });
          }
        }

        if (trade.user1Credits > 0 || trade.user2Credits > 0) {
          await tx.user.update({ where: { id: trade.user1Id }, data: { credits: { decrement: trade.user1Credits, increment: trade.user2Credits } } });
          await tx.user.update({ where: { id: trade.user2Id }, data: { credits: { decrement: trade.user2Credits, increment: trade.user1Credits } } });
        }

        await tx.trade.update({ where: { id: tradeId }, data: { status: "completed" } });
        await tx.adminLog.create({
          data: {
            action: "TRADE_COMPLETED",
            target: tradeId,
            metadata: { itemCount: items.length, user1Credits: trade.user1Credits, user2Credits: trade.user2Credits }
          }
        });
        await tx.transactionLog.create({ data: { userId: trade.user1Id, type: "trade", amount: trade.user2Credits - trade.user1Credits, metadata: { tradeId } } });
        await tx.transactionLog.create({ data: { userId: trade.user2Id, type: "trade", amount: trade.user1Credits - trade.user2Credits, metadata: { tradeId } } });
        await tx.economyLog.create({ data: { userId: trade.user1Id, type: "trade", amount: trade.user2Credits - trade.user1Credits, metadata: { tradeId } } });
        await tx.economyLog.create({ data: { userId: trade.user2Id, type: "trade", amount: trade.user1Credits - trade.user2Credits, metadata: { tradeId } } });
      });
    } catch (error) {
      console.error("[trade] executeTrade failed", {
        tradeId,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    await this.collectionService.grantCollectionRewards((await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } })).user1Id);
    await this.collectionService.grantCollectionRewards((await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } })).user2Id);

    return prisma.trade.findUnique({ where: { id: tradeId }, include: { items: true } });
  }

  private async getPendingTrade(tradeId: string) {
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) {
      throw new AppError("Trade not found", 404);
    }

    if (trade.status !== "pending") {
      throw new AppError("Trade is not pending", 409);
    }

    if (trade.expiresAt.getTime() < Date.now()) {
      await prisma.trade.update({ where: { id: tradeId }, data: { status: "expired" } });
      throw new AppError("Trade has expired", 409);
    }

    return trade;
  }

  private assertTradeUser(trade: { user1Id: string; user2Id: string }, userId: string) {
    if (trade.user1Id !== userId && trade.user2Id !== userId) {
      throw new AppError("Not allowed in this trade", 403);
    }
  }

  private async resetConfirmations(tradeId: string) {
    await prisma.trade.update({
      where: { id: tradeId },
      data: { user1Confirm: false, user2Confirm: false }
    });
  }
}
