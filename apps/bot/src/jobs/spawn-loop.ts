import { EmbedBuilder, type Client } from "discord.js";
import { AppError, ConfigService, SpawnService } from "@rta/services";

const configService = new ConfigService();
const spawnService = new SpawnService();

async function announceSpawn(client: Client, channelId: string, cards: Array<{ imageUrl: string | null; rarity: { name: string } }>, kind: "auto" | "admin") {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !("send" in channel)) {
    return;
  }

  const title = cards.length > 1 ? "3 cartes mysterieuses sont apparues !" : "Une carte mysterieuse est apparue !";
  const rarityText = cards.map((card, index) => `Carte ${index + 1}: ${card.rarity?.name ?? "?"}`).join("\n");
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`**Rarete :**\n${rarityText}\n\nUtilisez /capture <nom> pour tenter votre chance.`)
    .setColor(kind === "admin" ? 0xF59E0B : 0x5865F2);

  if (cards.length === 1 && cards[0]?.imageUrl) {
    embed.setImage(cards[0].imageUrl);
  }

  await channel.send({
    content: kind === "admin"
      ? "Apparition forcee par un admin !"
      : "Spawn automatique !",
    embeds: [embed]
  });
}

export async function startSpawnLoop(client: Client) {
  let fallbackNextAutoSpawnAt = Date.now();
  const nextAutoSpawnAtByGuild = new Map<string, number>();

  const runSpawn = async (channelId: string, forced: boolean, forcedCardId?: string | null, guildId?: string) => {
    try {
      const cards = forced
        ? await spawnService.createAdminSpawn(channelId, undefined, forcedCardId ?? undefined)
        : await spawnService.createAutoSpawn(channelId, guildId);

      if (cards.length > 0) {
        await announceSpawn(client, channelId, cards, forced ? "admin" : "auto");
      }
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 409) {
        return;
      }
      console.error("Spawn loop error", error);
    }
  };

  const tick = async () => {
    try {
      const cfg = await configService.getConfig();
      const guildConfigs = await configService.listGuildConfigs();
      const forced = Boolean(cfg?.forceSpawnRequestedAt);
      const forcedCardId = cfg?.forceSpawnCardId ?? null;
      const forcedGuildId = cfg?.forceSpawnGuildId ?? null;
      const now = Date.now();
      await spawnService.expireOldSpawns();
      const configuredChannels = guildConfigs
        .filter((guild) => guild.isActive && guild.spawnChannelId)
        .map((guild) => ({
          guildId: guild.guildId,
          guildName: guild.guildName,
          channelId: guild.spawnChannelId as string,
          autoSpawnEnabled: guild.autoSpawnEnabled,
          autoSpawnIntervalMinutes: Math.max(1, guild.autoSpawnIntervalMinutes ?? cfg.autoSpawnIntervalMinutes ?? Math.round((cfg?.spawnIntervalS ?? 300) / 60))
        }));

      const activeGuildIds = new Set(configuredChannels.map((guild) => guild.guildId));
      for (const guildId of Array.from(nextAutoSpawnAtByGuild.keys())) {
        if (!activeGuildIds.has(guildId)) {
          nextAutoSpawnAtByGuild.delete(guildId);
        }
      }

      if (configuredChannels.length === 0 && !process.env.DISCORD_SPAWN_CHANNEL_ID) {
        console.warn("Spawn loop skipped: no spawn channel configured");
      } else if (forced) {
        const forcedTargets = configuredChannels.length > 0
          ? (forcedGuildId
              ? configuredChannels.filter((guild) => guild.guildId === forcedGuildId)
              : configuredChannels)
          : (process.env.DISCORD_SPAWN_CHANNEL_ID ? [{ channelId: process.env.DISCORD_SPAWN_CHANNEL_ID, guildId: undefined }] : []);

        if (forcedTargets.length === 0) {
          console.warn(`Forced spawn requested but no target channel was found${forcedGuildId ? ` for guild ${forcedGuildId}` : ""}`);
          await configService.patchConfig({ forceSpawnRequestedAt: null, forceSpawnCardId: null, forceSpawnGuildId: null });
          return;
        }

        for (const target of forcedTargets) {
          await runSpawn(target.channelId, true, forcedCardId, target.guildId);
        }

        await configService.patchConfig({ forceSpawnRequestedAt: null, forceSpawnCardId: null, forceSpawnGuildId: null });
      } else if (cfg.autoSpawnEnabled) {
        if (configuredChannels.length > 0) {
          const dueGuilds = configuredChannels.filter((guild) => {
            if (!guild.autoSpawnEnabled) return false;
            const nextAt = nextAutoSpawnAtByGuild.get(guild.guildId) ?? 0;
            return now >= nextAt;
          });

          for (const guild of dueGuilds) {
            await runSpawn(guild.channelId, false, null, guild.guildId);
            nextAutoSpawnAtByGuild.set(guild.guildId, now + guild.autoSpawnIntervalMinutes * 60_000);
          }
        } else if (process.env.DISCORD_SPAWN_CHANNEL_ID && now >= fallbackNextAutoSpawnAt) {
          await runSpawn(process.env.DISCORD_SPAWN_CHANNEL_ID as string, false, null, undefined);
          const intervalMinutes = Math.max(1, cfg?.autoSpawnIntervalMinutes ?? Math.round((cfg?.spawnIntervalS ?? 300) / 60));
          fallbackNextAutoSpawnAt = now + intervalMinutes * 60_000;
        }
      }
    } catch (error) {
      console.error("Spawn loop tick error", error);
    }

    setTimeout(tick, 5000);
  };

  await tick();
}
