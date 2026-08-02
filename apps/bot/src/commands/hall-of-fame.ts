import { EmbedBuilder, type Client } from "discord.js";
import { prisma } from "./service-instances.js";
import { attachCardImage, type CardImageVariant } from "./card-media.js";

const ANNOUNCEMENT_RECLAIM_MS = 2 * 60 * 1_000;
const RECENT_CAPTURE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const SYNCHRONIZATION_INTERVAL_MS = 60 * 1_000;

let synchronizationRunning = false;

export function isHallOfFameVariant(
  variant: CardImageVariant | null
): variant is "shiny" | "holo" {
  return variant === "shiny" || variant === "holo";
}

export async function announceHallOfFameCapture(input: {
  client: Client;
  sourceGuildId: string | null;
  playerDiscordId: string;
  captureAttemptId: string;
  cardId: string;
  variant: CardImageVariant | null;
}) {
  if (!input.sourceGuildId) {
    return { status: "IGNORED_GUILD" as const };
  }
  if (!isHallOfFameVariant(input.variant)) {
    return { status: "IGNORED_VARIANT" as const };
  }

  const [sourceGuild, targetGuild] = await Promise.all([
    prisma.guild.findUnique({
      where: { discordId: input.sourceGuildId },
      select: { isActive: true }
    }),
    prisma.guild.findFirst({
      where: { isPrimary: true, isActive: true },
      include: { config: true }
    })
  ]);
  if (!sourceGuild?.isActive) {
    return { status: "IGNORED_GUILD" as const };
  }
  if (!targetGuild?.config?.hallOfFameEnabled) {
    return { status: "DISABLED" as const };
  }
  const channelId = targetGuild.config.hallOfFameChannelId;
  if (!channelId) {
    return { status: "NOT_CONFIGURED" as const };
  }

  const announcement = await prisma.hallOfFameAnnouncement.upsert({
    where: { captureAttemptId: input.captureAttemptId },
    update: {},
    create: {
      captureAttemptId: input.captureAttemptId,
      channelId
    }
  });
  if (announcement.status === "SENT") {
    return { status: "ALREADY_SENT" as const, messageId: announcement.messageId };
  }

  if (
    announcement.status === "PROCESSING" &&
    announcement.updatedAt.getTime() < Date.now() - ANNOUNCEMENT_RECLAIM_MS
  ) {
    await prisma.hallOfFameAnnouncement.updateMany({
      where: {
        id: announcement.id,
        status: "PROCESSING",
        updatedAt: { lt: new Date(Date.now() - ANNOUNCEMENT_RECLAIM_MS) }
      },
      data: {
        status: "FAILED",
        lastError: "Bail de publication expiré"
      }
    });
  }

  const claim = await prisma.hallOfFameAnnouncement.updateMany({
    where: {
      id: announcement.id,
      status: { in: ["PENDING", "FAILED"] }
    },
    data: {
      status: "PROCESSING",
      channelId,
      attempts: { increment: 1 },
      lastError: null
    }
  });
  if (claim.count !== 1) {
    return { status: "IN_PROGRESS" as const };
  }

  try {
    const [channel, card] = await Promise.all([
      input.client.channels.fetch(channelId),
      prisma.card.findUnique({
        where: { id: input.cardId },
        include: { deck: true, rarity: true }
      })
    ]);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error("Le salon Hall of Fame configuré n'est pas un salon texte.");
    }
    if (channel.guildId !== targetGuild.discordId) {
      throw new Error("Le salon Hall of Fame n'appartient pas au serveur principal.");
    }
    if (!card) {
      throw new Error("Carte introuvable pour l'annonce Hall of Fame.");
    }

    const variantLabel = input.variant === "holo" ? "HOLO" : "SHINY";
    const embed = new EmbedBuilder()
      .setColor(input.variant === "holo" ? 0xffd700 : 0x43e8d8)
      .setTitle(
        input.variant === "holo"
          ? "🌌 Capture légendaire — HOLO !"
          : "✨ Découverte exceptionnelle — SHINY !"
      )
      .setDescription(
        `<@${input.playerDiscordId}> entre au **Hall of Fame** en capturant ` +
        `**${card.name}** dans sa variante **${variantLabel}** !`
      )
      .addFields(
        { name: "Rareté", value: card.rarity.name, inline: true },
        { name: "Deck", value: card.deck.name, inline: true },
        { name: "Identifiant", value: `\`${card.contentKey ?? card.id}\``, inline: true }
      )
      .setFooter({ text: "Rocket Them All • Hall of Fame" })
      .setTimestamp();
    const files = await attachCardImage(embed, card, input.variant);
    const message = await channel.send({
      content: `🏆 Bravo <@${input.playerDiscordId}> !`,
      embeds: [embed],
      files,
      allowedMentions: { users: [input.playerDiscordId] }
    });

    await prisma.hallOfFameAnnouncement.update({
      where: { id: announcement.id },
      data: {
        status: "SENT",
        messageId: message.id,
        lastError: null
      }
    });
    return { status: "SENT" as const, messageId: message.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur Hall of Fame inconnue";
    await prisma.hallOfFameAnnouncement.updateMany({
      where: { id: announcement.id, status: "PROCESSING" },
      data: {
        status: "FAILED",
        lastError: message.slice(0, 2_000)
      }
    });
    console.error("Hall of Fame announcement failed", {
      captureAttemptId: input.captureAttemptId,
      channelId,
      error: message
    });
    return { status: "FAILED" as const, error: message };
  }
}

export async function syncRecentHallOfFameCaptures(client: Client) {
  if (synchronizationRunning) return;
  synchronizationRunning = true;

  try {
    const primaryGuild = await prisma.guild.findFirst({
      where: { isPrimary: true, isActive: true },
      include: { config: true }
    });
    if (
      !primaryGuild?.config?.hallOfFameEnabled ||
      !primaryGuild.config.hallOfFameChannelId
    ) {
      return;
    }

    const captures = await prisma.captureAttempt.findMany({
      where: {
        status: "SUCCEEDED",
        variant: { in: ["shiny", "holo"] },
        submittedAt: { gte: new Date(Date.now() - RECENT_CAPTURE_WINDOW_MS) },
        encounter: { guild: { isActive: true } },
        OR: [
          { hallOfFameAnnouncement: { is: null } },
          {
            hallOfFameAnnouncement: {
              is: { status: { in: ["PENDING", "FAILED"] } }
            }
          },
          {
            hallOfFameAnnouncement: {
              is: {
                status: "PROCESSING",
                updatedAt: { lt: new Date(Date.now() - ANNOUNCEMENT_RECLAIM_MS) }
              }
            }
          }
        ]
      },
      include: {
        user: { select: { discordId: true } },
        encounter: {
          select: {
            cardId: true,
            guild: { select: { discordId: true } }
          }
        }
      },
      orderBy: { submittedAt: "asc" },
      take: 20
    });

    for (const capture of captures) {
      await announceHallOfFameCapture({
        client,
        sourceGuildId: capture.encounter.guild.discordId,
        playerDiscordId: capture.user.discordId,
        captureAttemptId: capture.id,
        cardId: capture.encounter.cardId,
        variant: capture.variant as CardImageVariant | null
      });
    }
  } catch (error) {
    console.error("Hall of Fame synchronization failed", error);
  } finally {
    synchronizationRunning = false;
  }
}

export function registerHallOfFameSynchronization(client: Client) {
  void syncRecentHallOfFameCaptures(client);
  const timer = setInterval(() => {
    void syncRecentHallOfFameCaptures(client);
  }, SYNCHRONIZATION_INTERVAL_MS);
  timer.unref();
}
