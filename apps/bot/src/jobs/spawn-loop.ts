import { EmbedBuilder, type Client } from "discord.js";
import { CaptureService, ConfigService } from "@rta/services";

const captureService = new CaptureService();
const configService = new ConfigService();

export async function startSpawnLoop(client: Client) {
  let nextAutoSpawnAt = Date.now();

  const runSpawn = async (channelId: string, forced: boolean) => {
    try {
      const card = await captureService.spawnRandomCard(channelId);
      const channel = await client.channels.fetch(channelId);
      if (channel && "send" in channel) {
        const rarityName = card.rarity?.name ?? '?';
        const embed = new EmbedBuilder()
          .setTitle('\u2753 Une carte mysterieuse est apparue !')
          .setDescription(`**Rarete :** ${rarityName}\n\nSauras-tu reconnaitre cette carte ?`)
          .setColor(0x5865F2);

        if (card.imageUrl) {
          embed.setImage(card.imageUrl);
        }

        await channel.send({
          content: forced
            ? "Apparition forcee par un admin ! Utilisez `/capture <nom>` pour l'attraper !"
            : "Utilisez `/capture <nom>` pour l'attraper !",
          embeds: [embed]
        });
      }
    } catch (error) {
      console.error("Spawn loop error", error);
    }
  };

  const tick = async () => {
    try {
      const cfg = await configService.getConfig();
      const intervalS = Math.max(5, cfg?.spawnIntervalS ?? 300);
      const channelId = cfg?.spawnChannelId || process.env.DISCORD_SPAWN_CHANNEL_ID;
      const forced = Boolean(cfg?.forceSpawnRequestedAt);
      const autoDue = Date.now() >= nextAutoSpawnAt;

      if (!channelId) {
        console.warn("Spawn loop skipped: no spawn channel configured");
      } else if (forced || autoDue) {
        await runSpawn(channelId, forced);
        nextAutoSpawnAt = Date.now() + intervalS * 1000;

        if (forced) {
          await configService.patchConfig({ forceSpawnRequestedAt: null });
        }
      }
    } catch (error) {
      console.error("Spawn loop tick error", error);
    }

    setTimeout(tick, 5000);
  };

  await tick();
}
