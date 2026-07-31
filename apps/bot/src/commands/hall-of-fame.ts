import { EmbedBuilder, type Client } from "discord.js";
import { prisma } from "./service-instances.js";
import { attachCardImage, type CardImageVariant } from "./card-media.js";

const ANNOUNCEMENT_RECLAIM_MS = 2 * 60 * 1_000;

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

  const guild = await prisma.guild.findUnique({
    where: { discordId: input.sourceGuildId },
    include: { config: true }
  });
  if (!guild?.config?.hallOfFameEnabled) {
    return { status: "DISABLED" as const };
  }
  const channelId = guild?.config?.hallOfFameChannelId;
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
    if (channel.guildId !== input.sourceGuildId) {
      throw new Error("Le salon Hall of Fame n'appartient pas au serveur configuré.");
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
