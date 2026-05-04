import { prisma } from "@rta/database";

export class ConfigService {
  async getConfig() {
    return prisma.appConfig.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        spawnIntervalS: 300,
        captureCooldownS: 5,
        autoSpawnEnabled: true,
        autoSpawnIntervalMinutes: 5,
        manualSpawnEnabled: true,
        manualSpawnCooldownMinutes: 120,
        manualSpawnMaxCharges: 4,
        manualSpawnRegenHours: 6
      }
    });
  }

  patchConfig(data: {
    spawnIntervalS?: number;
    captureCooldownS?: number;
    spawnChannelId?: string | null;
    forceSpawnRequestedAt?: Date | null;
    forceSpawnCardId?: string | null;
    forceSpawnGuildId?: string | null;
    autoSpawnEnabled?: boolean;
    autoSpawnIntervalMinutes?: number;
    manualSpawnEnabled?: boolean;
    manualSpawnCooldownMinutes?: number;
    manualSpawnMaxCharges?: number;
    manualSpawnRegenHours?: number;
  }) {
    const sanitized = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

    return prisma.appConfig.upsert({
      where: { id: "default" },
      update: sanitized,
      create: {
        id: "default",
        spawnIntervalS: 300,
        captureCooldownS: 5,
        autoSpawnEnabled: true,
        autoSpawnIntervalMinutes: 5,
        manualSpawnEnabled: true,
        manualSpawnCooldownMinutes: 120,
        manualSpawnMaxCharges: 4,
        manualSpawnRegenHours: 6,
        ...sanitized
      }
    });
  }

  listGuildConfigs() {
    return prisma.botGuildConfig.findMany({ orderBy: [{ isActive: "desc" }, { guildName: "asc" }] });
  }

  getGuildConfig(guildId: string) {
    return prisma.botGuildConfig.findUnique({ where: { guildId } });
  }

  upsertGuildConfig(data: {
    guildId: string;
    guildName: string;
    spawnChannelId?: string | null;
    isActive?: boolean;
    autoSpawnEnabled?: boolean;
    autoSpawnIntervalMinutes?: number;
  }) {
    return prisma.botGuildConfig.upsert({
      where: { guildId: data.guildId },
      update: {
        guildName: data.guildName,
        spawnChannelId: data.spawnChannelId,
        isActive: data.isActive ?? true,
        autoSpawnEnabled: data.autoSpawnEnabled ?? true,
        autoSpawnIntervalMinutes: data.autoSpawnIntervalMinutes ?? 5
      },
      create: {
        guildId: data.guildId,
        guildName: data.guildName,
        spawnChannelId: data.spawnChannelId,
        isActive: data.isActive ?? true,
        autoSpawnEnabled: data.autoSpawnEnabled ?? true,
        autoSpawnIntervalMinutes: data.autoSpawnIntervalMinutes ?? 5
      }
    });
  }

  markGuildInactive(guildId: string) {
    return prisma.botGuildConfig.updateMany({
      where: { guildId },
      data: { isActive: false }
    });
  }

  async syncGuilds(guilds: Array<{ guildId: string; guildName: string }>) {
    const activeIds = guilds.map((guild) => guild.guildId);

    await prisma.$transaction(async (tx) => {
      for (const guild of guilds) {
        await tx.botGuildConfig.upsert({
          where: { guildId: guild.guildId },
          update: { guildName: guild.guildName, isActive: true },
          create: {
            guildId: guild.guildId,
            guildName: guild.guildName,
            isActive: true,
            autoSpawnEnabled: true,
            autoSpawnIntervalMinutes: 5
          }
        });
      }

      if (activeIds.length > 0) {
        await tx.botGuildConfig.updateMany({
          where: { guildId: { notIn: activeIds } },
          data: { isActive: false }
        });
      }
    });
  }
}
