import { prisma } from "@rta/database";
import { CollectionService } from "./collection.service.js";
import { AppError } from "./errors.js";
import { LogsService, type GuildActivityLogInput } from "./logs.service.js";

const TRADE_EXPIRATION_MS = 10 * 60 * 1000;

export class TradeService {
  private readonly collectionService = new CollectionService();
  private readonly logsService = new LogsService();

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

  async startTrade(
    user1Id: string,
    user2Id: string,
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
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

    await this.logsService.logGuildEvent({
      ...context,
      userId: user1Id,
      category: "trade",
      action: "trade_started",
      status: "pending",
      summary: `${context?.username ?? user1Id} a lancé un trade avec ${user2Id}`,
      details: { tradeId: trade.id, user1Id, user2Id, expiresAt: trade.expiresAt.toISOString() }
    });

    return trade;
  }

  async addItem(
    tradeId: string,
    userId: string,
    cardId: string,
    quantity: number,
    variant: "normal" | "shiny" | "holo" = "normal",
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
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
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    await prisma.adminLog.create({
      data: {
        action: "TRADE_ITEM_ADDED",
        target: tradeId,
        metadata: { userId, cardId, quantity: safeQuantity, variant }
      }
    });
    await this.logsService.logGuildEvent({
      ...context,
      userId,
      category: "trade",
      action: "trade_item_added",
      status: "pending",
      summary: `${context?.username ?? userId} ajoute ${safeQuantity}x ${card?.name ?? cardId} au trade`,
      details: { tradeId, cardId, cardName: card?.name ?? null, quantity: safeQuantity, variant }
    });
  }

  async addBooster(
    tradeId: string,
    userId: string,
    boosterType: "basic" | "rare" | "epic" | "legendary",
    quantity: number,
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
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
    await this.logsService.logGuildEvent({
      ...context,
      userId,
      category: "trade",
      action: "trade_booster_added",
      status: "pending",
      summary: `${context?.username ?? userId} ajoute ${safeQuantity} booster(s) ${boosterType} au trade`,
      details: { tradeId, boosterType, quantity: safeQuantity }
    });
  }

  async addCredits(
    tradeId: string,
    userId: string,
    amount: number,
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
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
    await this.logsService.logGuildEvent({
      ...context,
      userId,
      category: "trade",
      action: "trade_credits_set",
      status: "pending",
      summary: `${context?.username ?? userId} met ${safeAmount} crédits dans le trade`,
      details: { tradeId, amount: safeAmount }
    });
  }

  async removeItem(
    tradeId: string,
    userId: string,
    cardId: string,
    quantity: number,
    variant: "normal" | "shiny" | "holo" = "normal",
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
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
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    await prisma.adminLog.create({
      data: {
        action: "TRADE_ITEM_REMOVED",
        target: tradeId,
        metadata: { userId, cardId, quantity: safeQuantity, variant }
      }
    });
    await this.logsService.logGuildEvent({
      ...context,
      userId,
      category: "trade",
      action: "trade_item_removed",
      status: "pending",
      summary: `${context?.username ?? userId} retire ${safeQuantity}x ${card?.name ?? cardId} du trade`,
      details: { tradeId, cardId, cardName: card?.name ?? null, quantity: safeQuantity, variant }
    });
  }

  async removeBooster(
    tradeId: string,
    userId: string,
    boosterType: "basic" | "rare" | "epic" | "legendary",
    quantity: number,
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
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
    await this.logsService.logGuildEvent({
      ...context,
      userId,
      category: "trade",
      action: "trade_booster_removed",
      status: "pending",
      summary: `${context?.username ?? userId} retire ${safeQuantity} booster(s) ${boosterType} du trade`,
      details: { tradeId, boosterType, quantity: safeQuantity }
    });
  }

  async removeCredits(
    tradeId: string,
    userId: string,
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);
    await prisma.trade.update({
      where: { id: tradeId },
      data: userId === trade.user1Id ? { user1Credits: 0 } : { user2Credits: 0 }
    });
    await this.resetConfirmations(tradeId);
    await this.logsService.logGuildEvent({
      ...context,
      userId,
      category: "trade",
      action: "trade_credits_removed",
      status: "pending",
      summary: `${context?.username ?? userId} retire ses crédits du trade`,
      details: { tradeId }
    });
  }

  async confirmTrade(
    tradeId: string,
    userId: string,
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
    const trade = await this.getPendingTrade(tradeId);
    this.assertTradeUser(trade, userId);

    const data = userId === trade.user1Id ? { user1Confirm: true } : { user2Confirm: true };
    const updated = await prisma.trade.update({ where: { id: tradeId }, data });

    if (updated.user1Confirm && updated.user2Confirm) {
      return this.executeTrade(tradeId, context);
    }

    await prisma.adminLog.create({
      data: {
        action: "TRADE_CONFIRMED",
        target: tradeId,
        metadata: { userId }
      }
    });
    await this.logsService.logGuildEvent({
      ...context,
      userId,
      category: "trade",
      action: "trade_confirmed",
      status: "pending",
      summary: `${context?.username ?? userId} confirme le trade`,
      details: { tradeId }
    });

    return updated;
  }

  async cancelTrade(
    tradeId: string,
    userId: string,
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
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
    await this.logsService.logGuildEvent({
      ...context,
      userId,
      category: "trade",
      action: "trade_cancelled",
      status: "cancelled",
      summary: `${context?.username ?? userId} annule le trade`,
      details: { tradeId }
    });

    return updatedTrade;
  }

  async expireTrades() {
    await prisma.trade.updateMany({
      where: { status: "pending", expiresAt: { lt: new Date() } },
      data: { status: "expired" }
    });
  }

  private async executeTrade(
    tradeId: string,
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
    const [items, tradePreview] = await Promise.all([
      prisma.tradeItem.findMany({ where: { tradeId }, include: { card: true } }),
      prisma.trade.findUnique({ where: { id: tradeId }, include: { user1: true, user2: true } })
    ]);

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

      await this.logsService.logGuildEvent({
        ...context,
        userId: tradePreview?.user1Id,
        category: "trade",
        action: "trade_completed",
        status: "completed",
        summary: `${tradePreview?.user1.username ?? tradePreview?.user1Id ?? "?"} et ${tradePreview?.user2.username ?? tradePreview?.user2Id ?? "?"} ont complété un trade`,
        details: {
          tradeId,
          user1Id: tradePreview?.user1Id,
          user1Name: tradePreview?.user1.username,
          user2Id: tradePreview?.user2Id,
          user2Name: tradePreview?.user2.username,
          user1Credits: tradePreview?.user1Credits,
          user2Credits: tradePreview?.user2Credits,
          items: items.map((item) => ({
            userId: item.userId,
            cardId: item.cardId,
            cardName: item.card?.name ?? null,
            boosterType: item.boosterType,
            quantity: item.quantity,
            variant: item.variant
          }))
        }
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
