import { prisma } from "@rta/database";

export class UsersService {
  listUsers() {
    return prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  }

  async getOrCreateDiscordUser(discordId: string, username: string, avatarUrl?: string) {
    return prisma.user.upsert({
      where: { discordId },
      update: { username, avatarUrl },
      create: {
        discordId,
        username,
        avatarUrl,
        level: 1,
        xp: 0,
        credits: 0,
        fragments: 0
      }
    });
  }

  getUserInventory(userId: string) {
    return prisma.inventoryItem.findMany({
      where: { userId },
      include: { card: { include: { deck: true, rarity: true } } }
    });
  }

  async patchInventory(userId: string, cardId: string, quantity: number, variant: "normal" | "shiny" | "holo" = "normal") {
    return prisma.inventoryItem.upsert({
      where: { userId_cardId_variant: { userId, cardId, variant } },
      update: { quantity },
      create: { userId, cardId, variant, quantity }
    });
  }
}
