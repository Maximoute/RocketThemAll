type DiscordChannel = {
  id: string;
  name: string;
  type: number;
};

export type DiscordGameChannel = {
  id: string;
  name: string;
};

export type DiscordGuildRole = {
  id: string;
  name: string;
  position: number;
  managed: boolean;
};

const TEXT_CHANNEL_TYPES = new Set([0, 5]);
const DISCORD_SNOWFLAKE = /^\d{17,20}$/;

function discordRequest(path: string, token: string) {
  return fetch(`https://discord.com/api/v10${path}`, {
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(5_000),
    cache: "no-store"
  });
}

export async function fetchGuildGameChannels(guildId: string): Promise<DiscordGameChannel[]> {
  if (!DISCORD_SNOWFLAKE.test(guildId)) return [];
  const token = process.env.DISCORD_TOKEN;
  if (!token) return [];

  const response = await discordRequest(`/guilds/${guildId}/channels`, token);
  if (!response.ok) return [];

  const channels = await response.json() as DiscordChannel[];
  return channels
    .filter((channel) => TEXT_CHANNEL_TYPES.has(channel.type))
    .map((channel) => ({ id: channel.id, name: channel.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function fetchGuildRoles(guildId: string): Promise<DiscordGuildRole[]> {
  if (!DISCORD_SNOWFLAKE.test(guildId)) return [];
  const token = process.env.DISCORD_TOKEN;
  if (!token) return [];
  const response = await discordRequest(`/guilds/${guildId}/roles`, token);
  if (!response.ok) return [];
  const roles = await response.json() as DiscordGuildRole[];
  return roles.sort((left, right) => right.position - left.position);
}
