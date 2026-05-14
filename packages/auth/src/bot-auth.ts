import type { ChatInputCommandInteraction } from "discord.js";

export const DISCORD_ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID;
export const LEGACY_ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
export const ADMIN_ROLE_ID = DISCORD_ADMIN_ROLE_ID || LEGACY_ADMIN_ROLE_ID;

if (!DISCORD_ADMIN_ROLE_ID && LEGACY_ADMIN_ROLE_ID) {
  console.warn("[bot:config] ADMIN_ROLE_ID is deprecated. Please migrate to DISCORD_ADMIN_ROLE_ID.");
}

export function hasDiscordAdminRole(interaction: ChatInputCommandInteraction): boolean {
  if (!ADMIN_ROLE_ID) {
    return false;
  }

  const member = interaction.member as { roles?: { cache?: Map<string, unknown> } | string[] } | null;
  if (!member?.roles) {
    return false;
  }

  if (Array.isArray(member.roles)) {
    return member.roles.includes(ADMIN_ROLE_ID);
  }

  const rolesCache = (member.roles as { cache?: { has?: (roleId: string) => boolean } }).cache;
  if (!rolesCache || typeof rolesCache.has !== "function") {
    return false;
  }

  return rolesCache.has(ADMIN_ROLE_ID);
}
