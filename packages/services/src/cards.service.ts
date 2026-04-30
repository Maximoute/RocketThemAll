import { prisma, Prisma } from "@rta/database";

export class CardsService {
  getCards() {
    return prisma.card.findMany({ include: { deck: true, rarity: true } });
  }

  createCard(data: Prisma.CardUncheckedCreateInput) {
    return prisma.card.create({ data });
  }

  updateCard(id: string, data: Prisma.CardUncheckedUpdateInput) {
    return prisma.card.update({ where: { id }, data });
  }

  deleteCard(id: string) {
    return prisma.card.delete({ where: { id } });
  }

  listDecks() {
    return prisma.deck.findMany({ orderBy: { name: "asc" } });
  }

  createDeck(name: string) {
    return prisma.deck.create({ data: { name } });
  }

  deleteDeck(id: string) {
    return prisma.deck.delete({ where: { id } });
  }

  listRarities() {
    return prisma.rarity.findMany({ orderBy: { weight: "desc" } });
  }

  patchRarity(id: string, data: { name?: string; weight?: number }) {
    return prisma.rarity.update({ where: { id }, data });
  }

  async exportCardsJson() {
    const cards = await prisma.card.findMany({ include: { deck: true, rarity: true } });
    return cards.map((card) => ({
      name: card.name,
      deck: card.deck.name,
      rarity: card.rarity.name,
      imageUrl: card.imageUrl,
      description: card.description,
      xpReward: card.xpReward,
      dropRate: card.dropRate
    }));
  }

  async importCardsJson(payload: Array<{ name: string; deck: string; rarity: string; imageUrl?: string; description?: string; xpReward: number; dropRate: number }>) {
    for (const entry of payload) {
      const deck = await prisma.deck.findUnique({ where: { name: entry.deck } });
      const rarity = await prisma.rarity.findUnique({ where: { name: entry.rarity } });

      if (!deck || !rarity) {
        continue;
      }

      await prisma.card.upsert({
        where: { name: entry.name },
        update: {
          deckId: deck.id,
          rarityId: rarity.id,
          imageUrl: entry.imageUrl,
          description: entry.description,
          xpReward: entry.xpReward,
          dropRate: entry.dropRate
        },
        create: {
          name: entry.name,
          deckId: deck.id,
          rarityId: rarity.id,
          imageUrl: entry.imageUrl,
          description: entry.description,
          xpReward: entry.xpReward,
          dropRate: entry.dropRate
        }
      });
    }

    return { imported: payload.length };
  }
}
