import { createHash } from "node:crypto";
import { Prisma, prisma, type CardVariant } from "@rta/database";
import { AppError } from "./errors.js";
import { CollectionService } from "./collection.service.js";
import { assertCardCanLeaveCollection } from "./collection-protection.js";

export const TRANSMUTATION_CARD_COST = 5;
export const FRAGMENT_CARD_COST = 100;
export const FRAGMENT_BOOSTER_COST = 50;

export const TRANSMUTATION_RARITY_CHAIN = [
  "Common",
  "Uncommon",
  "Rare",
  "Very Rare",
  "Import",
  "Exotic",
  "Black Market"
] as const;

export type TransmutationMode = "DECK" | "TIER" | "BULK";
type CoreRarity = (typeof TRANSMUTATION_RARITY_CHAIN)[number];

const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/;
const BOOSTER_KEY_BY_RARITY: Partial<Record<CoreRarity, string>> = {
  Common: "booster.boss_choice.common",
  Uncommon: "booster.boss_choice.uncommon",
  Rare: "booster.boss_choice.rare",
  "Very Rare": "booster.boss_choice.very_rare",
  Import: "booster.boss_choice.import",
  Exotic: "booster.boss_choice.exotic"
};

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function deterministicUnit(seed: string) {
  const digest = createHash("sha256").update(seed).digest();
  return digest.readUIntBE(0, 6) / 2 ** 48;
}

function deterministicPick<T>(values: T[], seed: string) {
  if (values.length === 0) throw new AppError("Aucune récompense compatible n’est disponible.", 409);
  return values[Math.floor(deterministicUnit(seed) * values.length) % values.length]!;
}

function nextRarity(rarity: string): CoreRarity | null {
  const index = TRANSMUTATION_RARITY_CHAIN.indexOf(rarity as CoreRarity);
  return index >= 0 ? TRANSMUTATION_RARITY_CHAIN[index + 1] ?? null : null;
}

export function guaranteedTransmutationVariant(variants: CardVariant[]) {
  if (variants.length === TRANSMUTATION_CARD_COST && variants.every((value) => value === "holo")) {
    return "holo" as const;
  }
  if (variants.length === TRANSMUTATION_CARD_COST && variants.every((value) => value === "shiny")) {
    return "shiny" as const;
  }
  if (
    variants.length === TRANSMUTATION_CARD_COST &&
    variants.every((value) => value === "shiny" || value === "holo")
  ) {
    return variants.filter((value) => value === "holo").length >= 3
      ? "holo" as const
      : "shiny" as const;
  }
  return null;
}

function rollDefaultVariant(config: {
  normalVariantRate: number;
  shinyVariantRate: number;
  holoVariantRate: number;
}, seed: string): CardVariant {
  const normal = Math.max(0, config.normalVariantRate);
  const shiny = Math.max(0, config.shinyVariantRate);
  const holo = Math.max(0, config.holoVariantRate);
  const total = normal + shiny + holo;
  if (total <= 0) return "normal";
  const roll = deterministicUnit(seed) * total;
  if (roll < normal) return "normal";
  if (roll < normal + shiny) return "shiny";
  return "holo";
}

type RewardCard = Prisma.CardGetPayload<{ include: { deck: true; rarity: true } }>;

async function chooseMissingReward(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    pool: RewardCard[];
    seed: string;
    forcedVariant?: CardVariant | null;
  }
) {
  const owned = await tx.inventoryItem.findMany({
    where: { userId: input.userId, quantity: { gt: 0 }, cardId: { in: input.pool.map((card) => card.id) } },
    select: { cardId: true, variant: true }
  });
  const ownedCardIds = new Set(owned.map((entry) => entry.cardId));
  const missingCards = input.pool.filter((card) => !ownedCardIds.has(card.id));
  if (missingCards.length > 0) {
    return {
      card: deterministicPick(missingCards, `${input.seed}:missing-card`),
      variant: input.forcedVariant ?? null
    };
  }

  const ownedVariants = new Set(owned.map((entry) => `${entry.cardId}:${entry.variant}`));
  const preferredVariants: CardVariant[] = input.forcedVariant
    ? [input.forcedVariant]
    : ["shiny", "holo"];
  for (const variant of preferredVariants) {
    const missingVariantCards = input.pool.filter((card) =>
      !ownedVariants.has(`${card.id}:${variant}`)
    );
    if (missingVariantCards.length > 0) {
      return {
        card: deterministicPick(missingVariantCards, `${input.seed}:missing-${variant}`),
        variant
      };
    }
  }
  return {
    card: deterministicPick(input.pool, `${input.seed}:complete-pool`),
    variant: input.forcedVariant ?? null
  };
}

