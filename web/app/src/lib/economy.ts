import { prisma } from "@rta/database";

const VARIANT_MULTIPLIER: Record<string, number> = {
  normal: 1,
  shiny: 5,
  holo: 10
};

function getBasePriceByRarity(config: {
  commonSellPrice: number;
  uncommonSellPrice: number;
  rareSellPrice: number;
  veryRareSellPrice: number;
  importSellPrice: number;
  exoticSellPrice: number;
  blackMarketSellPrice: number;
}) {
  return {
    Common: config.commonSellPrice,
    Uncommon: config.uncommonSellPrice,
    Rare: config.rareSellPrice,
    "Very Rare": config.veryRareSellPrice,
    Import: config.importSellPrice,
    Exotic: config.exoticSellPrice,
    "Black Market": config.blackMarketSellPrice,
    Limited: config.exoticSellPrice
  } as Record<string, number>;
}

function computeUnitPrice(params: {
  basePrice: number;
  circulationCount: number;
  scarcityFloor: number;
  scarcityCap: number;
  variant: string;
}) {
  const scarcityRaw = 100 / (params.circulationCount + 10);
  const scarcityMultiplier = Math.max(params.scarcityFloor, Math.min(params.scarcityCap, scarcityRaw));
  const variantMultiplier = VARIANT_MULTIPLIER[params.variant] ?? 1;
  const unitPrice = Math.floor(params.basePrice * scarcityMultiplier * variantMultiplier);
  return { scarcityMultiplier, variantMultiplier, unitPrice };
}

export async function getDynamicCardValue(cardId: string, variant: string = "normal") {
  const [card, config, circulation] = await Promise.all([
    prisma.card.findUnique({ where: { id: cardId }, include: { rarity: true, deck: true } }),
    prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
    prisma.inventoryItem.aggregate({ where: { cardId }, _sum: { quantity: true } })
  ]);

  if (!card) return null;

  const circulationCount = circulation._sum.quantity ?? 0;
  const basePriceByRarity = getBasePriceByRarity(config);
  const basePrice = basePriceByRarity[card.rarity.name] ?? 10;
  const pricing = computeUnitPrice({
    basePrice,
    circulationCount,
    scarcityFloor: config.scarcityFloor ?? 0.5,
    scarcityCap: config.scarcityCap ?? 3,
    variant
  });

  return {
    cardId,
    cardName: card.name,
    deckName: card.deck.name,
    rarityName: card.rarity.name,
    variant,
    basePrice,
    scarcityMultiplier: pricing.scarcityMultiplier,
    variantMultiplier: pricing.variantMultiplier,
    circulationCount,
    unitPrice: pricing.unitPrice
  };
}

export async function getDynamicCardValuesBatch(entries: Array<{ cardId: string; variant: string }>) {
  if (entries.length === 0) {
    return new Map<string, { circulationCount: number; unitPrice: number }>();
  }

  const cardIds = [...new Set(entries.map((e) => e.cardId))];

  const [config, cards, circulationRows] = await Promise.all([
    prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
    prisma.card.findMany({ where: { id: { in: cardIds } }, include: { rarity: true } }),
    prisma.inventoryItem.groupBy({ by: ["cardId"], where: { cardId: { in: cardIds } }, _sum: { quantity: true } })
  ]);

  const basePriceByRarity = getBasePriceByRarity(config);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const circulationByCard = new Map(circulationRows.map((r) => [r.cardId, r._sum.quantity ?? 0]));

  const result = new Map<string, { circulationCount: number; unitPrice: number }>();
  for (const entry of entries) {
    const card = cardById.get(entry.cardId);
    if (!card) continue;

    const circulationCount = circulationByCard.get(entry.cardId) ?? 0;
    const basePrice = basePriceByRarity[card.rarity.name] ?? 10;
    const pricing = computeUnitPrice({
      basePrice,
      circulationCount,
      scarcityFloor: config.scarcityFloor ?? 0.5,
      scarcityCap: config.scarcityCap ?? 3,
      variant: entry.variant
    });

    result.set(`${entry.cardId}:${entry.variant}`, {
      circulationCount,
      unitPrice: pricing.unitPrice
    });
  }

  return result;
}

export async function getUserInventoryValue(userId: string) {
  const items = await prisma.inventoryItem.findMany({ where: { userId }, select: { cardId: true, variant: true, quantity: true } });
  const values = await getDynamicCardValuesBatch(items.map((i) => ({ cardId: i.cardId, variant: i.variant })));
  return items.reduce((sum, item) => {
    const dynamic = values.get(`${item.cardId}:${item.variant}`);
    return sum + (dynamic?.unitPrice ?? 0) * item.quantity;
  }, 0);
}
