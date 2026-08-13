import { createHash } from "node:crypto";
import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";

const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/;

export const WEEKLY_CARD_SHOP_TIME_ZONE = "Europe/Paris";

export const WEEKLY_CARD_SHOP_SLOTS = [
  { rarityName: "Common", price: 15_000 },
  { rarityName: "Common", price: 15_000 },
  { rarityName: "Rare", price: 35_000 },
  { rarityName: "Rare", price: 35_000 },
  { rarityName: "Very Rare", price: 75_000 },
  { rarityName: "Import", price: 150_000 }
] as const;

type WeeklyCandidate = {
  id: string;
  circulation: number;
};

function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second"))
  };
}

function localMidnightToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string
) {
  const localEpoch = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = new Date(localEpoch);
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = zonedDateParts(candidate, timeZone);
    const representedLocalEpoch = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    candidate = new Date(candidate.getTime() + localEpoch - representedLocalEpoch);
  }
  return candidate;
}

export function weeklyCardShopWindow(
  now = new Date(),
  timeZone = WEEKLY_CARD_SHOP_TIME_ZONE
) {
  const localNow = zonedDateParts(now, timeZone);
  const localDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  const monday = new Date(localDate.getTime() - daysSinceMonday * 24 * 60 * 60_000);
  const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60_000);
  const weekKey = [
    monday.getUTCFullYear(),
    String(monday.getUTCMonth() + 1).padStart(2, "0"),
    String(monday.getUTCDate()).padStart(2, "0")
  ].join("-");
  return {
    weekKey,
    startsAt: localMidnightToUtc(
      monday.getUTCFullYear(),
      monday.getUTCMonth() + 1,
      monday.getUTCDate(),
      timeZone
    ),
    endsAt: localMidnightToUtc(
      nextMonday.getUTCFullYear(),
      nextMonday.getUTCMonth() + 1,
      nextMonday.getUTCDate(),
      timeZone
    ),
    timeZone
  };
}

function weeklyTieBreak(weekKey: string, cardId: string) {
  return createHash("sha256").update(`${weekKey}:${cardId}`).digest("hex");
}

export function rankWeeklyCardCandidates(
  weekKey: string,
  candidates: WeeklyCandidate[]
) {
  return [...candidates].sort((left, right) =>
    left.circulation - right.circulation ||
    weeklyTieBreak(weekKey, left.id).localeCompare(weeklyTieBreak(weekKey, right.id)) ||
    left.id.localeCompare(right.id)
  );
}

