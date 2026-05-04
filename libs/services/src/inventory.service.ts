import { prisma } from "@rta/database";
import { AppError } from "./errors.js";

export class InventoryService {
  async addCard(userId: string, cardId: string, quantity = 1, variant: "normal" | "shiny" | "holo" = "normal") {
    if (quantity <= 0) {
      throw new AppError("Quantity must be positive");
    }

    return prisma.inventoryItem.upsert({
      where: { userId_cardId_variant: { userId, cardId, variant } },
      update: { quantity: { increment: quantity } },
      create: { userId, cardId, variant, quantity }
    });
  }

  async removeCard(userId: string, cardId: string, quantity = 1, variant: "normal" | "shiny" | "holo" = "normal") {
    const item = await prisma.inventoryItem.findUnique({
      where: { userId_cardId_variant: { userId, cardId, variant } }
    });

    if (!item || item.quantity < quantity) {
      throw new AppError("Not enough cards in inventory", 409);
    }

    if (item.quantity === quantity) {
      await prisma.inventoryItem.delete({ where: { id: item.id } });
      return;
    }

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { quantity: { decrement: quantity } }
    });
  }

  async getInventory(userId: string, filters?: { deck?: string; rarity?: string; search?: string }) {
    return prisma.inventoryItem.findMany({
      where: {
        userId,
        card: {
          deck: filters?.deck ? { name: filters.deck } : undefined,
          rarity: filters?.rarity ? { name: filters.rarity } : undefined,
          name: filters?.search ? { contains: filters.search, mode: "insensitive" } : undefined
        }
      },
      include: {
        card: {
          include: {
            deck: true,
            rarity: true
          }
        }
      }
    });
  }
}
