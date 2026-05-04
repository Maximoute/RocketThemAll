import { prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { getEconomyConfig } from "./economy-config.js";

export type VariantName = "normal" | "shiny" | "holo";

const VARIANT_MULTIPLIER: Record<VariantName, number> = {
  normal: 1,
  shiny: 5,
  holo: 10
};

export class EconomyService {
  async getCardCirculationCount(cardId: string) {
    const agg = await prisma.inventoryItem.aggregate({
      where: { cardId },
      _sum: { quantity: true }
    });
    return agg._sum.quantity ?? 0;
  }

  async getDynamicSellPrice(cardId: string, variant: VariantName = "normal") {
    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { rarity: true, deck: true } });
    if (!card) throw new AppError("Card not found", 404);

    const config = await getEconomyConfig();
    const basePriceByRarity: Record<string, number> = {
      Common: config.commonSellPrice,
      Uncommon: config.uncommonSellPrice,
      Rare: config.rareSellPrice,
      "Very Rare": config.veryRareSellPrice,
      Import: config.importSellPrice,
      Exotic: config.exoticSellPrice,
      "Black Market": config.blackMarketSellPrice,
      Limited: config.exoticSellPrice
    };
    const basePrice = basePriceByRarity[card.rarity.name] ?? 10;
    const circulationCount = await this.getCardCirculationCount(cardId);
    const scarcityRaw = 100 / (circulationCount + 10);
    const scarcityMultiplier = Math.max(config.scarcityFloor, Math.min(config.scarcityCap, scarcityRaw));
    const rarityMultiplier = 1;
    const popularityMultiplier = 1;
    const variantMultiplier = VARIANT_MULTIPLIER[variant] ?? 1;

    const unitPrice = Math.floor(basePrice * rarityMultiplier * popularityMultiplier * scarcityMultiplier * variantMultiplier);

    return {
      unitPrice,
      basePrice,
      rarityName: card.rarity.name,
      deckName: card.deck.name,
      circulationCount,
      rarityMultiplier,
      scarcityMultiplier,
      popularityMultiplier,
      variantMultiplier,
      variant
    };
  }

  async getInventoryEstimatedValue(userId: string) {
    const items = await prisma.inventoryItem.findMany({ where: { userId }, include: { card: true } });
    let total = 0;

    for (const item of items) {
      const value = await this.getDynamicSellPrice(item.cardId, item.variant as VariantName);
      total += value.unitPrice * item.quantity;
    }

    return total;
  }

  async getTopValuableCards(userId: string, limit = 10) {
    const items = await prisma.inventoryItem.findMany({
      where: { userId, quantity: { gt: 0 } },
      include: { card: { include: { rarity: true, deck: true } } }
    });

    const rows: Array<{ cardId: string; cardName: string; variant: string; quantity: number; unitPrice: number; totalValue: number }> = [];
    for (const item of items) {
      const value = await this.getDynamicSellPrice(item.cardId, item.variant as VariantName);
      rows.push({
        cardId: item.cardId,
        cardName: item.card.name,
        variant: item.variant,
        quantity: item.quantity,
        unitPrice: value.unitPrice,
        totalValue: value.unitPrice * item.quantity
      });
    }

    return rows.sort((a, b) => b.totalValue - a.totalValue).slice(0, Math.max(1, limit));
  }
}
