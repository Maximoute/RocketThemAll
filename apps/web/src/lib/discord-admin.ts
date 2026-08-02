type DiscordChannel = {
  id: string;
  name: string;
  type: number;
  permission_overwrites?: Array<{
    id: string;
    type: number;
    allow: string;
    deny: string;
  }>;
};

export type DiscordGameChannel = {
  id: string;
  name: string;
  botCanPublish: boolean;
  missingPermissions: string[];
};

export type DiscordGuildRole = {
  id: string;
  name: string;
  position: number;
  managed: boolean;
  permissions: string;
};

type DiscordGuildMember = {
  roles: string[];
};

type DiscordBotUser = {
  id: string;
};

const TEXT_CHANNEL_TYPES = new Set([0, 5]);
const DISCORD_SNOWFLAKE = /^\d{17,20}$/;
const ADMINISTRATOR = 1n << 3n;
const REQUIRED_PUBLICATION_PERMISSIONS = [
  { bit: 1n << 10n, label: "Voir le salon" },
  { bit: 1n << 11n, label: "Envoyer des messages" },
  { bit: 1n << 14n, label: "Intégrer des liens" },
  { bit: 1n << 15n, label: "Joindre des fichiers" }
] as const;

let discordBotUserPromise: Promise<DiscordBotUser | null> | null = null;

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

function fetchDiscordBotUser(token: string) {
  discordBotUserPromise ??= discordRequest("/users/@me", token)
    .then(async (response) => response.ok
      ? await response.json() as DiscordBotUser
      : null);
  return discordBotUserPromise;
}

function channelPermissions(input: {
  guildId: string;
  botUserId: string;
  memberRoleIds: string[];
  roles: DiscordGuildRole[];
  channel: DiscordChannel;
}) {
  let permissions = input.roles.reduce((value, role) => (
    role.id === input.guildId || input.memberRoleIds.includes(role.id)
      ? value | BigInt(role.permissions)
      : value
  ), 0n);
  if ((permissions & ADMINISTRATOR) !== 0n) {
    return REQUIRED_PUBLICATION_PERMISSIONS.map((entry) => ({ ...entry, granted: true }));
  }

  const overwrites = input.channel.permission_overwrites ?? [];
  const everyone = overwrites.find((overwrite) => (
    overwrite.type === 0 && overwrite.id === input.guildId
  ));
  if (everyone) {
    permissions &= ~BigInt(everyone.deny);
    permissions |= BigInt(everyone.allow);
  }

  let roleDenies = 0n;
  let roleAllows = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type === 0 && input.memberRoleIds.includes(overwrite.id)) {
      roleDenies |= BigInt(overwrite.deny);
      roleAllows |= BigInt(overwrite.allow);
    }
  }
  permissions &= ~roleDenies;
  permissions |= roleAllows;

  const memberOverwrite = overwrites.find((overwrite) => (
    overwrite.type === 1 && overwrite.id === input.botUserId
  ));
  if (memberOverwrite) {
    permissions &= ~BigInt(memberOverwrite.deny);
    permissions |= BigInt(memberOverwrite.allow);
  }

  return REQUIRED_PUBLICATION_PERMISSIONS.map((entry) => ({
    ...entry,
    granted: (permissions & entry.bit) !== 0n
  }));
}

export async function fetchGuildGameChannels(guildId: string): Promise<DiscordGameChannel[]> {
  if (!DISCORD_SNOWFLAKE.test(guildId)) return [];
  const token = process.env.DISCORD_TOKEN;
  if (!token) return [];

  const botUser = await fetchDiscordBotUser(token);
  if (!botUser) return [];
  const [channelsResponse, rolesResponse, memberResponse] = await Promise.all([
    discordRequest(`/guilds/${guildId}/channels`, token),
    discordRequest(`/guilds/${guildId}/roles`, token),
    discordRequest(`/guilds/${guildId}/members/${botUser.id}`, token)
  ]);
  if (!channelsResponse.ok || !rolesResponse.ok || !memberResponse.ok) return [];

  const channels = await channelsResponse.json() as DiscordChannel[];
  const roles = await rolesResponse.json() as DiscordGuildRole[];
  const member = await memberResponse.json() as DiscordGuildMember;
  return channels
    .filter((channel) => TEXT_CHANNEL_TYPES.has(channel.type))
    .map((channel) => {
      const permissionState = channelPermissions({
        guildId,
        botUserId: botUser.id,
        memberRoleIds: member.roles,
        roles,
        channel
      });
      const missingPermissions = permissionState
        .filter((permission) => !permission.granted)
        .map((permission) => permission.label);
      return {
        id: channel.id,
        name: channel.name,
        botCanPublish: missingPermissions.length === 0,
        missingPermissions
      };
    })
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
