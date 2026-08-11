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

function bossTierLabel(value: unknown) {
  return ({
    common: "Commun",
    uncommon: "Peu commun",
    rare: "Rare",
    very_rare: "Très rare",
    import: "Import",
    exotic: "Exotique",
    black_market: "Marché noir"
  } as Record<string, string>)[String(value ?? "common")] ?? String(value ?? "Commun");
}

function bossTypeLabel(category: string, mechanic: string, guardian: boolean) {
  const categoryLabel = ({
    WORLD_GUARDIAN: "Gardien de monde",
    TREASURE_GUARDIAN: "Gardien de trésor",
    CARD_PREDATOR: "Prédateur de cartes",
    WORLD_INVADER: "Envahisseur de monde"
  } as Record<string, string>)[category] ?? category;
  const mechanicLabel = ({
    OFFERING: "Offrandes",
    HARMONIZATION: "Harmonisation",
    COLLECTIVE_COLLECTION: "Collection collective",
    HUNT: "Chasse",
    EXPEDITION_MINION: "Traces anormales"
  } as Record<string, string>)[mechanic] ?? mechanic;
  return `${guardian ? "Gardien persistant" : categoryLabel} · ${mechanicLabel}`;
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
        const reward = record(run.rewardSnapshot);
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
              name: "Tier du boss",
              value: bossTierLabel(reward.conquerorTier),
              inline: true
            },
            {
              name: "Type",
              value: run.definition.kind === "GUARDIAN" ? "Gardien de monde" : "Boss journalier",
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
    await syncBossVictoryAnnouncements(client);
  } catch (error) {
    console.error("Boss announcement synchronization failed", error);
  } finally {
    synchronizationRunning = false;
  }
}

async function syncBossVictoryAnnouncements(client: Client) {
  const primary = await prisma.guild.findFirst({
    where: {
      isPrimary: true,
      isActive: true,
      config: {
        is: {
          bossAnnouncementEnabled: true,
          bossAnnouncementChannelId: { not: null }
        }
      }
    },
    include: { config: true }
  });
  const channelId = primary?.config?.bossAnnouncementChannelId;
  if (!primary || !channelId) return;

  const defeatedRuns = await prisma.bossRun.findMany({
    where: {
      status: "DEFEATED",
      guild: { isActive: true },
      OR: [
        { victoryMessageId: null },
        { victoryMessageId: { startsWith: "PROCESSING:" } }
      ]
    },
    include: {
      guild: true,
      definition: { include: { world: true } },
      contributions: { include: { user: { select: { username: true } } } },
      rewardGrants: { include: { user: { select: { username: true } } } }
    },
    orderBy: { defeatedAt: "asc" },
    take: 50
  });

  for (const run of defeatedRuns) {
    if (run.victoryMessageId && !isExpiredClaim(run.victoryMessageId)) continue;
    const claimId = `PROCESSING:${Date.now()}:${process.pid}`;
    const claim = await prisma.bossRun.updateMany({
      where: { id: run.id, status: "DEFEATED", victoryMessageId: run.victoryMessageId },
      data: { victoryChannelId: channelId, victoryMessageId: claimId, version: { increment: 1 } }
    });
    if (claim.count !== 1) continue;

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        throw new Error("Le salon central d’alerte des boss n’est pas un salon texte.");
      }
      if (channel.guildId !== primary.discordId) {
        throw new Error("Le salon d’alerte des boss n’appartient pas au serveur principal.");
      }

      let credits = 0;
      let xp = 0;
      let fragments = 0;
      const drops = new Map<string, number>();
      for (const grant of run.rewardGrants) {
        const reward = record(grant.reward);
        credits += Math.max(0, Math.floor(Number(reward.credits ?? 0)));
        xp += Math.max(0, Math.floor(Number(reward.xp ?? 0)));
        fragments += Math.max(0, Math.floor(Number(reward.fragments ?? 0)));
        if (Array.isArray(reward.conquerorDrops)) {
          for (const value of reward.conquerorDrops) {
            const drop = record(value);
            const key = String(drop.itemKey ?? "Récompense spéciale");
            drops.set(key, (drops.get(key) ?? 0) + 1);
          }
        }
      }
      const participants = [...new Set(run.contributions.map((entry) => entry.user.username))];
      const reward = record(run.rewardSnapshot);
      const dropText = [...drops.entries()].map(([key, count]) => `${count}× ${key}`).join("\n");
      const defeatedTimestamp = Math.floor((run.defeatedAt ?? run.updatedAt).getTime() / 1_000);
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`🏆 ${run.guild.name} a vaincu ${run.definition.name}`)
        .setDescription(
          `Le boss a été détruit <t:${defeatedTimestamp}:R> sur **${run.guild.name}**.\n` +
          `Progression finale : **${run.targetSnapshot}/${run.targetSnapshot}**.`
        )
        .addFields(
          { name: "Monde", value: run.definition.world?.name ?? "Monde inconnu", inline: true },
          { name: "Tier", value: bossTierLabel(reward.conquerorTier), inline: true },
          { name: "Type & mécanique", value: bossTypeLabel(run.category, run.mechanic, run.definition.kind === "GUARDIAN"), inline: true },
          {
            name: `Participants (${participants.length})`,
            value: participants.length > 0 ? participants.map((name) => `• ${name}`).join("\n").slice(0, 1_020) : "Aucun participant enregistré"
          },
          {
            name: `Butin distribué à ${run.rewardGrants.length} joueur(s)`,
            value: `💳 ${credits.toLocaleString("fr-FR")} crédits\n⭐ ${xp.toLocaleString("fr-FR")} XP\n🧩 ${fragments.toLocaleString("fr-FR")} fragments` +
              (dropText ? `\n${dropText}` : "")
          }
        )
        .setFooter({ text: "Rocket Them All · Victoire interserveurs" })
        .setTimestamp();
      const files = await attachBossImage(embed, run.definition);
      const message = await channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } });
      await prisma.bossRun.updateMany({
        where: { id: run.id, victoryMessageId: claimId },
        data: { victoryMessageId: message.id, victoryChannelId: channelId }
      });
    } catch (error) {
      await prisma.bossRun.updateMany({
        where: { id: run.id, victoryMessageId: claimId },
        data: { victoryMessageId: null }
      });
      console.error("Boss victory announcement failed", { bossRunId: run.id, error });
    }
  }
}

export function registerBossAnnouncementSynchronization(client: Client) {
  void syncBossAnnouncements(client);
  const timer = setInterval(() => {
    void syncBossAnnouncements(client);
  }, SYNCHRONIZATION_INTERVAL_MS);
  timer.unref();
}
