import { prisma } from "@rta/database";
import { BOOSTER_SLOTS } from "@rta/shared";
import { AppError } from "./errors.js";
import { InventoryService } from "./inventory.service.js";

const RARE_OR_BETTER = ["Rare", "Very Rare", "Import", "Exotic", "Black Market", "Limited"];

export class BoosterService {
  private inventoryService = new InventoryService();

  async addBoosters(userId: string, quantity: number) {
    return prisma.booster.upsert({
      where: { userId },
      update: { quantity: { increment: quantity } },
      create: { userId, quantity }
    });
  }

  async openBooster(userId: string) {
    const booster = await prisma.booster.findUnique({ where: { userId } });
    if (!booster || booster.quantity <= 0) {
      throw new AppError("No booster available", 409);
    }

    const cards = await this.drawBoosterCards();

    await prisma.$transaction(async (tx) => {
      await tx.booster.update({
        where: { userId },
        data: { quantity: { decrement: 1 } }
      });

      for (const card of cards) {
        await tx.inventoryItem.upsert({
          where: { userId_cardId: { userId, cardId: card.id } },
          update: { quantity: { increment: 1 } },
          create: { userId, cardId: card.id, quantity: 1 }
        });
      }
    });

    return cards;
  }

  private pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private async drawBoosterCards() {
    const [commons, uncommons, rarePlus] = await Promise.all([
      prisma.card.findMany({ where: { rarity: { name: "Common" } }, include: { rarity: true } }),
      prisma.card.findMany({ where: { rarity: { name: "Uncommon" } }, include: { rarity: true } }),
      prisma.card.findMany({ where: { rarity: { name: { in: RARE_OR_BETTER } } }, include: { rarity: true } })
    ]);

    if (commons.length < BOOSTER_SLOTS.common || uncommons.length < BOOSTER_SLOTS.uncommon || rarePlus.length < BOOSTER_SLOTS.rareOrBetter) {
      throw new AppError("Not enough cards to open booster", 500);
    }

    return [
      ...this.pickRandom(commons, BOOSTER_SLOTS.common),
      ...this.pickRandom(uncommons, BOOSTER_SLOTS.uncommon),
      ...this.pickRandom(rarePlus, BOOSTER_SLOTS.rareOrBetter)
    ];
  }
}
