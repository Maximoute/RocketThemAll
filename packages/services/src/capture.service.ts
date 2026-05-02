import { prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { CollectionService } from "./collection.service.js";
import { SpawnService } from "./spawn.service.js";

export class CaptureService {
  private static userCooldown = new Map<string, number>();
  private readonly spawnService = new SpawnService();
  private readonly collectionService = new CollectionService();

  async spawnRandomCard(channelId: string) {
    const cards = await this.spawnService.createAutoSpawn(channelId);
    return cards[0];
  }

  async spawnCardById(channelId: string, cardId: string) {
    const cards = await this.spawnService.createAdminSpawn(channelId, undefined, cardId);
    return cards[0];
  }

  async capture(userId: string, channelId: string, cardName: string) {
    const config = await prisma.appConfig.findUnique({ where: { id: "default" } });
    const cooldownS = config?.captureCooldownS ?? 5;
    const lastTry = CaptureService.userCooldown.get(userId) ?? 0;
    if (Date.now() - lastTry < cooldownS * 1000) {
      throw new AppError("Capture cooldown active", 429);
    }
    CaptureService.userCooldown.set(userId, Date.now());

    const resolved = await this.spawnService.resolveSpawn(userId, channelId, cardName);
    await this.collectionService.grantCollectionRewards(userId);

    return {
      caught: true as const,
      card: resolved.card,
      gainedXp: resolved.gainedXp,
      level: resolved.level,
      xp: resolved.xp,
      boostersGained: resolved.boostersGained
    };
  }

  async getSpawnState(channelId: string) {
    return this.spawnService.getActiveSpawn(channelId);
  }
}
