export type { AuthUser } from "./types.js";
export type { RequestUser } from "./api-auth.js";

export { resolveRequestUser, requireAuth, requireSelfOrAdmin } from "./api-auth.js";
export { hasDiscordAdminRole, ADMIN_ROLE_ID } from "./bot-auth.js";
