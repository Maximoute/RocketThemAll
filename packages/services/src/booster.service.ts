import { prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { CollectionService } from "./collection.service.js";
import { getEconomyConfig } from "./economy-config.js";

type BoosterTypeName = "basic" | "rare" | "epic" | "legendary";
type VariantName = "normal" | "shiny" | "holo";

const BOOSTER_RULES: Record<BoosterTypeName, Array<{ rarities: string[]; count: number }>> = {
  basic: [
    { rarities: ["Common"], count: 3 },
    { rarities: ["Uncommon"], count: 1 },
    { rarities: ["Rare"], count: 1 }
  ],
  rare: [
    { rarities: ["Uncommon"], count: 2 },
    { rarities: ["Rare"], count: 2 },
    { rarities: ["Very Rare", "Import", "Exotic", "Black Market", "Limited"], count: 1 }
  ],
  epic: [
    { rarities: ["Rare"], count: 1 },
    { rarities: ["Very Rare"], count: 2 },
    { rarities: ["Import"], count: 1 },
    { rarities: ["Exotic", "Black Market", "Limited"], count: 1 }
  ],
  legendary: [
    { rarities: ["Very Rare"], count: 1 },
    { rarities: ["Import"], count: 2 },
    { rarities: ["Exotic"], count: 1 },
    { rarities: ["Black Market", "Limited"], count: 1 }
  ]
};

export class BoosterService {
  private readonly collectionService = new CollectionService();

  private async migrateLegacyBoosters(userId: string) {
    const legacy = await prisma.booster.findUnique({ where: { userId } });
    if (!legacy) return;

    const basic = Math.max(0, legacy.basicQuantity ?? 0);
    const rare = Math.max(0, legacy.rareQuantity ?? 0);
    const epic = Math.max(0, legacy.epicQuantity ?? 0);
    if (basic === 0 && rare === 0 && epic === 0) return;

    await prisma.$transaction(async (tx) => {
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

  async buyBooster(userId: string, type: BoosterTypeName) {
    const config = await getEconomyConfig();
    const price = this.getBoosterPrice(config, type);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("User not found", 404);
    }
    if (user.credits < price) {
      throw new AppError("Crédits insuffisants", 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { credits: { decrement: price } } });
      await tx.userBooster.upsert({ where: { userId_boosterType: { userId, boosterType: type } }, update: { quantity: { increment: 1 } }, create: { userId, boosterType: type, quantity: 1 } });
      await tx.transactionLog.create({ data: { userId, type: "booster", amount: -price, metadata: { action: "buy", boosterType: type } } });
      await tx.economyLog.create({ data: { userId, type: "buy_booster", amount: price, metadata: { boosterType: type } } });
    });

    return { type, price };
  }

  async craftBooster(userId: string) {
    const config = await getEconomyConfig();
    const cost = config.craftBoosterFragmentCost;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404);
    if (user.fragments < cost) throw new AppError("Fragments insuffisants", 409);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { fragments: { decrement: cost } } });
      await tx.userBooster.upsert({ where: { userId_boosterType: { userId, boosterType: "basic" } }, update: { quantity: { increment: 1 } }, create: { userId, boosterType: "basic", quantity: 1 } });
      await tx.transactionLog.create({ data: { userId, type: "craft", amount: -cost, metadata: { reward: "basic" } } });
      await tx.economyLog.create({ data: { userId, type: "buy_booster", amount: cost, metadata: { action: "craft", reward: "basic" } } });
    });

    return { cost, boosterType: "basic" as const };
  }

  async openBooster(userId: string, type: BoosterTypeName = "basic", guildId?: string) {
    await this.migrateLegacyBoosters(userId);
    const booster = await prisma.userBooster.findUnique({ where: { userId_boosterType: { userId, boosterType: type } } });
    if (!booster || booster.quantity <= 0) {
      throw new AppError("Aucun booster disponible", 409);
    }

    const config = await getEconomyConfig();
    const upgradedType = this.rollJackpotUpgrade(type, config);
    
    let allowedDecks: string[] = [];
    if (guildId) {
      const guildConfig = await prisma.botGuildConfig.findUnique({ where: { guildId } });
      if (guildConfig?.allowedDecks && guildConfig.allowedDecks.length > 0) {
        allowedDecks = guildConfig.allowedDecks;
      }
    }
    
    const cards = await this.drawBoosterCards(upgradedType, allowedDecks);
    const withVariant = cards.map((card) => ({ card, variant: this.rollVariant(config) }));

    await prisma.$transaction(async (tx) => {
      await tx.userBooster.update({ where: { userId_boosterType: { userId, boosterType: type } }, data: { quantity: { decrement: 1 } } });

      for (const row of withVariant) {
        await tx.inventoryItem.upsert({
          where: { userId_cardId_variant: { userId, cardId: row.card.id, variant: row.variant } },
          update: { quantity: { increment: 1 } },
          create: { userId, cardId: row.card.id, variant: row.variant, quantity: 1 }
        });
      }

      await tx.transactionLog.create({ data: { userId, type: "booster", amount: cards.length, metadata: { action: "open", boosterType: type, effectiveType: upgradedType } } });
      await tx.economyLog.create({ data: { userId, type: "open_booster", amount: cards.length, metadata: { boosterType: type, effectiveType: upgradedType } } });
      if (upgradedType !== type) {
        await tx.economyLog.create({ data: { userId, type: "jackpot", metadata: { from: type, to: upgradedType } } });
      }
    });

    await this.collectionService.grantCollectionRewards(userId);

    return { cards: withVariant, upgradedType };
  }

  private pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private getBoosterPrice(config: Awaited<ReturnType<typeof getEconomyConfig>>, type: BoosterTypeName) {
    if (type === "basic") return config.basicBoosterPrice;
    if (type === "rare") return config.rareBoosterPrice;
    if (type === "epic") return config.epicBoosterPrice;
    return config.legendaryBoosterPrice;
  }

  private rollVariant(config: Awaited<ReturnType<typeof getEconomyConfig>>): VariantName {
    const roll = Math.random();
    const normal = Math.max(0, config.normalVariantRate);
    const shiny = Math.max(0, config.shinyVariantRate);
    const holo = Math.max(0, config.holoVariantRate);
    const total = normal + shiny + holo;
    const normalized = total > 0 ? roll * total : roll;

    if (normalized <= normal) return "normal";
    if (normalized <= normal + shiny) return "shiny";
    return "holo";
  }

  private rollJackpotUpgrade(type: BoosterTypeName, config: Awaited<ReturnType<typeof getEconomyConfig>>): BoosterTypeName {
    const roll = Math.random();
    if (type === "basic") {
      if (roll <= config.basicToLegendaryJackpotRate) return "legendary";
      if (roll <= config.basicToLegendaryJackpotRate + config.basicToEpicJackpotRate) return "epic";
      if (roll <= config.basicToLegendaryJackpotRate + config.basicToEpicJackpotRate + config.basicToRareJackpotRate) return "rare";
      return "basic";
    }
    if (type === "rare") {
      if (roll <= config.rareToLegendaryJackpotRate) return "legendary";
      if (roll <= config.rareToLegendaryJackpotRate + config.rareToEpicJackpotRate) return "epic";
      return "rare";
    }
    if (type === "epic") {
      if (roll <= config.epicToLegendaryJackpotRate) return "legendary";
      return "epic";
    }
    return "legendary";
  }

  private async drawBoosterCards(type: BoosterTypeName, allowedDecks: string[] = []) {
    const cards = [];
    for (const slot of BOOSTER_RULES[type]) {
      const where: any = {
        rarity: { name: { in: slot.rarities } },
        imageUrl: { not: null },
        spawnEnabled: true,
        blacklistReason: null,
        OR: [
          { category: null },
          { category: { notIn: ["blacklisted", "pending_image"] } }
        ]
      };
      if (allowedDecks.length > 0) {
        where.deck = { name: { in: allowedDecks } };
      }
      const pool = await prisma.card.findMany({ where, include: { rarity: true, deck: true } });
      if (pool.length < slot.count) {
        throw new AppError("Not enough cards to open booster", 500);
      }
      cards.push(...this.pickRandom(pool, slot.count));
    }
    return cards;
  }
}
