import { EmbedBuilder, type Client } from "discord.js";
import { prisma } from "./commands/service-instances.js";
import { bossProgressBar } from "./commands/boss-progress.js";
import { attachBossImage } from "./commands/handlers/v2-views.js";

const SYNCHRONIZATION_INTERVAL_MS = 15_000;
const ANNOUNCEMENT_RECLAIM_MS = 2 * 60 * 1_000;

let synchronizationRunning = false;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isExpiredClaim(messageId: string | null) {
  if (!messageId?.startsWith("PROCESSING:")) return false;
  const timestamp = Number(messageId.split(":")[1]);
  return Number.isFinite(timestamp) && timestamp < Date.now() - ANNOUNCEMENT_RECLAIM_MS;
}

export async function syncBossAnnouncements(client: Client) {
  if (synchronizationRunning) return;
  synchronizationRunning = true;

  try {
    const runs = await prisma.bossRun.findMany({
      where: {
        status: "ACTIVE",
        endsAt: { gt: new Date() },
        guild: {
          isActive: true,
          config: {
            is: {
              bossAnnouncementEnabled: true,
              bossAnnouncementChannelId: { not: null }
            }
          }
        },
        OR: [
          { messageId: null },
          { messageId: { startsWith: "PROCESSING:" } }
        ]
      },
      include: {
        guild: { include: { config: true } },
        definition: { include: { world: true } }
      },
      orderBy: { startsAt: "asc" },
      take: 100
    });

    for (const run of runs) {
      const config = run.guild.config;
      const channelId = config?.bossAnnouncementEnabled
        ? config.bossAnnouncementChannelId
        : null;
      if (!channelId || channelId === config?.hallOfFameChannelId) continue;
      if (run.messageId && !isExpiredClaim(run.messageId)) continue;

      const claimId = `PROCESSING:${Date.now()}:${process.pid}`;
      const claim = await prisma.bossRun.updateMany({
        where: {
          id: run.id,
          status: "ACTIVE",
          messageId: run.messageId
        },
        data: {
          channelId,
          messageId: claimId,
          version: { increment: 1 }
        }
      });
      if (claim.count !== 1) continue;

      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) {
          throw new Error("Le salon d’annonce des boss n’est pas un salon texte.");
        }
        if (channel.guildId !== run.guild.discordId) {
          throw new Error("Le salon d’annonce des boss n’appartient pas à ce serveur.");
        }

        const objective = record(run.objectiveSnapshot);
        const endTimestamp = Math.floor(run.endsAt.getTime() / 1_000);
        const embed = new EmbedBuilder()
          .setColor(0xc0392b)
          .setTitle(`🐲 Un boss apparaît — ${run.definition.name}`)
          .setDescription(
            `${String(objective.label ?? "Un nouveau défi communautaire commence.")}\n\n` +
            `${bossProgressBar(run.progress, run.targetSnapshot)}\n` +
            `**${run.progress}/${run.targetSnapshot}** points`
          )
          .addFields(
            {
              name: "Monde",
              value: run.definition.world?.name ?? "Monde inconnu",
              inline: true
            },
            {
              name: run.isPersistent ? "Durée" : "Disponible jusqu’au",
              value: run.isPersistent
                ? "Persistant · reste actif jusqu’à sa défaite"
                : `<t:${endTimestamp}:R>\n<t:${endTimestamp}:F>`,
              inline: true
            },
            {
              name: "Comment participer",
              value: "Utilise `/boss` pour voir les besoins exacts et contribuer."
            }
          )
          .setFooter({ text: "Rocket Them All • Boss communautaire" })
          .setTimestamp();
        const files = await attachBossImage(embed, run.definition);
        const message = await channel.send({
          embeds: [embed],
          files,
          allowedMentions: { parse: [] }
        });

        await prisma.bossRun.updateMany({
          where: { id: run.id, messageId: claimId },
          data: { messageId: message.id, channelId }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur d’annonce de boss";
        await prisma.bossRun.updateMany({
          where: { id: run.id, messageId: claimId },
          data: { messageId: null }
        });
        console.error("Boss announcement failed", {
          bossRunId: run.id,
          channelId,
          error: message
        });
      }
    }
  } catch (error) {
    console.error("Boss announcement synchronization failed", error);
  } finally {
    synchronizationRunning = false;
  }
}

export function registerBossAnnouncementSynchronization(client: Client) {
  void syncBossAnnouncements(client);
  const timer = setInterval(() => {
    void syncBossAnnouncements(client);
  }, SYNCHRONIZATION_INTERVAL_MS);
  timer.unref();
}
