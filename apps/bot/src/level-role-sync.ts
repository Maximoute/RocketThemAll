import { AppError, discordLevelRoleService } from "./commands/service-instances.js";

const SYNC_INTERVAL_MS = 60_000;
const GLOBAL_ERROR_BACKOFF_MS = 5 * 60_000;
const ROLE_ORDER_INTERVAL_MS = 10 * 60_000;
let synchronizationRunning = false;
let globalBackoffUntil = 0;
let nextRoleOrderCheckAt = 0;
let synchronizationTimer: NodeJS.Timeout | null = null;

export async function syncPendingLevelRoles() {
  if (synchronizationRunning || Date.now() < globalBackoffUntil) return;
  const botToken = process.env.DISCORD_TOKEN ?? "";
  synchronizationRunning = true;
  try {
    const pending = await discordLevelRoleService.listUsersNeedingSync(25);
    let synchronized = 0;
    let createdLevelRole = false;
    for (const entry of pending) {
      try {
        const result = await discordLevelRoleService.syncUserLevel(entry.userId, botToken);
        createdLevelRole ||= result.created;
        synchronized += 1;
      } catch (error) {
        if (error instanceof AppError && [401, 403, 409, 503].includes(error.statusCode)) {
          globalBackoffUntil = Date.now() + GLOBAL_ERROR_BACKOFF_MS;
          console.warn(`Level role synchronization paused: ${error.message}`);
          break;
        }
        if (!(error instanceof AppError && error.statusCode === 404)) {
          console.warn(
            "Level role synchronization failed",
            error instanceof Error ? error.message : "Unknown error"
          );
        }
      }
    }
    if (synchronized > 0) {
      console.log(`Synchronized ${synchronized} dynamic level role(s)`);
    }
    if (
      Date.now() >= globalBackoffUntil
      && (createdLevelRole || Date.now() >= nextRoleOrderCheckAt)
    ) {
      nextRoleOrderCheckAt = Date.now() + ROLE_ORDER_INTERVAL_MS;
      try {
        const order = await discordLevelRoleService.ensurePrimaryGuildRoleOrder(botToken);
        if (order.moved > 0) {
          console.log(`Moved ${order.moved} level role(s) above achievement badges`);
        }
      } catch (error) {
        if (error instanceof AppError && [401, 403, 409, 503].includes(error.statusCode)) {
          globalBackoffUntil = Date.now() + GLOBAL_ERROR_BACKOFF_MS;
        }
        console.warn(
          "Level role ordering failed",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  } finally {
    synchronizationRunning = false;
  }
}

export function registerLevelRoleSynchronization() {
  if (synchronizationTimer) return;
  void syncPendingLevelRoles().catch((error) => {
    console.warn(
      "Initial level role synchronization failed",
      error instanceof Error ? error.message : "Unknown error"
    );
  });
  synchronizationTimer = setInterval(() => {
    void syncPendingLevelRoles().catch((error) => {
      console.warn(
        "Level role synchronization failed",
        error instanceof Error ? error.message : "Unknown error"
      );
    });
  }, SYNC_INTERVAL_MS);
  synchronizationTimer.unref();
}
