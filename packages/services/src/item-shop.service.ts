import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";

const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/;

function creditPrice(value: Prisma.JsonValue | null): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const price = Number((value as Record<string, Prisma.JsonValue>).creditPrice);
  return Number.isSafeInteger(price) && price > 0 ? price : 0;
}

function metadataRecord(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

const FALLBACK_RESALE_BY_RARITY: Record<string, number> = {
  common: 100,
  commun: 100,
  uncommon: 200,
  "peu commun": 200,
  rare: 450,
  "very rare": 1_000,
  épique: 1_000,
  epique: 1_000,
  import: 1_600,
  exotic: 2_600,
  légendaire: 3_000,
  legendaire: 3_000,
  "black market": 5_000,
  mythique: 6_000
};

export function itemResaleUnitPrice(metadataValue: Prisma.JsonValue | null) {
  const metadata = metadataRecord(metadataValue);
  const purchasePrice = Number(metadata.creditPrice);
  if (Number.isSafeInteger(purchasePrice) && purchasePrice > 0) {
    return Math.max(1, Math.floor(purchasePrice * 0.5));
  }
  const rarity = typeof metadata.rarity === "string"
    ? metadata.rarity.trim().toLocaleLowerCase("fr-FR")
    : "";
  return FALLBACK_RESALE_BY_RARITY[rarity] ?? 50;
}

function itemCanBeSold(item: {
  type: string;
  metadata: Prisma.JsonValue | null;
}) {
  const metadata = metadataRecord(item.metadata);
  return metadata.tradable === true && item.type !== "SOUVENIR";
}

export class ItemShopService {
  async getSellQuote(userId: string, contentKey: string, quantity = 1) {
    const safeQuantity = Math.max(1, Math.floor(quantity));
    const item = await prisma.itemDefinition.findUnique({ where: { contentKey } });
    if (!item || item.status !== "PUBLISHED" || !itemCanBeSold(item)) {
      throw new AppError("Cet objet spécial ne peut pas être vendu.", 409);
    }
    const owned = item.type === "BOOSTER" && /^booster\.(basic|rare|epic|legendary)$/.test(contentKey)
      ? null
      : await prisma.userItem.findUnique({
          where: { userId_itemId: { userId, itemId: item.id } }
        });
    if (!owned || owned.quantity < safeQuantity) {
      throw new AppError("Tu ne possèdes pas assez de cet objet.", 409);
    }
    if (item.type === "ARTIFACT") {
      const equipped = await prisma.equippedArtifact.findFirst({
        where: { userId, itemId: item.id }
      });
      if (equipped) {
        throw new AppError("Déséquipe cet artefact avant de le vendre.", 409);
      }
    }
    const unitPrice = itemResaleUnitPrice(item.metadata);
    return {
      item,
      quantity: safeQuantity,
      unitPrice,
      credits: unitPrice * safeQuantity
    };
  }

  async sellItem(
    userId: string,
    contentKey: string,
    quantity: number,
    idempotencyKey: string
  ) {
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppError("Une clé d'idempotence valide est requise", 400);
    }
    const safeQuantity = Math.max(1, Math.floor(quantity));
    const operationKey = `item-sell:${userId}:${idempotencyKey}`;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"economy:" + userId}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: `${operationKey}:credits` }
      });
      if (replay) {
        const metadata = metadataRecord(replay.metadata);
        if (metadata.contentKey !== contentKey || Number(metadata.quantity) !== safeQuantity) {
          throw new AppError("Cette clé a déjà été utilisée pour une autre vente.", 409);
        }
        return {
          contentKey,
          quantity: safeQuantity,
          unitPrice: Number(metadata.unitPrice ?? 0),
          credits: replay.delta,
          replayed: true
        };
      }

      const item = await tx.itemDefinition.findUnique({ where: { contentKey } });
      if (!item || item.status !== "PUBLISHED" || !itemCanBeSold(item)) {
        throw new AppError("Cet objet spécial ne peut pas être vendu.", 409);
      }
      if (item.type === "BOOSTER" && /^booster\.(basic|rare|epic|legendary)$/.test(contentKey)) {
        throw new AppError("Les boosters standards se gèrent dans l’inventaire des boosters.", 409);
      }
      if (item.type === "ARTIFACT") {
        const equipped = await tx.equippedArtifact.findFirst({
          where: { userId, itemId: item.id }
        });
        if (equipped) throw new AppError("Déséquipe cet artefact avant de le vendre.", 409);
      }
      const stock = await tx.userItem.findUnique({
        where: { userId_itemId: { userId, itemId: item.id } }
      });
      if (!stock || stock.quantity < safeQuantity) {
        throw new AppError("Tu ne possèdes pas assez de cet objet.", 409);
      }
      const consumed = await tx.userItem.updateMany({
        where: { id: stock.id, quantity: { gte: safeQuantity }, version: stock.version },
        data: { quantity: { decrement: safeQuantity }, version: { increment: 1 } }
      });
      if (consumed.count !== 1) throw new AppError("Ton inventaire a changé. Réessaie.", 409);
      await tx.userItem.deleteMany({ where: { id: stock.id, quantity: 0 } });

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("Utilisateur introuvable", 404);
      const unitPrice = itemResaleUnitPrice(item.metadata);
      const credits = unitPrice * safeQuantity;
      await tx.user.update({
        where: { id: userId },
        data: { credits: { increment: credits }, balanceVersion: { increment: 1 } }
      });
      const metadata = {
        contentKey,
        itemName: item.name,
        itemType: item.type,
        quantity: safeQuantity,
        unitPrice
      };
      await tx.economicLedgerEntry.createMany({
        data: [
          {
            userId,
            asset: "ITEM",
            assetKey: contentKey,
            delta: -safeQuantity,
            balanceBefore: stock.quantity,
            balanceAfter: stock.quantity - safeQuantity,
            reason: "item.sold",
            referenceType: "ItemDefinition",
            referenceId: item.id,
            operationKey: `${operationKey}:item`,
            metadata
          },
          {
            userId,
            asset: "CREDITS",
            delta: credits,
            balanceBefore: user.credits,
            balanceAfter: user.credits + credits,
            reason: "item.sold",
            referenceType: "ItemDefinition",
            referenceId: item.id,
            operationKey: `${operationKey}:credits`,
            metadata
          }
        ]
      });
      await tx.transactionLog.create({
        data: { userId, type: "item_sale", amount: credits, metadata: { ...metadata, operationKey } }
      });
      await tx.economyLog.create({
        data: { userId, type: "sell_item", amount: credits, metadata: { ...metadata, operationKey } }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "item.sold",
          eventVersion: 1,
          payload: { userId, contentKey, quantity: safeQuantity, credits }
        }
      });
      return { contentKey, quantity: safeQuantity, unitPrice, credits, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async buyItem(userId: string, contentKey: string, idempotencyKey: string) {
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppError("Une clé d'idempotence valide est requise", 400);
    }
    const operationKey = `item-buy:${userId}:${idempotencyKey}`;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({ where: { operationKey } });
      if (replay) {
        return {
          contentKey: replay.referenceId,
          price: Math.abs(replay.delta),
          replayed: true
        };
      }

      const item = await tx.itemDefinition.findUnique({ where: { contentKey } });
      const price = creditPrice(item?.metadata ?? null);
      if (!item || item.status !== "PUBLISHED" || item.type === "BOOSTER" || price <= 0) {
        throw new AppError("Objet non disponible à l'achat", 404);
      }

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("Utilisateur introuvable", 404);
      if (user.credits < price) throw new AppError("Crédits insuffisants", 409);

      const stock = await tx.userItem.findUnique({
        where: { userId_itemId: { userId, itemId: item.id } }
      });
      if ((stock?.quantity ?? 0) >= item.maxStack) {
        throw new AppError("Stock maximum atteint pour cet objet", 409);
      }

      await tx.user.update({
        where: { id: userId },
        data: { credits: { decrement: price }, balanceVersion: { increment: 1 } }
      });
      await tx.userItem.upsert({
        where: { userId_itemId: { userId, itemId: item.id } },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: { userId, itemId: item.id, quantity: 1 }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "CREDITS",
          delta: -price,
          balanceBefore: user.credits,
          balanceAfter: user.credits - price,
          reason: "item.purchased",
          referenceType: "ItemDefinition",
          referenceId: item.contentKey,
          operationKey,
          metadata: { price, itemName: item.name, itemType: item.type }
        }
      });
      await tx.transactionLog.create({
        data: {
          userId,
          type: "item",
          amount: -price,
          metadata: { action: "buy", contentKey: item.contentKey, operationKey }
        }
      });
      await tx.economyLog.create({
        data: {
          userId,
          type: "buy_item",
          amount: price,
          metadata: { contentKey: item.contentKey, operationKey }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "item.purchased",
          eventVersion: 1,
          payload: { userId, contentKey: item.contentKey, price }
        }
      });

      return { contentKey: item.contentKey, price, replayed: false };
    });
  }
}
