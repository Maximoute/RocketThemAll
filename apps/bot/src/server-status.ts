import { EmbedBuilder, type Client } from "discord.js";
import { prisma } from "./commands/service-instances.js";

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

    const guilds = await prisma.guild.findMany({
      where: { isActive: true },
      include: {
        progress: { include: { frontierWorld: true } },
        bossRuns: {
          where: { status: "ACTIVE", endsAt: { gt: new Date() } },
          select: { id: true, isPersistent: true }
        }
      },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }]
    });
    const lines = guilds.map((guild) => {
      const progress = guild.progress;
      const mastery = Math.max(0, progress?.mastery ?? 0);
      const target = Math.max(0, progress?.masteryTarget ?? 0);
      const percent = target > 0 ? Math.min(100, Math.round((mastery / target) * 100)) : 0;
      const activeDaily = guild.bossRuns.some((run) => !run.isPersistent);
      const activeGuardian = guild.bossRuns.some((run) => run.isPersistent);
      const bosses = [activeDaily ? "boss journalier" : "", activeGuardian ? "gardien" : ""]
        .filter(Boolean)
        .join(" + ") || "aucun boss actif";
      return `**${guild.isPrimary ? "⭐ " : ""}${guild.name}**\n` +
        `🌍 ${progress?.frontierWorld?.name ?? "Monde 1"} · ${percent} % · ${mastery}/${target || "?"} · ${stateLabel(progress?.state)}\n` +
        `🐲 ${bosses} · mondes débloqués ${Math.max(1, progress?.unlockedWorldCount ?? 1)}/9`;
    });
    let description = "";
    for (const line of lines) {
      if (`${description}\n\n${line}`.length > 3_900) break;
      description += `${description ? "\n\n" : ""}${line}`;
    }
    const embed = new EmbedBuilder()
      .setColor(0x6b3fd4)
      .setTitle("🚀 État des serveurs Rocket Them All")
      .setDescription(description || "Aucun serveur actif.")
      .setFooter({ text: `Actualisation automatique · ${guilds.length} serveur(s) actif(s)` })
      .setTimestamp();

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
        await message.edit({ embeds: [embed], allowedMentions: { parse: [] } });
      } catch {
        messageId = null;
      }
    }
    if (!messageId) {
      const message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
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
