import { prisma } from "@rta/database";

const canonicalCardWhere = {
  source: "vault",
  status: "PUBLISHED" as const,
  isActive: true
};

export class CardsService {
  getCards() {
    return prisma.card.findMany({
      where: canonicalCardWhere,
      include: { deck: true, rarity: true },
      orderBy: [{ deck: { name: "asc" } }, { name: "asc" }]
    });
  }

  async getCardsPage(page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      prisma.card.findMany({
        where: canonicalCardWhere,
        include: { deck: true, rarity: true },
        orderBy: [{ deck: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.card.count({ where: canonicalCardWhere })
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  }

  listDecks() {
    return prisma.deck.findMany({
      where: {
        status: "PUBLISHED",
        isActive: true,
        cards: { some: canonicalCardWhere }
      },
      orderBy: { name: "asc" }
    });
  }

  listRarities() {
    return prisma.rarity.findMany({ orderBy: { weight: "desc" } });
  }

  async exportCardsJson() {
    const cards = await this.getCards();
    return cards.map((card) => ({
      contentKey: card.contentKey,
      name: card.name,
      deck: card.deck.name,
      rarity: card.rarity.name,
      imageUrl: card.imageUrl,
      description: card.description,
      metadata: card.metadata,
      xpReward: card.xpReward,
      dropRate: card.dropRate
    }));
  }
}
