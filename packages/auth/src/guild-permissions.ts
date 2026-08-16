export type DiscordPermissionRole = {
  id: string;
  permissions: string;
};

const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

function parsePermissions(value: string) {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function hasGuildManagementPermission(input: {
  guildId: string;
  discordUserId: string;
  ownerId: string;
  memberRoleIds: string[];
  roles: DiscordPermissionRole[];
}) {
  if (input.discordUserId === input.ownerId) return true;
  const permissions = input.roles.reduce((value, role) => (
    role.id === input.guildId || input.memberRoleIds.includes(role.id)
      ? value | parsePermissions(role.permissions)
      : value
  ), 0n);
  return (permissions & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
}
