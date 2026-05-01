import { prisma } from "@rta/database";

export class ConfigService {
  getConfig() {
    return prisma.appConfig.findUnique({ where: { id: "default" } });
  }

  patchConfig(data: {
    spawnIntervalS?: number;
    captureCooldownS?: number;
    spawnChannelId?: string | null;
    forceSpawnRequestedAt?: Date | null;
    forceSpawnCardId?: string | null;
  }) {
    return prisma.appConfig.update({
      where: { id: "default" },
      data
    });
  }
}
