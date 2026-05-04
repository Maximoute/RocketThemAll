import { prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { EconomyService, type VariantName } from "./economy.service.js";

export class SellService {
  private readonly economyService = new EconomyService();

  async getCardSellPrice(cardId: string, variant: VariantName = "normal") {
    return this.economyService.getDynamicSellPrice(cardId, variant);
  }

  async sellCard(userId: string, cardId: string, quantity: number, variant: VariantName = "normal") {
    const safeQuantity = Math.max(1, Math.floor(quantity));
    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { rarity: true } });
    if (!card) {
      throw new AppError("Card not found", 404);
    }

    const inventory = await prisma.inventoryItem.findUnique({ where: { userId_cardId_variant: { userId, cardId, variant } } });
    if (!inventory || inventory.quantity < safeQuantity) {
      throw new AppError("Not enough cards in inventory", 409);
    }

    const dynamic = await this.economyService.getDynamicSellPrice(cardId, variant);
    const unitPrice = dynamic.unitPrice;
    const credits = unitPrice * safeQuantity;

    await prisma.$transaction(async (tx) => {
      if (inventory.quantity === safeQuantity) {
        await tx.inventoryItem.delete({ where: { id: inventory.id } });
      } else {
        await tx.inventoryItem.update({ where: { id: inventory.id }, data: { quantity: { decrement: safeQuantity } } });
      }

      await tx.user.update({ where: { id: userId }, data: { credits: { increment: credits } } });
      await tx.transactionLog.create({ data: { userId, type: "sell", amount: credits, metadata: { cardId, quantity: safeQuantity, variant, unitPrice } } });
      await tx.economyLog.create({ data: { userId, type: "sell", amount: credits, metadata: { cardId, quantity: safeQuantity, variant, unitPrice, circulationCount: dynamic.circulationCount } } });
    });

    return { credits, quantity: safeQuantity, card, unitPrice, variant };
  }
}