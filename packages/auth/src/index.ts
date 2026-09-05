export type { AuthUser } from "./types.js";
export type { RequestUser } from "./api-auth.js";

export { resolveRequestUser, requireAuth, requireSelfOrAdmin } from "./api-auth.js";
export { hasDiscordAdminRole, ADMIN_ROLE_ID } from "./bot-auth.js";
export { isDiscordSnowflake, sessionMatchesPersistedIdentity } from "./identity.js";
export {
  developmentSessionCookieName,
  isPrivateDevelopmentEnvironment,
  RTA_DEVELOPMENT_ENVIRONMENT,
  RTA_DEVELOPMENT_SESSION_COOKIE,
} from "./deployment.js";
export {
  hasGuildManagementPermission,
  type DiscordPermissionRole
} from "./guild-permissions.js";
