import { createHash } from "node:crypto";
import { Prisma, prisma } from "@rta/database";
import {
  createSeededRandom,
  randomValue,
  weightedPick,
  type RandomSource
} from "@rta/game-engine";
import { AppError } from "./errors.js";
import { CollectionService } from "./collection.service.js";
import { getEconomyConfig } from "./economy-config.js";

type BoosterTypeName = "basic" | "rare" | "epic" | "legendary";
type VariantName = "normal" | "shiny" | "holo";

interface BoosterOpenSnapshot {
  cardIds: string[];
  variants: VariantName[];
  upgradedType: BoosterTypeName;
}

export const BOOSTER_CARD_RARITY = {
  basic: "Common",
  rare: "Rare",
  epic: "Very Rare",
  legendary: "Black Market"
} as const satisfies Record<BoosterTypeName, string>;

export class BoosterService {
  private readonly collectionService = new CollectionService();

  private async migrateLegacyBoosters(userId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Booster" WHERE "userId" = ${userId} FOR UPDATE`
      );
      const legacy = await tx.booster.findUnique({ where: { userId } });
      if (!legacy) return;

      const basic = Math.max(0, legacy.basicQuantity ?? 0);
      const rare = Math.max(0, legacy.rareQuantity ?? 0);
      const epic = Math.max(0, legacy.epicQuantity ?? 0);
      if (basic === 0 && rare === 0 && epic === 0) return;

      if (basic > 0) {
        await tx.userBooster.upsert({
          where: { userId_boosterType: { userId, boosterType: "basic" } },
          update: { quantity: { increment: basic } },
          create: { userId, boosterType: "basic", quantity: basic }
        });
      }
      if (rare > 0) {
        await tx.userBooster.upsert({
          where: { userId_boosterType: { userId, boosterType: "rare" } },
          update: { quantity: { increment: rare } },
          create: { userId, boosterType: "rare", quantity: rare }
        });
      }
      if (epic > 0) {
        await tx.userBooster.upsert({
          where: { userId_boosterType: { userId, boosterType: "epic" } },
          update: { quantity: { increment: epic } },
          create: { userId, boosterType: "epic", quantity: epic }
        });
      }

