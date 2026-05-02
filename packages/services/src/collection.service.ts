import { prisma } from "@rta/database";

export class CollectionService {
  async getDeckProgress(userId: string) {
    const decks = await prisma.deck.findMany({
      include: {
        cards: { select: { id: true } }
      }
    });

    const inventory = await prisma.inventoryItem.findMany({ where: { userId, quantity: { gt: 0 } }, include: { card: true } });
    const ownedIds = new Set(inventory.map((item) => item.cardId));

    return decks.map((deck) => {
      const total = deck.cards.length;
      const owned = deck.cards.filter((card) => ownedIds.has(card.id)).length;
      const completion = total === 0 ? 0 : Math.round((owned / total) * 100);
      return { deckId: deck.id, deckName: deck.name, owned, total, completion };
    });
  }

  async grantCollectionRewards(userId: string) {
    const progress = await this.getDeckProgress(userId);
    const granted: Array<{ deckName: string; milestone: number }> = [];

    await prisma.$transaction(async (tx) => {
      for (const deck of progress) {
        for (const milestone of [50, 100]) {
          if (deck.completion < milestone) continue;

          const existing = await tx.collectionRewardClaim.findFirst({ where: { userId, deckId: deck.deckId, milestone } });
          if (existing) continue;

          await tx.collectionRewardClaim.create({ data: { userId, deckId: deck.deckId, milestone } });
          if (milestone === 50) {
            await tx.userBooster.upsert({ where: { userId_boosterType: { userId, boosterType: "basic" } }, update: { quantity: { increment: 1 } }, create: { userId, boosterType: "basic", quantity: 1 } });
          } else {
            await tx.userBooster.upsert({ where: { userId_boosterType: { userId, boosterType: "epic" } }, update: { quantity: { increment: 1 } }, create: { userId, boosterType: "epic", quantity: 1 } });
          }
          await tx.transactionLog.create({ data: { userId, type: "collection", amount: milestone, metadata: { deckId: deck.deckId, milestone } } });
          await tx.economyLog.create({ data: { userId, type: "admin_update", amount: milestone, metadata: { action: "collection_reward", deckId: deck.deckId, milestone } } });
          granted.push({ deckName: deck.deckName, milestone });
        }
      }
    });

    return { progress, granted };
  }
}