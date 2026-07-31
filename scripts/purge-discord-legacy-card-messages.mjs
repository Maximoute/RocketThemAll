import {
  Client,
  GatewayIntentBits
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
const channelIds = process.argv.slice(2);
const shouldDelete = process.env.RTA_PURGE_CONFIRM === "true";
const shouldBlockSend = process.env.RTA_BLOCK_SEND === "true";
const shouldGrantManageMessages = process.env.RTA_GRANT_MANAGE_MESSAGES === "true";
const maxMessagesPerChannel = Number(process.env.RTA_PURGE_SCAN_LIMIT ?? 5_000);

if (!token) {
  throw new Error("DISCORD_TOKEN is required.");
}
if (channelIds.length === 0) {
  throw new Error("Provide at least one Discord channel ID.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

function isOldCardAppearance(message) {
  if (message.author.id !== client.user?.id) return false;

  const content = message.content.trim();
  const embeds = message.embeds;
  return (
    content === "Spawn automatique !" ||
    content === "Apparition forcee par un admin !" ||
    content.startsWith("Spawn manuel lance par ") ||
    embeds.some((embed) =>
      embed.title === "Une carte mysterieuse est apparue !" ||
      embed.title === "3 cartes mysterieuses sont apparues !" ||
      embed.title?.startsWith("Carte mysterieuse #") ||
      embed.description?.includes("Utilisez /capture <nom>")
    )
  );
}

client.once("ready", async () => {
  const matches = [];
  const scannedByChannel = new Map();

  try {
    for (const channelId of channelIds) {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !("messages" in channel)) {
        console.warn(`[discord-purge] salon inaccessible: ${channelId}`);
        continue;
      }
      console.log(
        `[discord-purge] salon ${"guild" in channel ? channel.guild.name : "inconnu"}/#${"name" in channel ? channel.name : channelId}`
      );
      if (shouldBlockSend && "permissionOverwrites" in channel && client.user) {
        await channel.permissionOverwrites.edit(
          client.user.id,
          { SendMessages: false },
          { reason: "Blocage définitif de l’ancien moteur automatique RTA" }
        );
        console.log(`[discord-purge] envoi interdit au bot dans ${channelId}`);
      }
      if (shouldGrantManageMessages && "permissionOverwrites" in channel && client.user) {
        await channel.permissionOverwrites.edit(
          client.user.id,
          { ManageMessages: true },
          { reason: "Purge ciblée de l’ancien historique automatique RTA" }
        );
        console.log(`[discord-purge] gestion des messages accordée dans ${channelId}`);
      }

      let before;
      let scanned = 0;
      while (scanned < maxMessagesPerChannel) {
        const batch = await channel.messages.fetch({
          limit: Math.min(100, maxMessagesPerChannel - scanned),
          ...(before ? { before } : {})
        });
        if (batch.size === 0) break;

        scanned += batch.size;
        before = batch.last()?.id;
        for (const message of batch.values()) {
          if (isOldCardAppearance(message)) {
            matches.push({
              channelId,
              messageId: message.id,
              createdAt: message.createdAt.toISOString(),
              content: message.content,
              message
            });
          }
        }
        if (batch.size < 100) break;
      }
      console.log(`[discord-purge] ${channelId}: ${scanned} messages contrôlés`);
      scannedByChannel.set(channelId, scanned);
    }

    if (shouldDelete) {
      const recentCutoff = Date.now() - 13.5 * 24 * 60 * 60 * 1_000;
      for (const channelId of channelIds) {
        const channelMatches = matches.filter((match) => match.channelId === channelId);
        const recent = channelMatches.filter((match) => match.message.createdTimestamp > recentCutoff);
        const old = channelMatches.filter((match) => match.message.createdTimestamp <= recentCutoff);
        const channel = recent[0]?.message.channel ?? old[0]?.message.channel;
        const individual = [...old];

        if (channel && "bulkDelete" in channel) {
          for (let offset = 0; offset < recent.length; offset += 100) {
            const batch = recent.slice(offset, offset + 100);
            try {
              await channel.bulkDelete(batch.map((match) => match.messageId), true);
            } catch (error) {
              console.warn(
                `[discord-purge] suppression groupée refusée dans ${channelId}; passage en suppression individuelle`
              );
              individual.push(...recent.slice(offset));
              break;
            }
          }
        }

        let deletedIndividual = 0;
        for (let offset = 0; offset < individual.length; offset += 50) {
          const results = await Promise.allSettled(
            individual.slice(offset, offset + 50).map((match) => match.message.delete())
          );
          deletedIndividual += results.filter((result) => result.status === "fulfilled").length;
          if (deletedIndividual % 250 === 0 || offset + 50 >= individual.length) {
            console.log(
              `[discord-purge] ${channelId}: ${recent.length - (individual.length - old.length)} groupés et ` +
              `${deletedIndividual}/${individual.length} individuels supprimés`
            );
          }
        }
      }
    }

    console.log(JSON.stringify({
      mode: shouldDelete ? "deleted" : "dry-run",
      matched: matches.length,
      channels: channelIds.map((channelId) => {
        const channelMatches = matches.filter((match) => match.channelId === channelId);
        const timestamps = channelMatches.map((match) => match.message.createdTimestamp);
        return {
          channelId,
          scanned: scannedByChannel.get(channelId) ?? 0,
          matched: channelMatches.length,
          firstMatch: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
          lastMatch: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null
        };
      })
    }, null, 2));
  } finally {
    client.destroy();
  }
});

await client.login(token);
