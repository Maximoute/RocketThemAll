import { prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { applyXpGain, xpForRarity } from "./xp.service.js";
import { SpawnEnergyService } from "./spawn-energy.service.js";

type SpawnKind = "auto" | "manual" | "admin";

const ACTIVE_SPAWN_TTL_MINUTES = 5;
const MANUAL_SPAWN_PRIVATE_WINDOW_MINUTES = 2;

export class SpawnService {
  private readonly spawnEnergyService = new SpawnEnergyService();

  private normalizeName(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[’'`]/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractAcceptedNames(card: { name: string; acceptedNames?: unknown }) {
    const normalized = new Set<string>([this.normalizeName(card.name)]);
    if (Array.isArray(card.acceptedNames)) {
      for (const alias of card.acceptedNames) {
        if (typeof alias === "string" && alias.trim()) {
          normalized.add(this.normalizeName(alias));
        }
      }
    }
    return normalized;
  }

  private rollVariant(config: { normalVariantRate: number; shinyVariantRate: number; holoVariantRate: number }) {
    const roll = Math.random();
    const total = config.normalVariantRate + config.shinyVariantRate + config.holoVariantRate;
    const scaled = roll * (total > 0 ? total : 1);
    if (scaled <= config.normalVariantRate) return "normal" as const;
    if (scaled <= config.normalVariantRate + config.shinyVariantRate) return "shiny" as const;
    return "holo" as const;
  }

  private async pickRandomCards(count: number, allowedDecks?: string[]) {
    const deckFilter = allowedDecks && allowedDecks.length > 0 ? { deck: { name: { in: allowedDecks } } } : {};
    const cards = await prisma.card.findMany({ where: deckFilter, include: { rarity: true, deck: true } });
    const spawnableCards = cards.filter((card) => {
      const hasImage = Boolean(card.imageUrl);
      const enabled = card.spawnEnabled !== false;
      const notBlacklisted = card.blacklistReason == null && card.category !== "blacklisted" && card.category !== "pending_image";
      return hasImage && enabled && notBlacklisted;
    });
    if (spawnableCards.length === 0) {
      throw new AppError("No cards available for spawn", 500);
    }

    const chosen: typeof cards = [];
    const safeCount = Math.max(1, Math.min(count, spawnableCards.length));

    for (let i = 0; i < safeCount; i++) {
      const totalWeight = spawnableCards.reduce((sum, c) => sum + (c.rarity.weight ?? 1), 0);
      let roll = Math.random() * totalWeight;
      let picked = spawnableCards[spawnableCards.length - 1];

      for (const card of spawnableCards) {
        roll -= (card.rarity.weight ?? 1);
        if (roll <= 0) {
          picked = card;
          break;
        }
      }

      chosen.push(picked);
    }

    return chosen;
  }

  async expireOldSpawns(ttlMinutes = ACTIVE_SPAWN_TTL_MINUTES) {
    const cutoff = new Date(Date.now() - Math.max(1, ttlMinutes) * 60_000);
    await prisma.spawnLog.updateMany({
      where: {
        status: "active",
        createdAt: { lt: cutoff }
      },
      data: { status: "expired" }
    });
  }

  async getActiveSpawn(channelId?: string) {
    return prisma.spawnLog.findMany({
      where: {
        status: "active",
        ...(channelId ? { channelId } : {})
      },
      include: { card: { include: { rarity: true, deck: true } } },
      orderBy: { createdAt: "asc" }
    });
  }

  async cancelActiveSpawn(channelId: string) {
    const result = await prisma.spawnLog.updateMany({
      where: { channelId, status: "active" },
      data: { status: "cancelled" }
    });
    return result.count;
  }

  private async ensureNoActiveSpawn(channelId: string) {
    const activeSpawns = await prisma.spawnLog.findMany({
      where: { channelId, status: "active" },
      include: { card: true },
      orderBy: { createdAt: "asc" }
    });

    if (activeSpawns.length > 0) {
      const activeNames = activeSpawns.map((spawn) => spawn.card.name).join(", ");
      throw new AppError(`Des cartes sont déjà actives dans ce salon: ${activeNames}. Capture-les avant d’en faire apparaître de nouvelles.`, 409);
    }
  }

  private async createSpawnBatch(
    channelId: string,
    cardsCount: number,
    spawnType: SpawnKind,
    userId?: string,
    forcedCards?: Array<{ id: string }>,
    options?: { skipActiveCheck?: boolean },
    allowedDecks?: string[]
  ) {
    await this.expireOldSpawns();
    if (!options?.skipActiveCheck) {
      await this.ensureNoActiveSpawn(channelId);
    }

    const cards = forcedCards
      ? await prisma.card.findMany({ where: { id: { in: forcedCards.map((c) => c.id) } }, include: { rarity: true, deck: true } })
      : await this.pickRandomCards(cardsCount, allowedDecks);

    const nonSpawnable = cards.find((card) => {
      const hasImage = Boolean(card.imageUrl);
      const enabled = card.spawnEnabled !== false;
      const blacklisted = card.blacklistReason != null || card.category === "blacklisted" || card.category === "pending_image";
      return !hasImage || !enabled || blacklisted;
    });
    if (nonSpawnable) {
      throw new AppError(`Card ${nonSpawnable.name} is not spawnable`, 409);
    }
    const createdAt = new Date();

    if (cards.length === 0) {
      throw new AppError("No cards available for spawn", 500);
    }

    await prisma.$transaction(async (tx) => {
      for (const card of cards) {
        await tx.spawnLog.create({
          data: {
            userId,
            spawnType,
            cardId: card.id,
            channelId,
            createdAt,
            status: "active"
          }
        });
      }
    });

    return { cards, createdAt };
  }

  async createAutoSpawn(channelId: string, guildId?: string) {
    let allowedDecks: string[] | undefined;
    if (guildId) {
      const guildConfig = await prisma.botGuildConfig.findUnique({ where: { guildId } });
      if (guildConfig?.allowedDecks?.length) allowedDecks = guildConfig.allowedDecks;
    }
    const batch = await this.createSpawnBatch(channelId, 1, "auto", undefined, undefined, undefined, allowedDecks);
    return batch.cards;
  }

  async createAdminSpawn(channelId: string, adminUserId?: string, cardId?: string) {
    if (!cardId) {
      const batch = await this.createSpawnBatch(channelId, 1, "admin", adminUserId);
      return batch.cards;
    }

    const forcedCard = await prisma.card.findUnique({ where: { id: cardId } });
    if (!forcedCard) {
      throw new AppError("Card not found", 404);
    }

    const batch = await this.createSpawnBatch(channelId, 1, "admin", adminUserId, [{ id: cardId }]);
    return batch.cards;
  }

  async createManualSpawn(userId: string, channelId: string, options?: { consumeCharge?: boolean; spawnType?: SpawnKind }) {
    const config = await prisma.appConfig.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        manualSpawnEnabled: true,
        manualSpawnMaxCharges: 4,
        manualSpawnRegenHours: 6
      }
    });

    if (!config.manualSpawnEnabled) {
      throw new AppError("Le spawn manuel est désactivé.", 403);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const spawnType = options?.spawnType ?? "manual";
    await this.expireOldSpawns();
    const energy = options?.consumeCharge === false
      ? await this.spawnEnergyService.getUserSpawnCharges(userId)
      : await this.spawnEnergyService.consumeSpawnCharge(userId);
    const batch = await this.createSpawnBatch(channelId, 3, spawnType, userId, undefined, { skipActiveCheck: true });

    return {
      cards: batch.cards,
      energy,
      spawnCreatedAt: batch.createdAt,
      privateUntil: new Date(batch.createdAt.getTime() + MANUAL_SPAWN_PRIVATE_WINDOW_MINUTES * 60_000),
      publicUntil: new Date(batch.createdAt.getTime() + ACTIVE_SPAWN_TTL_MINUTES * 60_000)
    };
  }

  async resolveSpawn(capturingUserId: string, channelId: string, cardName: string) {
    await this.expireOldSpawns();
    const active = await this.getActiveSpawn(channelId);
    if (active.length === 0) {
      throw new AppError("No active spawn in this channel", 404);
    }

    const normalized = this.normalizeName(cardName);
    const match = active.find((entry) => this.extractAcceptedNames(entry.card).has(normalized));

    if (!match) {
      throw new AppError("Wrong card name", 409);
    }

    if (match.spawnType === "manual" && match.userId && match.userId !== capturingUserId) {
      const privateUntil = new Date(match.createdAt.getTime() + MANUAL_SPAWN_PRIVATE_WINDOW_MINUTES * 60_000);
      const remainingMs = privateUntil.getTime() - Date.now();
      if (remainingMs > 0) {
        const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
        throw new AppError(`Ce spawn est privé pendant encore ${remainingSec}s pour son lanceur.`, 403);
      }
    }

    const user = await prisma.user.findUnique({ where: { id: capturingUserId } });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const gainedXp = match.card.xpReward || xpForRarity(match.card.rarity.name as never);
    const progress = applyXpGain(user.level, user.xp, gainedXp);
    const economyConfig = await prisma.appConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
    const variant = this.rollVariant(economyConfig);

    await prisma.$transaction(async (tx) => {
      await tx.spawnLog.update({
        where: { id: match.id },
        data: {
          status: "captured",
          capturedAt: new Date(),
          capturedById: capturingUserId
        }
      });

      await tx.user.update({
        where: { id: capturingUserId },
        data: { level: progress.level, xp: progress.xp }
      });

      await tx.captureLog.create({
        data: {
          userId: capturingUserId,
          cardId: match.card.id,
          channelId
        }
      });

      await tx.inventoryItem.upsert({
        where: { userId_cardId_variant: { userId: capturingUserId, cardId: match.card.id, variant } },
        update: { quantity: { increment: 1 } },
        create: { userId: capturingUserId, cardId: match.card.id, variant, quantity: 1 }
      });

      if (progress.levelsGained > 0) {
        await tx.userBooster.upsert({
          where: { userId_boosterType: { userId: capturingUserId, boosterType: "basic" } },
          update: { quantity: { increment: progress.levelsGained } },
          create: { userId: capturingUserId, boosterType: "basic", quantity: progress.levelsGained }
        });
      }

      await tx.economyLog.create({ data: { userId: capturingUserId, type: "open_booster", metadata: { action: "capture_variant", cardId: match.card.id, variant } } });
    });

    return {
      card: match.card,
      gainedXp,
      level: progress.level,
      xp: progress.xp,
      boostersGained: progress.levelsGained,
      variant
    };
  }
}