export class TransmutationService {
  private readonly collectionService = new CollectionService();

  async transmuteCards(input: {
    userId: string;
    mode: TransmutationMode;
    sacrificeItemIds: string[];
    idempotencyKey: string;
  }) {
    if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
      throw new AppError("Une clé d’idempotence valide est requise.", 400);
    }
    if (!["DECK", "TIER", "BULK"].includes(input.mode)) {
      throw new AppError("Mode de transmutation invalide.", 400);
    }
    if (input.sacrificeItemIds.length !== TRANSMUTATION_CARD_COST) {
      throw new AppError(`Choisis exactement ${TRANSMUTATION_CARD_COST} cartes à sacrifier.`, 400);
    }
    const operationKey = `transmutation:${input.userId}:${input.idempotencyKey}`;
    const requestItems = [...input.sacrificeItemIds].sort();

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"economy:" + input.userId}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: `${operationKey}:reward` }
      });
      if (replay) {
        const metadata = jsonRecord(replay.metadata);
        const storedItems = Array.isArray(metadata.sacrificeItemIds)
          ? metadata.sacrificeItemIds.filter((value): value is string => typeof value === "string").sort()
          : [];
        if (metadata.mode !== input.mode || JSON.stringify(storedItems) !== JSON.stringify(requestItems)) {
          throw new AppError("Cette clé a déjà été utilisée pour une autre transmutation.", 409);
        }
        return {
          cardId: String(metadata.rewardCardId ?? ""),
          variant: String(metadata.rewardVariant ?? "normal") as CardVariant,
          replayed: true
        };
      }

      const requestedCounts = new Map<string, number>();
      for (const itemId of input.sacrificeItemIds) {
        requestedCounts.set(itemId, (requestedCounts.get(itemId) ?? 0) + 1);
      }
      const rows = await tx.inventoryItem.findMany({
        where: { id: { in: [...requestedCounts.keys()] }, userId: input.userId },
        include: { card: { include: { deck: true, rarity: true } }, archive: true },
        orderBy: { id: "asc" }
      });
      if (rows.length !== requestedCounts.size) {
        throw new AppError("Une des cartes sélectionnées n’est plus disponible.", 409);
      }
      for (const row of rows) {
        const requested = requestedCounts.get(row.id) ?? 0;
        if (requested < 1 || row.quantity < requested) {
          throw new AppError(`Stock insuffisant pour ${row.card.name}.`, 409);
        }
        await assertCardCanLeaveCollection(tx, {
          userId: input.userId,
          cardId: row.cardId,
          quantity: requested,
          variant: row.variant,
          confirmedLastCopy: true
        });
      }
      const expanded = input.sacrificeItemIds.map((itemId) => rows.find((row) => row.id === itemId)!);
      const deckIds = new Set(expanded.map((row) => row.card.deckId));
      const rarityNames = new Set(expanded.map((row) => row.card.rarity.name));
      if (input.mode === "DECK" && deckIds.size !== 1) {
        throw new AppError("Le mode Deck exige 5 cartes du même deck.", 409);
      }
      if (input.mode === "TIER" && rarityNames.size !== 1) {
        throw new AppError("Le mode Tier exige 5 cartes du même tier.", 409);
      }

      const targetRarity = input.mode === "TIER"
        ? nextRarity(expanded[0]!.card.rarity.name)
        : null;
      if (input.mode === "TIER" && !targetRarity) {
        throw new AppError("Black Market est déjà le tier maximal.", 409);
      }
      const pool = await tx.card.findMany({
        where: {
          source: "vault",
          status: "PUBLISHED",
          isActive: true,
          deck: { status: "PUBLISHED", isActive: true },
          ...(input.mode === "DECK" ? { deckId: expanded[0]!.card.deckId } : {}),
          ...(targetRarity ? { rarity: { name: targetRarity } } : {})
        },
        include: { deck: true, rarity: true },
        orderBy: { id: "asc" }
      });
      const forcedVariant = guaranteedTransmutationVariant(expanded.map((row) => row.variant));
      const chosen = await chooseMissingReward(tx, {
        userId: input.userId,
        pool,
        seed: operationKey,
        forcedVariant
      });
      const config = await tx.appConfig.upsert({
        where: { id: "default" },
        update: {},
        create: { id: "default" }
      });
      const rewardVariant = chosen.variant ?? rollDefaultVariant(config, `${operationKey}:variant`);

      for (const row of rows) {
        const quantity = requestedCounts.get(row.id)!;
        const consumed = await tx.inventoryItem.updateMany({
          where: { id: row.id, quantity: { gte: quantity }, version: row.version },
          data: { quantity: { decrement: quantity }, version: { increment: 1 } }
        });
        if (consumed.count !== 1) throw new AppError("La collection a changé. Réessaie.", 409);
        await tx.inventoryItem.deleteMany({ where: { id: row.id, quantity: 0 } });
      }
      const rewardStock = await tx.inventoryItem.findUnique({
        where: {
          userId_cardId_variant: {
            userId: input.userId,
            cardId: chosen.card.id,
            variant: rewardVariant
          }
        }
      });
      await tx.inventoryItem.upsert({
        where: {
          userId_cardId_variant: {
            userId: input.userId,
            cardId: chosen.card.id,
            variant: rewardVariant
          }
        },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: { userId: input.userId, cardId: chosen.card.id, variant: rewardVariant, quantity: 1 }
      });
      await tx.userGameplayState.upsert({
        where: { userId: input.userId },
        update: { transmutations: { increment: 1 }, version: { increment: 1 } },
        create: { userId: input.userId, transmutations: 1 }
      });
      const metadata = {
        mode: input.mode,
        sacrificeItemIds: requestItems,
        consumed: expanded.map((row) => ({
          inventoryItemId: row.id,
          cardId: row.cardId,
          cardName: row.card.name,
          variant: row.variant
        })),
        rewardCardId: chosen.card.id,
        rewardVariant,
        rewardCardName: chosen.card.name,
        targetRarity
      };
      await tx.economicLedgerEntry.createMany({
        data: [
          {
            userId: input.userId,
            asset: "CARD",
            assetKey: input.mode,
            delta: -TRANSMUTATION_CARD_COST,
            balanceBefore: TRANSMUTATION_CARD_COST,
            balanceAfter: 0,
            reason: "transmutation.cards_consumed",
            referenceType: "Transmutation",
            referenceId: operationKey,
            operationKey: `${operationKey}:consumed`,
            metadata
          },
          {
            userId: input.userId,
            asset: "CARD",
            assetKey: `${chosen.card.id}:${rewardVariant}`,
            delta: 1,
            balanceBefore: rewardStock?.quantity ?? 0,
            balanceAfter: (rewardStock?.quantity ?? 0) + 1,
            reason: "transmutation.card_reward",
            referenceType: "Card",
            referenceId: chosen.card.id,
            operationKey: `${operationKey}:reward`,
            metadata
          }
        ]
      });
      await tx.transactionLog.create({
        data: { userId: input.userId, type: "transmutation", amount: 1, metadata }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: input.userId,
          eventType: "card.transmutation.completed",
          eventVersion: 1,
          payload: { userId: input.userId, ...metadata }
        }
      });
      return { cardId: chosen.card.id, variant: rewardVariant, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const card = await prisma.card.findUnique({
      where: { id: result.cardId },
      include: { deck: true, rarity: true }
    });
    if (!card) throw new AppError("La carte transmutée est introuvable.", 500);
    if (!result.replayed) await this.collectionService.grantCollectionRewards(input.userId);
    return { ...result, card };
  }

  async craftCardFromFragments(input: {
    userId: string;
    sourceRarity: CoreRarity;
    idempotencyKey: string;
  }) {
    if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
      throw new AppError("Une clé d’idempotence valide est requise.", 400);
    }
    const targetRarity = nextRarity(input.sourceRarity);
    if (!targetRarity) throw new AppError("Black Market est déjà le tier maximal.", 409);
    const operationKey = `fragment-card:${input.userId}:${input.idempotencyKey}`;

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"economy:" + input.userId}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: `${operationKey}:card` }
      });
      if (replay) return {
        cardId: replay.referenceId,
        variant: String(jsonRecord(replay.metadata).rewardVariant ?? "normal") as CardVariant,
        replayed: true
      };
      const source = await tx.rarity.findUnique({ where: { name: input.sourceRarity } });
      if (!source) throw new AppError("Tier de fragments introuvable.", 404);
      const balance = await tx.fragmentBalance.findUnique({
        where: { userId_rarityId: { userId: input.userId, rarityId: source.id } }
      });
      if (!balance || balance.quantity < FRAGMENT_CARD_COST) {
        throw new AppError(`Il faut ${FRAGMENT_CARD_COST} fragments ${input.sourceRarity}.`, 409);
      }
      const pool = await tx.card.findMany({
        where: {
          source: "vault", status: "PUBLISHED", isActive: true,
          rarity: { name: targetRarity }, deck: { status: "PUBLISHED", isActive: true }
        },
        include: { deck: true, rarity: true },
        orderBy: { id: "asc" }
      });
      const chosen = await chooseMissingReward(tx, {
        userId: input.userId,
        pool,
        seed: operationKey
      });
      const config = await tx.appConfig.upsert({
        where: { id: "default" }, update: {}, create: { id: "default" }
      });
      const variant = chosen.variant ?? rollDefaultVariant(config, `${operationKey}:variant`);
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
      if (user.fragments < FRAGMENT_CARD_COST) {
        throw new AppError("Le solde global de fragments est insuffisant.", 409);
      }
      const rewardStock = await tx.inventoryItem.findUnique({
        where: { userId_cardId_variant: { userId: input.userId, cardId: chosen.card.id, variant } }
      });
      const debited = await tx.fragmentBalance.updateMany({
        where: { id: balance.id, quantity: { gte: FRAGMENT_CARD_COST } },
        data: { quantity: { decrement: FRAGMENT_CARD_COST } }
      });
      if (debited.count !== 1) throw new AppError("Le solde de fragments a changé.", 409);
      const aggregateDebit = await tx.user.updateMany({
        where: { id: input.userId, fragments: { gte: FRAGMENT_CARD_COST } },
        data: { fragments: { decrement: FRAGMENT_CARD_COST }, balanceVersion: { increment: 1 } }
      });
      if (aggregateDebit.count !== 1) throw new AppError("Le solde global de fragments a changé.", 409);
      await tx.inventoryItem.upsert({
        where: { userId_cardId_variant: { userId: input.userId, cardId: chosen.card.id, variant } },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: { userId: input.userId, cardId: chosen.card.id, variant, quantity: 1 }
      });
      const metadata = {
        sourceRarity: input.sourceRarity,
        targetRarity,
        cost: FRAGMENT_CARD_COST,
        rewardCardId: chosen.card.id,
        rewardVariant: variant
      };
      await tx.economicLedgerEntry.createMany({ data: [
        {
          userId: input.userId, asset: "FRAGMENTS", assetKey: input.sourceRarity,
          delta: -FRAGMENT_CARD_COST, balanceBefore: balance.quantity,
          balanceAfter: balance.quantity - FRAGMENT_CARD_COST,
          reason: "fragments.card_catalyst", referenceType: "Rarity", referenceId: source.id,
          operationKey: `${operationKey}:fragments`, metadata
        },
        {
          userId: input.userId, asset: "CARD", assetKey: `${chosen.card.id}:${variant}`,
          delta: 1, balanceBefore: rewardStock?.quantity ?? 0,
          balanceAfter: (rewardStock?.quantity ?? 0) + 1,
          reason: "fragments.card_reward", referenceType: "Card", referenceId: chosen.card.id,
          operationKey: `${operationKey}:card`, metadata
        }
      ] });
      await tx.transactionLog.create({
        data: { userId: input.userId, type: "fragment_card_catalyst", amount: 1, metadata }
      });
      return { cardId: chosen.card.id, variant, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const card = await prisma.card.findUnique({
      where: { id: result.cardId }, include: { deck: true, rarity: true }
    });
    if (!card) throw new AppError("Récompense introuvable.", 500);
    if (!result.replayed) await this.collectionService.grantCollectionRewards(input.userId);
    return { ...result, card };
  }

  async craftBoosterFromFragments(input: {
    userId: string;
    rarity: CoreRarity;
    idempotencyKey: string;
  }) {
    if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
      throw new AppError("Une clé d’idempotence valide est requise.", 400);
    }
    const contentKey = BOOSTER_KEY_BY_RARITY[input.rarity];
    if (!contentKey) throw new AppError("Aucun booster ne correspond à ce tier.", 409);
    const operationKey = `fragment-booster:${input.userId}:${input.idempotencyKey}`;
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"economy:" + input.userId}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: `${operationKey}:booster` }
      });
      if (replay) return { contentKey, cost: FRAGMENT_BOOSTER_COST, replayed: true };
      const [rarity, booster, user] = await Promise.all([
        tx.rarity.findUnique({ where: { name: input.rarity } }),
        tx.itemDefinition.findUnique({ where: { contentKey } }),
        tx.user.findUnique({ where: { id: input.userId } })
      ]);
      if (!rarity || !booster || booster.status !== "PUBLISHED" || !user) {
        throw new AppError("Catalyseur de booster indisponible.", 404);
      }
      if (user.fragments < FRAGMENT_BOOSTER_COST) {
        throw new AppError("Le solde global de fragments est insuffisant.", 409);
      }
      const balance = await tx.fragmentBalance.findUnique({
        where: { userId_rarityId: { userId: input.userId, rarityId: rarity.id } }
      });
      if (!balance || balance.quantity < FRAGMENT_BOOSTER_COST) {
        throw new AppError(`Il faut ${FRAGMENT_BOOSTER_COST} fragments ${input.rarity}.`, 409);
      }
      const stock = await tx.userItem.findUnique({
        where: { userId_itemId: { userId: input.userId, itemId: booster.id } }
      });
      const debited = await tx.fragmentBalance.updateMany({
        where: { id: balance.id, quantity: { gte: FRAGMENT_BOOSTER_COST } },
        data: { quantity: { decrement: FRAGMENT_BOOSTER_COST } }
      });
      if (debited.count !== 1) throw new AppError("Le solde de fragments a changé.", 409);
      const aggregateDebit = await tx.user.updateMany({
        where: { id: input.userId, fragments: { gte: FRAGMENT_BOOSTER_COST } },
        data: { fragments: { decrement: FRAGMENT_BOOSTER_COST }, balanceVersion: { increment: 1 } }
      });
      if (aggregateDebit.count !== 1) throw new AppError("Le solde global de fragments a changé.", 409);
      await tx.userItem.upsert({
        where: { userId_itemId: { userId: input.userId, itemId: booster.id } },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: { userId: input.userId, itemId: booster.id, quantity: 1 }
      });
      const metadata = { rarity: input.rarity, contentKey, cost: FRAGMENT_BOOSTER_COST };
      await tx.economicLedgerEntry.createMany({ data: [
        {
          userId: input.userId, asset: "FRAGMENTS", assetKey: input.rarity,
          delta: -FRAGMENT_BOOSTER_COST, balanceBefore: balance.quantity,
          balanceAfter: balance.quantity - FRAGMENT_BOOSTER_COST,
          reason: "fragments.booster_catalyst", referenceType: "Rarity", referenceId: rarity.id,
          operationKey: `${operationKey}:fragments`, metadata
        },
        {
          userId: input.userId, asset: "BOOSTER", assetKey: contentKey,
          delta: 1, balanceBefore: stock?.quantity ?? 0, balanceAfter: (stock?.quantity ?? 0) + 1,
          reason: "fragments.booster_reward", referenceType: "ItemDefinition", referenceId: booster.id,
          operationKey: `${operationKey}:booster`, metadata
        }
      ] });
      await tx.transactionLog.create({
        data: { userId: input.userId, type: "fragment_booster_catalyst", amount: 1, metadata }
      });
      return { contentKey, cost: FRAGMENT_BOOSTER_COST, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
