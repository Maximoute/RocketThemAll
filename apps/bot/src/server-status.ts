import { EmbedBuilder, type Client } from "discord.js";
import { prisma } from "./commands/service-instances.js";
import { rankServerEntries, serverProgressBar } from "./server-ranking.js";

const STATUS_INTERVAL_MS = 60_000;
let statusUpdateRunning = false;

function stateLabel(state: string | undefined) {
  return ({
    LOCKED: "verrouillé",
    PROGRESSING: "en progression",
    BOSS_READY: "gardien prêt",
    BOSS_ACTIVE: "gardien actif",
    BOSS_DEFEATED: "terminé"
  } as Record<string, string>)[state ?? ""] ?? "initialisation";
}

export async function syncServerStatus(client: Client) {
  if (statusUpdateRunning) return;
  statusUpdateRunning = true;
  try {
    const primary = await prisma.guild.findFirst({
      where: {
        isPrimary: true,
        isActive: true,
        config: {
          is: {
            serverStatusEnabled: true,
            serverStatusChannelId: { not: null }
          }
        }
      },
      include: { config: true }
    });
    const channelId = primary?.config?.serverStatusChannelId;
    if (!primary || !channelId) return;

    const connectedGuilds = [...client.guilds.cache.values()].filter((guild) => guild.available);
    const connectedById = new Map(connectedGuilds.map((guild) => [guild.id, guild]));
    const guilds = await prisma.guild.findMany({
      where: {
        isActive: true,
        discordId: { in: [...connectedById.keys()] }
      },
      include: {
        progress: { include: { frontierWorld: true } },
        bossRuns: {
          where: { status: "ACTIVE", endsAt: { gt: new Date() } },
          select: { id: true, isPersistent: true }
        }
      }
    });

    const ranked = rankServerEntries(guilds.map((guild) => {
      const discordGuild = connectedById.get(guild.discordId)!;
      return {
        guild,
        discordGuild,
        name: discordGuild.name,
        unlockedWorldCount: Math.max(1, guild.progress?.unlockedWorldCount ?? 1),
        mastery: Math.max(0, guild.progress?.mastery ?? 0),
        masteryTarget: Math.max(0, guild.progress?.masteryTarget ?? 0)
      };
    }));

    const visibleRanked = ranked.slice(0, 10);
    const embeds = visibleRanked.map((entry, index) => {
      const progress = entry.guild.progress;
      const activeDaily = entry.guild.bossRuns.some((run) => !run.isPersistent);
      const activeGuardian = entry.guild.bossRuns.some((run) => run.isPersistent);
      const bosses = [activeDaily ? "boss journalier" : "", activeGuardian ? "gardien" : ""]
        .filter(Boolean)
        .join(" + ") || "aucun boss actif";
      const medal = (["🥇", "🥈", "🥉"] as const)[entry.rank - 1] ?? `#${entry.rank}`;
      const iconUrl = entry.discordGuild.iconURL({ extension: "png", size: 128 });
      const color = ([0xffd700, 0xc0c0c0, 0xcd7f32] as const)[entry.rank - 1] ?? 0x6b3fd4;
      const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({
          name: `${medal} ${entry.name}${entry.guild.isPrimary ? " · serveur principal" : ""}`,
          ...(iconUrl ? { iconURL: iconUrl } : {})
        })
        .setDescription(
          `**Score de progression : ${entry.score} points** · ${entry.unlockedWorldCount}/9 mondes débloqués\n` +
          `🌍 ${progress?.frontierWorld?.name ?? "Monde 1"} · ${stateLabel(progress?.state)}\n` +
          `${serverProgressBar(entry.percent)} · ${entry.mastery}/${entry.masteryTarget || "?"} maîtrise\n` +
          `🐲 ${bosses}`
        );
      if (index === 0) embed.setTitle("🏆 Classement des serveurs Rocket Them All");
      if (index === visibleRanked.length - 1) {
        embed
          .setFooter({
            text: `Actualisation automatique · ${ranked.length} serveur(s) connecté(s)${ranked.length > 10 ? " · top 10 affiché" : ""}`
          })
          .setTimestamp();
      }
      return embed;
    });
    if (embeds.length === 0) {
      embeds.push(new EmbedBuilder()
        .setColor(0x6b3fd4)
        .setTitle("🏆 Classement des serveurs Rocket Them All")
        .setDescription("Aucun serveur n’est actuellement connecté au bot.")
        .setTimestamp());
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased() || !("messages" in channel)) {
      throw new Error("Le salon d’état des serveurs n’est pas un salon texte compatible.");
    }
    if (channel.guildId !== primary.discordId) {
      throw new Error("Le salon d’état n’appartient pas au serveur principal.");
    }

    let messageId = primary.config?.serverStatusMessageId ?? null;
    if (messageId) {
      try {
        const message = await channel.messages.fetch(messageId);
        await message.edit({ embeds, allowedMentions: { parse: [] } });
      } catch {
        messageId = null;
      }
    }
    if (!messageId) {
      const message = await channel.send({ embeds, allowedMentions: { parse: [] } });
      messageId = message.id;
    }
    await prisma.guildConfiguration.update({
      where: { guildId: primary.id },
      data: { serverStatusMessageId: messageId }
    });
  } catch (error) {
    console.error("Server status synchronization failed", error);
  } finally {
    statusUpdateRunning = false;
  }
}

export function registerServerStatusSynchronization(client: Client) {
  void syncServerStatus(client);
  const timer = setInterval(() => void syncServerStatus(client), STATUS_INTERVAL_MS);
  timer.unref();
}
