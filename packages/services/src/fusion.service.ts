import { prisma } from "@rta/database";
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

export class FusionService {
  async canFuse(userId: string, rarity: string) {
    const items = await prisma.inventoryItem.findMany({
      where: { userId, card: { rarity: { name: rarity } } },
      include: { card: { include: { rarity: true } } }
    });
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    return quantity >= 5 && NEXT_RARITY[rarity] !== null;
  }

  async fuse(userId: string, rarity: string) {
    const config = await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
    if (!config.fusionEnabled) {
      throw new AppError("La fusion est désactivée.", 403);
    }

    const nextRarity = NEXT_RARITY[rarity];
    if (!nextRarity) {
      throw new AppError("Cette rareté ne peut pas être fusionnée.", 409);
    }

    const items = await prisma.inventoryItem.findMany({
      where: { userId, card: { rarity: { name: rarity } } },
      include: { card: true },
      orderBy: { quantity: "desc" }
    });
    const total = items.reduce((sum, item) => sum + item.quantity, 0);
    if (total < 5) {
      throw new AppError("Il faut 5 cartes de cette rareté pour fusionner.", 409);
    }

    const rewardPool = await prisma.card.findMany({ where: { rarity: { name: nextRarity } }, include: { rarity: true, deck: true } });
    if (rewardPool.length === 0) {
      throw new AppError("Aucune carte disponible dans la rareté supérieure.", 500);
    }

    const reward = rewardPool[Math.floor(Math.random() * rewardPool.length)];

    await prisma.$transaction(async (tx) => {
      let remaining = 5;
      for (const item of items) {
        if (remaining <= 0) break;
        const remove = Math.min(remaining, item.quantity);
        remaining -= remove;
        if (item.quantity === remove) {
          await tx.inventoryItem.delete({ where: { id: item.id } });
        } else {
          await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: { decrement: remove } } });
        }
      }

      await tx.inventoryItem.upsert({
        where: { userId_cardId_variant: { userId, cardId: reward.id, variant: "normal" } },
        update: { quantity: { increment: 1 } },
        create: { userId, cardId: reward.id, variant: "normal", quantity: 1 }
      });

      await tx.transactionLog.create({ data: { userId, type: "fusion", amount: 1, metadata: { sourceRarity: rarity, rewardCardId: reward.id } } });
      await tx.economyLog.create({ data: { userId, type: "fusion", amount: 1, metadata: { sourceRarity: rarity, rewardCardId: reward.id } } });
    });

    return reward;
  }
}