type DiscordChannel = {
  id: string;
  name: string;
  type: number;
};

export type DiscordSpawnChannel = {
  id: string;
  name: string;
};

const TEXT_CHANNEL_TYPES = new Set([0, 5]);

export async function fetchGuildSpawnChannels(guildId: string): Promise<DiscordSpawnChannel[]> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    return [];
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const channels = await response.json() as DiscordChannel[];
  return channels
    .filter((channel) => TEXT_CHANNEL_TYPES.has(channel.type))
    .map((channel) => ({ id: channel.id, name: channel.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}