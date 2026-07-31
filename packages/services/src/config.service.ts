import { prisma } from "@rta/database";

export class ConfigService {
  async getConfig() {
    return prisma.appConfig.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" }
    });
  }

  patchConfig(data: {
    fusionEnabled?: boolean;
    craftBoosterFragmentCost?: number;
    dailyCreditMin?: number;
    dailyCreditMax?: number;
    dailyBoosterChance?: number;
    captureConsumableDropRate?: number;
    captureConsumableCommonWeight?: number;
    captureConsumableUncommonWeight?: number;
    captureConsumableRareWeight?: number;
    captureConsumableEpicWeight?: number;
    captureConsumableLegendaryWeight?: number;
  }) {
    const sanitized = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    );

    return prisma.appConfig.upsert({
      where: { id: "default" },
      update: sanitized,
      create: { id: "default", ...sanitized }
    });
  }

  listGuildConfigs() {
    return prisma.guild.findMany({
      include: { config: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    });
  }

  getGuildConfig(discordId: string) {
    return prisma.guild.findUnique({
      where: { discordId },
      include: { config: true }
    });
  }

  async upsertGuildConfig(data: {
    guildId: string;
    guildName: string;
    gameChannelId?: string | null;
    isActive?: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      const guild = await tx.guild.upsert({
        where: { discordId: data.guildId },
        update: {
          name: data.guildName,
          isActive: data.isActive
        },
        create: {
          discordId: data.guildId,
          name: data.guildName,
          isActive: data.isActive ?? true
        }
      });
      await tx.guildConfiguration.upsert({
        where: { guildId: guild.id },
        update: data.gameChannelId === undefined ? {} : {
          gameChannelId: data.gameChannelId,
          version: { increment: 1 }
        },
        create: {
          guildId: guild.id,
          gameChannelId: data.gameChannelId ?? null
        }
      });
      return tx.guild.findUniqueOrThrow({
        where: { id: guild.id },
        include: { config: true }
      });
    });
  }

  markGuildInactive(discordId: string) {
    return prisma.guild.updateMany({
      where: { discordId },
      data: { isActive: false }
    });
  }

  async getGameGuild(discordGuildId: string) {
    return prisma.guild.findUnique({
      where: { discordId: discordGuildId },
      include: {
        config: true,
        progress: true
      }
    });
  }

  async syncGuilds(guilds: Array<{ guildId: string; guildName: string }>) {
    const activeIds = guilds.map((guild) => guild.guildId);

    await prisma.$transaction(async (tx) => {
      const worlds = await tx.worldDefinition.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { position: "asc" }
      });
      const firstWorld = worlds[0];

      for (const entry of guilds) {
        const gameGuild = await tx.guild.upsert({
          where: { discordId: entry.guildId },
          update: { name: entry.guildName, isActive: true },
          create: {
            discordId: entry.guildId,
            name: entry.guildName,
            isActive: true
          }
        });
        await tx.guildConfiguration.upsert({
          where: { guildId: gameGuild.id },
          update: {},
          create: { guildId: gameGuild.id }
        });

        if (firstWorld) {
          await tx.guildProgress.upsert({
            where: { guildId: gameGuild.id },
            update: {},
            create: {
              guildId: gameGuild.id,
              state: "PROGRESSING",
              frontierWorldId: firstWorld.id,
              mastery: 0,
              masteryTarget: 250,
              unlockedWorldCount: 1
            }
          });

          for (const world of worlds) {
            const unlocked = world.position === 1;
            await tx.guildWorldProgress.upsert({
              where: {
                guildId_worldId: {
                  guildId: gameGuild.id,
                  worldId: world.id
                }
              },
              update: {},
              create: {
                guildId: gameGuild.id,
                worldId: world.id,
                state: unlocked ? "PROGRESSING" : "LOCKED",
                unlockedAt: unlocked ? new Date() : null
              }
            });
          }
        }
      }

      if (activeIds.length > 0) {
        await tx.guild.updateMany({
          where: { discordId: { notIn: activeIds } },
          data: { isActive: false }
        });
      }
    });
  }
}
