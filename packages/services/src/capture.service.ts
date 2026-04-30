import { prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { applyXpGain, xpForRarity } from "./xp.service.js";

type SpawnState = {
  cardId: string;
  channelId: string;
  spawnedAt: number;
  captured: boolean;
};

export class CaptureService {
  private static currentSpawn: SpawnState | null = null;
  private static userCooldown = new Map<string, number>();

  async spawnRandomCard(channelId: string) {
    const cards = await prisma.card.findMany({ include: { rarity: true, deck: true } });
    if (cards.length === 0) {
      throw new AppError("No cards available for spawn", 500);
    }

    // Weighted random: rarer cards appear less often
    const totalWeight = cards.reduce((sum, c) => sum + (c.rarity.weight ?? 1), 0);
    let roll = Math.random() * totalWeight;
    let random = cards[cards.length - 1];
    for (const card of cards) {
      roll -= (card.rarity.weight ?? 1);
      if (roll <= 0) { random = card; break; }
    }

    CaptureService.currentSpawn = {
      cardId: random.id,
      channelId,
      spawnedAt: Date.now(),
      captured: false
    };

    return random;
  }

  async capture(userId: string, channelId: string, cardName: string) {
    const config = await prisma.appConfig.findUnique({ where: { id: "default" } });
    const cooldownS = config?.captureCooldownS ?? 5;
    const lastTry = CaptureService.userCooldown.get(userId) ?? 0;
    if (Date.now() - lastTry < cooldownS * 1000) {
      throw new AppError("Capture cooldown active", 429);
    }
    CaptureService.userCooldown.set(userId, Date.now());

    if (!CaptureService.currentSpawn || CaptureService.currentSpawn.channelId !== channelId || CaptureService.currentSpawn.captured) {
      throw new AppError("No active spawn in this channel", 404);
    }

    const card = await prisma.card.findUnique({
      where: { id: CaptureService.currentSpawn.cardId },
      include: { rarity: true }
    });

    if (!card || card.name.toLowerCase() !== cardName.toLowerCase()) {
      throw new AppError("Wrong card name", 409);
    }

    CaptureService.currentSpawn.captured = true;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const gainedXp = card.xpReward || xpForRarity(card.rarity.name as never);
    const progress = applyXpGain(user.level, user.xp, gainedXp);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { level: progress.level, xp: progress.xp }
      });

      await tx.captureLog.create({
        data: {
          userId,
          cardId: card.id,
          channelId
        }
      });

      await tx.inventoryItem.upsert({
        where: { userId_cardId: { userId, cardId: card.id } },
        update: { quantity: { increment: 1 } },
        create: { userId, cardId: card.id, quantity: 1 }
      });

      if (progress.levelsGained > 0) {
        await tx.booster.upsert({
          where: { userId },
          update: { quantity: { increment: progress.levelsGained } },
          create: { userId, quantity: progress.levelsGained }
        });
      }
    });

    return {
      card,
      gainedXp,
      level: progress.level,
      xp: progress.xp,
      boostersGained: progress.levelsGained
    };
  }

  getSpawnState() {
    return CaptureService.currentSpawn;
  }
}