      await tx.booster.update({ where: { userId }, data: { basicQuantity: 0, rareQuantity: 0, epicQuantity: 0 } });
    });
  }

  async addBoosters(userId: string, quantity: number, type: BoosterTypeName = "basic") {
    const safeQuantity = Math.max(0, Math.floor(quantity));
    return prisma.userBooster.upsert({
      where: { userId_boosterType: { userId, boosterType: type } },
      update: { quantity: { increment: safeQuantity } },
      create: { userId, boosterType: type, quantity: safeQuantity }
    });
  }

  async getUserBoosters(userId: string) {
    await this.migrateLegacyBoosters(userId);
    const rows = await prisma.userBooster.findMany({ where: { userId } });
    const map = new Map(rows.map((row) => [row.boosterType, row.quantity]));
    return {
      basic: map.get("basic") ?? 0,
      rare: map.get("rare") ?? 0,
      epic: map.get("epic") ?? 0,
      legendary: map.get("legendary") ?? 0
    };
  }

  async buyBooster(userId: string, type: BoosterTypeName, idempotencyKey: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/.test(idempotencyKey)) {
      throw new AppError("A valid idempotency key is required", 400);
    }
    const operationKey = `booster-buy:${userId}:${idempotencyKey}`;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({ where: { operationKey } });
      if (replay) {
        const metadata =
          replay.metadata && typeof replay.metadata === "object" && !Array.isArray(replay.metadata)
            ? (replay.metadata as Record<string, unknown>)
            : {};
        return { type, price: Number(metadata.price ?? -replay.delta), replayed: true };
      }

      const config = await tx.appConfig.upsert({
        where: { id: "default" },
        update: {},
        create: { id: "default" }
      });
      const catalogBooster = await tx.itemDefinition.findUnique({
        where: { contentKey: `booster.${type}` },
        select: { metadata: true, status: true }
      });
      const catalogMetadata =
        catalogBooster?.metadata &&
        typeof catalogBooster.metadata === "object" &&
        !Array.isArray(catalogBooster.metadata)
          ? (catalogBooster.metadata as Record<string, unknown>)
          : {};
      const catalogPrice = Number(catalogMetadata.creditPrice);
      const price =
        catalogBooster?.status === "PUBLISHED" &&
        Number.isSafeInteger(catalogPrice) &&
        catalogPrice >= 0
          ? catalogPrice
          : this.getBoosterPrice(config, type);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("User not found", 404);
      if (user.credits < price) throw new AppError("Crédits insuffisants", 409);

      await tx.user.update({
        where: { id: userId },
        data: { credits: { decrement: price }, balanceVersion: { increment: 1 } }
      });
      await tx.userBooster.upsert({
        where: { userId_boosterType: { userId, boosterType: type } },
        update: { quantity: { increment: 1 } },
        create: { userId, boosterType: type, quantity: 1 }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "CREDITS",
          delta: -price,
          balanceBefore: user.credits,
          balanceAfter: user.credits - price,
          reason: "booster.purchased",
          referenceType: "Booster",
          referenceId: type,
          operationKey,
          metadata: { price, boosterType: type }
        }
      });
      await tx.transactionLog.create({
        data: {
          userId,
          type: "booster",
          amount: -price,
          metadata: { action: "buy", boosterType: type, operationKey }
        }
      });
      await tx.economyLog.create({
        data: {
          userId,
          type: "buy_booster",
          amount: price,
          metadata: { boosterType: type, operationKey }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "booster.purchased",
          eventVersion: 1,
          payload: { userId, boosterType: type, price }
        }
      });
      return { type, price, replayed: false };
    });
  }

  async craftBooster(userId: string, idempotencyKey: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/.test(idempotencyKey)) {
      throw new AppError("A valid idempotency key is required", 400);
    }
    const config = await getEconomyConfig();
    const cost = config.craftBoosterFragmentCost;
    const operationKey = `booster-craft:${userId}:${idempotencyKey}`;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"economy:" + userId}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: `${operationKey}:fragments` }
      });
      if (replay) {
        return { cost: -replay.delta, boosterType: "basic" as const, replayed: true };
      }

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("User not found", 404);
      if (user.fragments < cost) throw new AppError("Fragments insuffisants", 409);
      const booster = await tx.userBooster.findUnique({
        where: { userId_boosterType: { userId, boosterType: "basic" } }
      });

      const debited = await tx.user.updateMany({
        where: { id: userId, fragments: { gte: cost } },
        data: { fragments: { decrement: cost }, balanceVersion: { increment: 1 } }
      });
      if (debited.count !== 1) throw new AppError("Fragments changed concurrently", 409);
      await tx.userBooster.upsert({
        where: { userId_boosterType: { userId, boosterType: "basic" } },
        update: { quantity: { increment: 1 } },
        create: { userId, boosterType: "basic", quantity: 1 }
      });
      const metadata = { cost, reward: "basic" };
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "FRAGMENTS",
          delta: -cost,
          balanceBefore: user.fragments,
          balanceAfter: user.fragments - cost,
          reason: "booster.crafted",
          referenceType: "Booster",
          referenceId: "basic",
          operationKey: `${operationKey}:fragments`,
          metadata
        }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "BOOSTER",
          assetKey: "basic",
          delta: 1,
          balanceBefore: booster?.quantity ?? 0,
          balanceAfter: (booster?.quantity ?? 0) + 1,
          reason: "booster.crafted",
          referenceType: "Booster",
          referenceId: "basic",
          operationKey: `${operationKey}:booster`,
          metadata
        }
      });
      await tx.transactionLog.create({
        data: { userId, type: "craft", amount: -cost, metadata: { ...metadata, operationKey } }
      });
      await tx.economyLog.create({
        data: {
          userId,
          type: "buy_booster",
          amount: cost,
          metadata: { action: "craft", ...metadata, operationKey }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "booster.crafted",
          eventVersion: 1,
          payload: { userId, ...metadata }
        }
      });
      return { cost, boosterType: "basic" as const, replayed: false };
    });
  }

  async openBooster(
    userId: string,
    type: BoosterTypeName = "basic",
    guildId: string | undefined,
    idempotencyKey: string
  ) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/.test(idempotencyKey)) {
      throw new AppError("A valid idempotency key is required", 400);
    }
    await this.migrateLegacyBoosters(userId);
    const scopeKey = `booster-open:${userId}:${idempotencyKey}`;
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ userId, type, guildId: guildId ?? null }))
      .digest("hex");

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${scopeKey}, 0))`
      );
      const existing = await tx.idempotencyRecord.findUnique({ where: { scopeKey } });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new AppError("Idempotency key was already used for another request", 409);
        }
        const snapshot = this.parseOpenSnapshot(existing.response);
        return { snapshot, replayed: true };
      }

      await tx.idempotencyRecord.create({
        data: {
          scopeKey,
          scope: "booster.open",
          key: idempotencyKey,
          requestHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000)
        }
      });

      const config = await tx.appConfig.upsert({
        where: { id: "default" },
        update: {},
        create: { id: "default" }
      });
      const random = createSeededRandom(`${scopeKey}:${requestHash}`);
      const upgradedType = type;
      const cards = await this.drawBoosterCards(type, random, tx);
      const withVariant = cards.map((card) => ({
        card,
        variant: this.rollVariant(config, random)
      }));

      const booster = await tx.userBooster.findUnique({
        where: { userId_boosterType: { userId, boosterType: type } }
      });
      if (!booster || booster.quantity <= 0) {
        throw new AppError("Aucun booster disponible", 409);
      }
      const consumed = await tx.userBooster.updateMany({
        where: {
          userId,
          boosterType: type,
          quantity: { gte: 1 }
        },
        data: { quantity: { decrement: 1 } }
      });
      if (consumed.count !== 1) {
        throw new AppError("Booster stock changed concurrently", 409);
      }

      for (const row of withVariant) {
        await tx.inventoryItem.upsert({
          where: { userId_cardId_variant: { userId, cardId: row.card.id, variant: row.variant } },
          update: { quantity: { increment: 1 }, version: { increment: 1 } },
          create: { userId, cardId: row.card.id, variant: row.variant, quantity: 1 }
        });
      }

      const snapshot: BoosterOpenSnapshot = {
        cardIds: cards.map((card) => card.id),
        variants: withVariant.map((row) => row.variant),
        upgradedType
      };
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "BOOSTER",
          assetKey: type,
          delta: -1,
          balanceBefore: booster.quantity,
          balanceAfter: booster.quantity - 1,
          reason: "booster.opened",
          referenceType: "Booster",
          referenceId: type,
          operationKey: scopeKey,
          metadata: snapshot as unknown as Prisma.InputJsonObject
        }
      });
      await tx.transactionLog.create({
        data: {
          userId,
          type: "booster",
          amount: cards.length,
          metadata: {
            action: "open",
            boosterType: type,
            effectiveType: upgradedType,
            operationKey: scopeKey
          }
        }
      });
      await tx.economyLog.create({
        data: {
          userId,
          type: "open_booster",
          amount: cards.length,
          metadata: { boosterType: type, effectiveType: upgradedType, operationKey: scopeKey }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${scopeKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "booster.opened",
          eventVersion: 1,
          payload: { userId, boosterType: type, ...snapshot }
        }
      });
      await tx.idempotencyRecord.update({
        where: { scopeKey },
        data: {
          status: "COMPLETED",
          response: snapshot as unknown as Prisma.InputJsonObject,
          responseCode: 200
        }
      });
      return { snapshot, replayed: false };
    });

    const cardRows = await prisma.card.findMany({
      where: { id: { in: result.snapshot.cardIds } },
      include: { rarity: true, deck: true }
    });
    const cardsById = new Map(cardRows.map((card) => [card.id, card]));
    const cards = result.snapshot.cardIds.map((cardId, index) => {
      const card = cardsById.get(cardId);
      if (!card) throw new AppError("Booster replay references a missing card", 500);
      return { card, variant: result.snapshot.variants[index]! };
    });

    if (!result.replayed) await this.collectionService.grantCollectionRewards(userId);
    return { cards, upgradedType: result.snapshot.upgradedType, replayed: result.replayed };
  }

  private parseOpenSnapshot(value: Prisma.JsonValue | null): BoosterOpenSnapshot {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AppError("Stored booster result is invalid", 500);
    }
    const candidate = value as Record<string, Prisma.JsonValue>;
    if (
      !Array.isArray(candidate.cardIds) ||
      !candidate.cardIds.every((entry) => typeof entry === "string") ||
      !Array.isArray(candidate.variants) ||
      !candidate.variants.every(
        (entry) => entry === "normal" || entry === "shiny" || entry === "holo"
      ) ||
      (candidate.upgradedType !== "basic" &&
        candidate.upgradedType !== "rare" &&
        candidate.upgradedType !== "epic" &&
        candidate.upgradedType !== "legendary") ||
      ![1, 3].includes(candidate.cardIds.length) ||
      candidate.variants.length !== candidate.cardIds.length
    ) {
      throw new AppError("Stored booster result is invalid", 500);
    }
    return candidate as unknown as BoosterOpenSnapshot;
  }

  private pickRandom<T>(arr: T[], count: number, random: RandomSource): T[] {
    const shuffled = [...arr];
    for (let index = 0; index < count; index += 1) {
      const selected = index + Math.floor(randomValue(random) * (shuffled.length - index));
      [shuffled[index], shuffled[selected]] = [shuffled[selected]!, shuffled[index]!];
    }
    return shuffled.slice(0, count);
  }

  private getBoosterPrice(config: Awaited<ReturnType<typeof getEconomyConfig>>, type: BoosterTypeName) {
    if (type === "basic") return config.basicBoosterPrice;
    if (type === "rare") return config.rareBoosterPrice;
    if (type === "epic") return config.epicBoosterPrice;
    return config.legendaryBoosterPrice;
  }

  private rollVariant(
    config: Awaited<ReturnType<typeof getEconomyConfig>>,
    random: RandomSource
  ): VariantName {
    const normal = Math.max(0, config.normalVariantRate);
    const shiny = Math.max(0, config.shinyVariantRate);
    const holo = Math.max(0, config.holoVariantRate);
    if (normal + shiny + holo <= 0) throw new AppError("Variant rates are invalid", 500);
    return weightedPick(
      [
        { value: "normal" as const, weight: Math.max(1, Math.round(normal * 1_000_000)) },
        { value: "shiny" as const, weight: Math.max(1, Math.round(shiny * 1_000_000)) },
        { value: "holo" as const, weight: Math.max(1, Math.round(holo * 1_000_000)) }
      ],
      random
    );
  }

  private async drawBoosterCards(
    type: BoosterTypeName,
    random: RandomSource,
    tx: Prisma.TransactionClient
  ) {
    const rarityName = BOOSTER_CARD_RARITY[type];
    const pool = await tx.card.findMany({
      where: {
        rarity: { name: rarityName },
        imageUrl: { not: null },
        source: "vault",
        status: "PUBLISHED",
        isActive: true,
        deck: {
          status: "PUBLISHED",
          isActive: true
        }
      },
      include: { rarity: true, deck: true },
      orderBy: { id: "asc" }
    });
    if (pool.length === 0) {
      throw new AppError(
        `Aucune carte ${rarityName} n'est disponible pour ce booster.`,
        500
      );
    }
    return this.pickRandom(pool, 1, random);
  }
}
