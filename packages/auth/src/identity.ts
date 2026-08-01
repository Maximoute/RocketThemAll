export type SessionIdentity = {
  id?: string | null;
  discordId?: string | null;
};

export type PersistedIdentity = {
  id: string;
  discordId: string;
};

const DISCORD_SNOWFLAKE_PATTERN = /^[1-9]\d{16,19}$/;

export function isDiscordSnowflake(value: unknown): value is string {
  return typeof value === "string" && DISCORD_SNOWFLAKE_PATTERN.test(value);
}

export function sessionMatchesPersistedIdentity(
  sessionIdentity: SessionIdentity,
  persistedIdentity: PersistedIdentity
) {
  return Boolean(
    sessionIdentity.id
      && isDiscordSnowflake(sessionIdentity.discordId)
      && sessionIdentity.id === persistedIdentity.id
      && sessionIdentity.discordId === persistedIdentity.discordId
  );
}