export class WeeklyCardShopService {
  private async ensureWeeklyOffers(now = new Date()) {
    const window = weeklyCardShopWindow(now);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"weekly-card-shop:" + window.weekKey}, 0))`
      );
      const existing = await tx.weeklyCardOffer.findMany({
        where: { weekKey: window.weekKey },
        select: { slot: true, cardId: true }
      });
      if (existing.length >= WEEKLY_CARD_SHOP_SLOTS.length) return;

      const occupiedSlots = new Set(existing.map((offer) => offer.slot));
      const selectedCardIds = new Set(existing.map((offer) => offer.cardId));
      const rarities = [...new Set(WEEKLY_CARD_SHOP_SLOTS.map((slot) => slot.rarityName))];
      const cards = await tx.card.findMany({
        where: {
          status: "PUBLISHED",
          isActive: true,
          rarity: { name: { in: rarities } }
        },
        select: {
          id: true,
          rarity: { select: { name: true } }
        }
      });
      const circulationRows = await tx.inventoryItem.groupBy({
        by: ["cardId"],
        where: { cardId: { in: cards.map((card) => card.id) } },
        _sum: { quantity: true }
      });
      const circulationByCard = new Map(
        circulationRows.map((row) => [row.cardId, row._sum.quantity ?? 0])
      );

      for (const rarityName of rarities) {
        const missingSlots = WEEKLY_CARD_SHOP_SLOTS
          .map((slot, index) => ({ ...slot, index }))
          .filter((slot) => slot.rarityName === rarityName && !occupiedSlots.has(slot.index));
        if (missingSlots.length === 0) continue;
        const candidates = rankWeeklyCardCandidates(
          window.weekKey,
          cards
            .filter((card) => card.rarity.name === rarityName && !selectedCardIds.has(card.id))
            .map((card) => ({
              id: card.id,
              circulation: circulationByCard.get(card.id) ?? 0
            }))
        );
        if (candidates.length < missingSlots.length) {
          throw new AppError(
            `Catalogue insuffisant pour la rotation ${rarityName}.`,
            503
          );
        }
        for (let index = 0; index < missingSlots.length; index += 1) {
          const slot = missingSlots[index]!;
          const candidate = candidates[index]!;
          await tx.weeklyCardOffer.create({
            data: {
              weekKey: window.weekKey,
              slot: slot.index,
              cardId: candidate.id,
              rarityName,
              price: slot.price,
              circulationSnapshot: candidate.circulation,
              startsAt: window.startsAt,
              endsAt: window.endsAt
            }
          });
          selectedCardIds.add(candidate.id);
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return window;
  }

  async getWeeklyShop(userId: string, now = new Date()) {
    const window = await this.ensureWeeklyOffers(now);
    const [user, offers] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true }
      }),
      prisma.weeklyCardOffer.findMany({
        where: { weekKey: window.weekKey },
        include: {
          card: { include: { deck: true, rarity: true } },
          purchases: {
            where: { userId },
            select: { id: true, createdAt: true }
          }
        },
        orderBy: { slot: "asc" }
      })
    ]);
    if (!user) throw new AppError("Utilisateur introuvable", 404);
    return {
      ...window,
      credits: user.credits,
      offers: offers.map((offer) => ({
        ...offer,
        purchased: offer.purchases.length > 0
      }))
    };
  }

  async buyWeeklyCard(
    userId: string,
    offerId: string,
    idempotencyKey: string,
    now = new Date()
  ) {
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppError("Une clé d'idempotence valide est requise", 400);
    }
    const window = weeklyCardShopWindow(now);
    const operationKey = `weekly-card-shop:${userId}:${idempotencyKey}`;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"economy:" + userId}, 0))`
      );
      const replay = await tx.weeklyCardPurchase.findUnique({
        where: { operationKey },
        include: { offer: { include: { card: { include: { deck: true, rarity: true } } } } }
      });
      if (replay) {
        if (replay.offerId !== offerId) {
          throw new AppError("Cette opération a déjà servi pour une autre carte.", 409);
        }
        return {
          offer: replay.offer,
          price: replay.priceSnapshot,
          replayed: true
        };
      }

      const offer = await tx.weeklyCardOffer.findUnique({
        where: { id: offerId },
        include: { card: { include: { deck: true, rarity: true } } }
      });
      if (
        !offer ||
        offer.weekKey !== window.weekKey ||
        offer.startsAt > now ||
        offer.endsAt <= now
      ) {
        throw new AppError("Cette offre hebdomadaire a expiré.", 409);
      }
      const alreadyPurchased = await tx.weeklyCardPurchase.findUnique({
        where: { userId_offerId: { userId, offerId } }
      });
      if (alreadyPurchased) {
        throw new AppError("Tu as déjà acheté cette carte cette semaine.", 409);
      }

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("Utilisateur introuvable", 404);
      if (user.credits < offer.price) {
        throw new AppError("Crédits insuffisants pour cette carte.", 409);
      }
      const stock = await tx.inventoryItem.findUnique({
        where: {
          userId_cardId_variant: { userId, cardId: offer.cardId, variant: "normal" }
        }
      });

      await tx.weeklyCardPurchase.create({
        data: {
          userId,
          offerId,
          priceSnapshot: offer.price,
          operationKey
        }
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: { decrement: offer.price },
          balanceVersion: { increment: 1 }
        }
      });
      await tx.inventoryItem.upsert({
        where: {
          userId_cardId_variant: { userId, cardId: offer.cardId, variant: "normal" }
        },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: { userId, cardId: offer.cardId, variant: "normal", quantity: 1 }
      });

      const metadata = {
        weekKey: offer.weekKey,
        offerId: offer.id,
        cardId: offer.cardId,
        cardName: offer.card.name,
        rarity: offer.rarityName,
        price: offer.price
      };
      await tx.economicLedgerEntry.createMany({
        data: [
          {
            userId,
            asset: "CREDITS",
            delta: -offer.price,
            balanceBefore: user.credits,
            balanceAfter: user.credits - offer.price,
            reason: "weekly_card_shop.purchased",
            referenceType: "WeeklyCardOffer",
            referenceId: offer.id,
            operationKey: `${operationKey}:credits`,
            metadata
          },
          {
            userId,
            asset: "CARD",
            assetKey: `${offer.cardId}:normal`,
            delta: 1,
            balanceBefore: stock?.quantity ?? 0,
            balanceAfter: (stock?.quantity ?? 0) + 1,
            reason: "weekly_card_shop.purchased",
            referenceType: "WeeklyCardOffer",
            referenceId: offer.id,
            operationKey: `${operationKey}:card`,
            metadata
          }
        ]
      });
      await tx.transactionLog.create({
        data: {
          userId,
          type: "weekly_card_shop",
          amount: -offer.price,
          metadata: { ...metadata, operationKey }
        }
      });
      await tx.economyLog.create({
        data: {
          userId,
          type: "buy_weekly_card",
          amount: offer.price,
          metadata: { ...metadata, operationKey }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "weekly_card_shop.purchased",
          eventVersion: 1,
          payload: { userId, ...metadata }
        }
      });

      return { offer, price: offer.price, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
