import {
  EmbedBuilder,
  type ChatInputCommandInteraction
} from "discord.js";
import {
  spawnService,
  configService,
  cardsService,
  prisma,
  AppError
} from "./service-instances.js";
import { hasDiscordAdminRole, ADMIN_ROLE_ID } from "@rta/auth";

export { hasDiscordAdminRole, ADMIN_ROLE_ID };

export function formatDuration(ms: number | null) {
  if (ms === null || ms <= 0) {
    return "0h 0m";
  }

  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function scheduleManualSpawnPublicNotice(params: {
  interaction: ChatInputCommandInteraction;
  channelId: string;
  launcherUserId: string;
  launcherDiscordId: string;
  spawnCreatedAt: Date;
}) {
  const PRIVATE_WINDOW_MS = 2 * 60 * 1000;
  const TOTAL_WINDOW_MS = 5 * 60 * 1000;

  setTimeout(async () => {
    try {
      const active = await spawnService.getActiveSpawn(params.channelId);
      const windowStart = params.spawnCreatedAt.getTime() - 1000;
      const windowEnd = params.spawnCreatedAt.getTime() + 1000;
      const sameSpawn = active.filter((entry) =>
        entry.spawnType === "manual" &&
        entry.userId === params.launcherUserId &&
        entry.createdAt.getTime() >= windowStart &&
        entry.createdAt.getTime() <= windowEnd
      );

      const channel = await params.interaction.client.channels.fetch(params.channelId);
      if (!channel || !("send" in channel)) {
        return;
      }

      const remaining = sameSpawn.length;
      if (remaining > 0) {
        await channel.send(
          `🌍 Le spawn de <@${params.launcherDiscordId}> est maintenant **PUBLIC** pour tout le monde pendant **3 minutes**.\n` +
          `Il reste **${remaining}** carte(s) en jeu.`
        );
      } else {
        await channel.send(
          `🌍 Le spawn de <@${params.launcherDiscordId}> est passé en phase **publique** (3 min), mais toutes les cartes ont déjà été capturées.`
        );
      }
    } catch (error) {
      console.error("Failed to announce manual spawn public phase", error);
    }
  }, PRIVATE_WINDOW_MS);

  setTimeout(async () => {
    try {
      const active = await spawnService.getActiveSpawn(params.channelId);
      const windowStart = params.spawnCreatedAt.getTime() - 1000;
      const windowEnd = params.spawnCreatedAt.getTime() + 1000;
      const sameSpawnCount = active.filter((entry) =>
        entry.spawnType === "manual" &&
        entry.userId === params.launcherUserId &&
        entry.createdAt.getTime() >= windowStart &&
        entry.createdAt.getTime() <= windowEnd
      ).length;

      if (sameSpawnCount === 0) {
        return;
      }

      const channel = await params.interaction.client.channels.fetch(params.channelId);
      if (!channel || !("send" in channel)) {
        return;
      }

      await channel.send(`⌛ Le spawn de <@${params.launcherDiscordId}> a expiré.`);
    } catch (error) {
      console.error("Failed to announce manual spawn expiration", error);
    }
  }, TOTAL_WINDOW_MS);
}

export async function resolveGuildSpawnChannelId(guildId: string | null) {
  if (!guildId) {
    throw new AppError("Commande utilisable uniquement dans un serveur Discord.", 400);
  }

  const guildConfig = await configService.getGuildConfig(guildId);
  const channelId = guildConfig?.spawnChannelId || process.env.DISCORD_SPAWN_CHANNEL_ID;
  if (!channelId) {
    throw new AppError("Aucun salon de spawn n'est configuré pour ce serveur.", 400);
  }

  return channelId;
}

export async function sendSpawnCards(
  interaction: ChatInputCommandInteraction,
  channelId: string,
  cards: Array<{ imageUrl: string | null; rarity: { name: string } }>,
  content: string
) {
  const channel = await interaction.client.channels.fetch(channelId);
  if (!channel || !("send" in channel)) {
    throw new AppError("Impossible d'envoyer le spawn dans le salon configuré.", 500);
  }

  const embeds = cards.map((card, index) => {
    const embed = new EmbedBuilder()
      .setTitle(`Carte mysterieuse #${index + 1}`)
      .setDescription(`**Rarete :** ${card.rarity?.name ?? "?"}\nUtilisez /capture <nom> pour la capturer.`)
      .setColor(0x5865F2);

    if (card.imageUrl) {
      embed.setImage(card.imageUrl);
    }

    return embed;
  });

  await channel.send({ content, embeds });
}

export async function findCardByName(cardName: string) {
  const cards = await cardsService.getCards();
  return cards.find((card) => card.name.toLowerCase() === cardName.toLowerCase());
}

export async function resolveActiveTradeForUser(userId: string) {
  return prisma.trade.findFirst({
    where: {
      status: "pending",
      expiresAt: { gt: new Date() },
      OR: [{ user1Id: userId }, { user2Id: userId }]
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function resolveIncomingTradeForUser(userId: string) {
  return prisma.trade.findFirst({
    where: {
      status: "pending",
      expiresAt: { gt: new Date() },
      user2Id: userId
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function isTradeAccepted(tradeId: string) {
  const accepted = await prisma.adminLog.findFirst({
    where: { action: "TRADE_ACCEPTED", target: tradeId }
  });
  return Boolean(accepted);
}
