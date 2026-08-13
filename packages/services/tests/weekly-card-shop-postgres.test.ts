import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@rta/database";
import { WeeklyCardShopService, weeklyCardShopWindow } from "../src/weekly-card-shop.service.js";

const enabled = process.env.CI === "true" && Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe.sequential : describe.skip;
const prefix = `weekly-shop-pg-${randomUUID()}`;
const now = new Date("2042-08-14T12:00:00.000Z");
const { weekKey } = weeklyCardShopWindow(now);
let userId = "";
let deckId = "";
const cardIds: string[] = [];
const rarityIds: string[] = [];

suite("weekly card shop PostgreSQL integration", () => {
  beforeAll(async () => {
    const rarities = await Promise.all(
      ["Common", "Rare", "Very Rare", "Import"].map((name, index) =>
        prisma.rarity.upsert({
          where: { name },
          update: {},
          create: { name, weight: index + 1 }
        })
      )
    );
    rarityIds.push(...rarities.map((rarity) => rarity.id));
    const deck = await prisma.deck.create({
      data: {
        name: `${prefix}-deck`,
        contentKey: `${prefix}-deck`,
        status: "PUBLISHED"
      }
    });
    deckId = deck.id;
    const counts = new Map([
      ["Common", 3],
      ["Rare", 3],
      ["Very Rare", 1],
      ["Import", 1]
    ]);
    for (const rarity of rarities) {
      for (let index = 0; index < (counts.get(rarity.name) ?? 0); index += 1) {
        const card = await prisma.card.create({
          data: {
            name: `${prefix}-${rarity.name}-${index}`,
            deckId,
            rarityId: rarity.id,
            contentKey: `${prefix}-${rarity.name}-${index}`,
            xpReward: 10,
            dropRate: 0.1,
            status: "PUBLISHED"
          }
        });
        cardIds.push(card.id);
      }
    }
    const user = await prisma.user.create({
      data: {
        discordId: `${prefix}-buyer`,
        username: "Weekly shop PostgreSQL buyer",
        credits: 500_000,
        inventory: {
          create: [
            { cardId: cardIds[0]!, variant: "normal", quantity: 50 },
            { cardId: cardIds[3]!, variant: "normal", quantity: 50 }
          ]
        }
      }
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!enabled) return;
    await prisma.economicLedgerEntry.deleteMany({ where: { userId } });
    await prisma.transactionLog.deleteMany({ where: { userId } });
    await prisma.economyLog.deleteMany({ where: { userId } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: userId } });
    await prisma.inventoryItem.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.weeklyCardOffer.deleteMany({ where: { weekKey } });
    await prisma.card.deleteMany({ where: { id: { in: cardIds } } });
    await prisma.deck.deleteMany({ where: { id: deckId } });
    await prisma.rarity.deleteMany({
      where: { id: { in: rarityIds }, cards: { none: {} } }
    });
    await prisma.$disconnect();
  });

  it("creates the low-circulation rotation and commits one purchase exactly once", async () => {
    const service = new WeeklyCardShopService();
    const shop = await service.getWeeklyShop(userId, now);
    expect(shop.offers).toHaveLength(6);
    expect(shop.offers.map((offer) => offer.rarityName)).toEqual([
      "Common",
      "Common",
      "Rare",
      "Rare",
      "Very Rare",
      "Import"
    ]);
    expect(shop.offers.map((offer) => offer.cardId)).not.toContain(cardIds[0]);
    expect(shop.offers.map((offer) => offer.cardId)).not.toContain(cardIds[3]);

    const offer = shop.offers[0]!;
    const operationKey = `${prefix}-purchase`;
    const purchase = await service.buyWeeklyCard(userId, offer.id, operationKey, now);
    const replay = await service.buyWeeklyCard(userId, offer.id, operationKey, now);
    expect(purchase.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    await expect(service.buyWeeklyCard(
      userId,
      offer.id,
      `${prefix}-second-purchase`,
      now
    )).rejects.toThrow("déjà acheté");

    const [user, inventory, ledger] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.inventoryItem.findUniqueOrThrow({
        where: {
          userId_cardId_variant: {
            userId,
            cardId: offer.cardId,
            variant: "normal"
          }
        }
      }),
      prisma.economicLedgerEntry.findMany({
        where: { userId, referenceType: "WeeklyCardOffer", referenceId: offer.id }
      })
    ]);
    expect(user.credits).toBe(500_000 - offer.price);
    expect(inventory.quantity).toBe(1);
    expect(ledger).toHaveLength(2);
  });
});
