import { prisma } from "@rta/database";
import { AppError } from "./errors.js";

const TRADE_EXPIRATION_MS = 10 * 60 * 1000;

export class TradeService {
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

  async addItem(tradeId: string, userId: string, cardId: string, quantity: number) {
    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);

    const item = await prisma.inventoryItem.findUnique({
      where: { userId_cardId: { userId, cardId } }
    });
    if (!item || item.quantity < quantity) {
      throw new AppError("Insufficient cards for trade", 409);
    }

    await prisma.tradeItem.upsert({
      where: {
        id: `${tradeId}:${userId}:${cardId}`
      },
      update: {
        quantity: { increment: quantity }
      },
      create: {
        id: `${tradeId}:${userId}:${cardId}`,
        tradeId,
        userId,
        cardId,
        quantity
      }
    });

    await this.resetConfirmations(tradeId);
    await prisma.adminLog.create({
      data: {
        action: "TRADE_ITEM_ADDED",
        target: tradeId,
        metadata: { userId, cardId, quantity }
      }
    });
  }

  async removeItem(tradeId: string, userId: string, cardId: string, quantity: number) {
    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);

    const item = await prisma.tradeItem.findUnique({
      where: { id: `${tradeId}:${userId}:${cardId}` }
    });

    if (!item) {
      throw new AppError("Trade item not found", 404);
    }

    if (item.quantity <= quantity) {
      await prisma.tradeItem.delete({ where: { id: item.id } });
    } else {
      await prisma.tradeItem.update({
        where: { id: item.id },
        data: { quantity: { decrement: quantity } }
      });
    }

    await this.resetConfirmations(tradeId);
    await prisma.adminLog.create({
      data: {
        action: "TRADE_ITEM_REMOVED",
        target: tradeId,
        metadata: { userId, cardId, quantity }
      }
    });
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

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const inv = await tx.inventoryItem.findUnique({
          where: { userId_cardId: { userId: item.userId, cardId: item.cardId } }
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
      }

      const trade = await tx.trade.findUniqueOrThrow({ where: { id: tradeId } });
      for (const item of items) {
        const targetUser = item.userId === trade.user1Id ? trade.user2Id : trade.user1Id;
        await tx.inventoryItem.upsert({
          where: { userId_cardId: { userId: targetUser, cardId: item.cardId } },
          update: { quantity: { increment: item.quantity } },
          create: { userId: targetUser, cardId: item.cardId, quantity: item.quantity }
        });
      }

      await tx.trade.update({ where: { id: tradeId }, data: { status: "completed" } });
      await tx.adminLog.create({
        data: {
          action: "TRADE_COMPLETED",
          target: tradeId,
          metadata: { itemCount: items.length }
        }
      });
    });

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
