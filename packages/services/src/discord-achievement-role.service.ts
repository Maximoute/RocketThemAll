import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";

const DISCORD_API = "https://discord.com/api/v10";
const MANAGE_ROLES = 1n << 28n;
const ADMINISTRATOR = 1n << 3n;

type DiscordRole = {
  id: string;
  name: string;
  position: number;
  permissions: string;
  managed: boolean;
};

type DiscordMember = {
  roles: string[];
};

type DiscordUser = {
  id: string;
};

async function discordRequest<T>(
  botToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
      ...init.headers
    },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new AppError(
      `Discord a refusé la synchronisation des rôles RTA (HTTP ${response.status}).`,
      response.status
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function rolePermissions(roleIds: string[], roles: DiscordRole[], guildDiscordId: string) {
  const assigned = new Set([guildDiscordId, ...roleIds]);
  return roles
    .filter((role) => assigned.has(role.id))
    .reduce((permissions, role) => permissions | BigInt(role.permissions), 0n);
}

function highestRolePosition(roleIds: string[], roles: DiscordRole[]) {
  const assigned = new Set(roleIds);
  return roles.reduce(
    (position, role) => assigned.has(role.id) ? Math.max(position, role.position) : position,
    0
  );
}

function badgeRoleName(achievementName: string) {
  const normalized = achievementName.replace(/\s+/g, " ").trim();
  return `🏅 ${normalized}`.slice(0, 100);
}

function badgeRoleColor(metadata: Prisma.JsonValue | null) {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, Prisma.JsonValue>
    : {};
  const tier = Math.max(0, Math.floor(Number(record.tier ?? 0)));
  return [0x95a5a6, 0x2ecc71, 0x3498db, 0x9b59b6, 0xf1c40f][Math.min(4, tier)]!;
}

export type AchievementRoleSyncResult = {
  guildId: string;
  guildName: string;
  selectedNames: string[];
  created: number;
  added: number;
  removed: number;
};

export class DiscordAchievementRoleService {
  async syncUserBadges(userId: string, botToken: string): Promise<AchievementRoleSyncResult> {
    if (!botToken.trim()) {
      throw new AppError("Le token Discord du bot n'est pas configuré.", 503);
    }
    const [user, primaryGuild, selections] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { discordId: true } }),
      prisma.guild.findFirst({
        where: { isPrimary: true, isActive: true },
        select: { id: true, discordId: true, name: true }
      }),
      prisma.achievementBadgeSelection.findMany({
        where: { userId, achievement: { status: "PUBLISHED" } },
        include: { achievement: true },
        orderBy: { selectedAt: "asc" },
        take: 3
      })
    ]);
    if (!user) throw new AppError("Joueur RTA introuvable.", 404);
    if (!primaryGuild) {
      throw new AppError("Aucun serveur principal actif n'est configuré.", 409);
    }

    const botUser = await discordRequest<DiscordUser>(botToken, "/users/@me");
    let roles: DiscordRole[];
    let botMember: DiscordMember;
    let targetMember: DiscordMember;
    try {
      [roles, botMember, targetMember] = await Promise.all([
        discordRequest<DiscordRole[]>(botToken, `/guilds/${primaryGuild.discordId}/roles`),
        discordRequest<DiscordMember>(
          botToken,
          `/guilds/${primaryGuild.discordId}/members/${botUser.id}`
        ),
        discordRequest<DiscordMember>(
          botToken,
          `/guilds/${primaryGuild.discordId}/members/${user.discordId}`
        )
      ]);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        throw new AppError(
          `Tu dois être membre du serveur principal « ${primaryGuild.name} » pour porter tes badges.`,
          404
        );
      }
      throw error;
    }

    const permissions = rolePermissions(
      botMember.roles,
      roles,
      primaryGuild.discordId
    );
    if ((permissions & ADMINISTRATOR) === 0n && (permissions & MANAGE_ROLES) === 0n) {
      throw new AppError(
        `Le bot doit avoir la permission « Gérer les rôles » sur ${primaryGuild.name}.`,
        403
      );
    }
    const botHighestPosition = highestRolePosition(botMember.roles, roles);
    const mappings = await prisma.achievementBadgeRole.findMany({
      where: { guildId: primaryGuild.id }
    });
    const mappingByAchievement = new Map(
      mappings.map((mapping) => [mapping.achievementId, mapping])
    );
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const selectedAchievementIds = new Set(
      selections.map((selection) => selection.achievementId)
    );
    let created = 0;
    let added = 0;
    let removed = 0;

    for (const selection of selections) {
      let mapping = mappingByAchievement.get(selection.achievementId);
      let role = mapping ? roleById.get(mapping.discordRoleId) : undefined;
      if (!role) {
        const ensured = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${
              `achievement-role:${primaryGuild.id}:${selection.achievementId}`
            }, 0))`
          );
          const freshMapping = await tx.achievementBadgeRole.findUnique({
            where: {
              guildId_achievementId: {
                guildId: primaryGuild.id,
                achievementId: selection.achievementId
              }
            }
          });
          if (freshMapping) {
            const refreshedRoles = await discordRequest<DiscordRole[]>(
              botToken,
              `/guilds/${primaryGuild.discordId}/roles`
            );
            const freshRole = refreshedRoles.find(
              (candidate) => candidate.id === freshMapping.discordRoleId
            );
            if (freshRole) {
              return { mapping: freshMapping, role: freshRole, created: false };
            }
          }

          const createdRole = await discordRequest<DiscordRole>(
            botToken,
            `/guilds/${primaryGuild.discordId}/roles`,
            {
              method: "POST",
              body: JSON.stringify({
                name: badgeRoleName(selection.achievement.name),
                permissions: "0",
                color: badgeRoleColor(selection.achievement.metadata),
                hoist: false,
                mentionable: false
              }),
              headers: { "X-Audit-Log-Reason": "RTA achievement badge" }
            }
          );
          const savedMapping = await tx.achievementBadgeRole.upsert({
            where: {
              guildId_achievementId: {
                guildId: primaryGuild.id,
                achievementId: selection.achievementId
              }
            },
            update: { discordRoleId: createdRole.id },
            create: {
              guildId: primaryGuild.id,
              achievementId: selection.achievementId,
              discordRoleId: createdRole.id
            }
          });
          return { mapping: savedMapping, role: createdRole, created: true };
        }, { maxWait: 5_000, timeout: 15_000 });
        mapping = ensured.mapping;
        role = ensured.role;
        mappingByAchievement.set(selection.achievementId, mapping);
        roleById.set(role.id, role);
        if (ensured.created) created += 1;
      }
      if (role.managed || role.position >= botHighestPosition) {
        throw new AppError(
          `Le rôle « ${role.name} » doit être placé sous le rôle principal du bot.`,
          403
        );
      }
      if (!targetMember.roles.includes(role.id)) {
        await discordRequest<void>(
          botToken,
          `/guilds/${primaryGuild.discordId}/members/${user.discordId}/roles/${role.id}`,
          {
            method: "PUT",
            headers: { "X-Audit-Log-Reason": "RTA achievement badge selected" }
          }
        );
        targetMember.roles.push(role.id);
        added += 1;
      }
    }

    for (const mapping of mappings) {
      if (
        selectedAchievementIds.has(mapping.achievementId)
        || !targetMember.roles.includes(mapping.discordRoleId)
      ) {
        continue;
      }
      const role = roleById.get(mapping.discordRoleId);
      if (!role || role.managed || role.position >= botHighestPosition) continue;
      await discordRequest<void>(
        botToken,
        `/guilds/${primaryGuild.discordId}/members/${user.discordId}/roles/${role.id}`,
        {
          method: "DELETE",
          headers: { "X-Audit-Log-Reason": "RTA achievement badge unselected" }
        }
      );
      removed += 1;
    }

    return {
      guildId: primaryGuild.discordId,
      guildName: primaryGuild.name,
      selectedNames: selections.map((selection) => selection.achievement.name),
      created,
      added,
      removed
    };
  }
}

export type LevelRoleRange = {
  minLevel: number;
  maxLevel: number;
  label: string;
};

export function levelRoleRange(level: number): LevelRoleRange {
  const normalized = Math.max(0, Math.floor(Number.isFinite(level) ? level : 0));
  if (normalized <= 10) {
    return { minLevel: 0, maxLevel: 10, label: "Niveau 0–10" };
  }
  const minLevel = Math.floor((normalized - 1) / 10) * 10 + 1;
  const maxLevel = minLevel + 9;
  return { minLevel, maxLevel, label: `Niveau ${minLevel}–${maxLevel}` };
}

function levelRoleColor(minLevel: number) {
  const colors = [
    0x95a5a6,
    0x2ecc71,
    0x3498db,
    0x9b59b6,
    0xf1c40f,
    0xe67e22,
    0xe74c3c
  ];
  const bracket = minLevel === 0 ? 0 : Math.ceil(minLevel / 10);
  return colors[Math.min(colors.length - 1, bracket)]!;
}

export type LevelRoleSyncResult = {
  guildId: string;
  guildName: string;
  level: number;
  range: LevelRoleRange;
  roleName: string;
  created: boolean;
  added: boolean;
  removed: number;
};

export class DiscordLevelRoleService {
  async listUsersNeedingSync(limit = 25) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    return prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT "user"."id" AS "userId"
      FROM "User" AS "user"
      INNER JOIN "GuildMember" AS membership
        ON membership."userId" = "user"."id"
       AND membership."isActive" = TRUE
      INNER JOIN "Guild" AS guild
        ON guild."id" = membership."guildId"
       AND guild."isPrimary" = TRUE
       AND guild."isActive" = TRUE
      LEFT JOIN "UserProgress" AS progress ON progress."userId" = "user"."id"
      LEFT JOIN "UserLevelRoleSync" AS state ON state."userId" = "user"."id"
      WHERE (
        state."lastSyncedGuildDiscordId" IS DISTINCT FROM guild."discordId"
        OR state."lastSyncedMinLevel" IS DISTINCT FROM (
          CASE
            WHEN GREATEST(COALESCE(progress."level", "user"."level"), 0) <= 10 THEN 0
            ELSE ((GREATEST(COALESCE(progress."level", "user"."level"), 0) - 1) / 10) * 10 + 1
          END
        )
      )
        AND (
          state."lastError" IS NULL
          OR state."lastAttemptedAt" IS NULL
          OR state."lastAttemptedAt" < NOW() - INTERVAL '5 minutes'
        )
      ORDER BY state."lastAttemptedAt" ASC NULLS FIRST, "user"."createdAt" ASC
      LIMIT ${safeLimit}
    `);
  }

  async ensurePrimaryGuildRoleOrder(botToken: string) {
    if (!botToken.trim()) {
      throw new AppError("Le token Discord du bot n'est pas configuré.", 503);
    }
    const primaryGuild = await prisma.guild.findFirst({
      where: { isPrimary: true, isActive: true },
      include: {
        levelRoles: { orderBy: { minLevel: "desc" } },
        achievementBadgeRoles: { select: { discordRoleId: true } }
      }
    });
    if (!primaryGuild) {
      throw new AppError("Aucun serveur principal actif n'est configuré.", 409);
    }
    if (
      primaryGuild.levelRoles.length === 0
      || primaryGuild.achievementBadgeRoles.length === 0
    ) {
      return { guildName: primaryGuild.name, moved: 0 };
    }

    const botUser = await discordRequest<DiscordUser>(botToken, "/users/@me");
    let [roles, botMember] = await Promise.all([
      discordRequest<DiscordRole[]>(botToken, `/guilds/${primaryGuild.discordId}/roles`),
      discordRequest<DiscordMember>(
        botToken,
        `/guilds/${primaryGuild.discordId}/members/${botUser.id}`
      )
    ]);
    const permissions = rolePermissions(botMember.roles, roles, primaryGuild.discordId);
    if ((permissions & ADMINISTRATOR) === 0n && (permissions & MANAGE_ROLES) === 0n) {
      throw new AppError(
        `Le bot doit avoir la permission « Gérer les rôles » sur ${primaryGuild.name}.`,
        403
      );
    }

    const botHighestPosition = highestRolePosition(botMember.roles, roles);
    const badgeRoleIds = new Set(
      primaryGuild.achievementBadgeRoles.map((mapping) => mapping.discordRoleId)
    );
    let moved = 0;
    for (const mapping of primaryGuild.levelRoles) {
      const roleById = new Map(roles.map((role) => [role.id, role]));
      const levelRole = roleById.get(mapping.discordRoleId);
      const highestBadgePosition = roles.reduce(
        (position, role) => badgeRoleIds.has(role.id) ? Math.max(position, role.position) : position,
        0
      );
      if (!levelRole || highestBadgePosition === 0 || levelRole.position > highestBadgePosition) {
        continue;
      }
      if (levelRole.managed || levelRole.position >= botHighestPosition) {
        throw new AppError(
          `Le rôle « ${levelRole.name} » doit rester sous le rôle principal du bot.`,
          403
        );
      }
      if (highestBadgePosition >= botHighestPosition) {
        throw new AppError(
          "Le rôle principal du bot doit être placé au-dessus des badges RTA.",
          403
        );
      }
      const targetPosition = Math.min(botHighestPosition - 1, highestBadgePosition + 1);
      roles = await discordRequest<DiscordRole[]>(
        botToken,
        `/guilds/${primaryGuild.discordId}/roles`,
        {
          method: "PATCH",
          body: JSON.stringify([{ id: levelRole.id, position: targetPosition }]),
          headers: { "X-Audit-Log-Reason": "RTA level roles above achievement badges" }
        }
      );
      moved += 1;
    }
    return { guildName: primaryGuild.name, moved };
  }

  async syncUserLevel(userId: string, botToken: string): Promise<LevelRoleSyncResult> {
    try {
      const result = await this.performSync(userId, botToken);
      await prisma.userLevelRoleSync.upsert({
        where: { userId },
        update: {
          lastSyncedGuildDiscordId: result.guildId,
          lastSyncedMinLevel: result.range.minLevel,
          lastSyncedMaxLevel: result.range.maxLevel,
          lastAttemptedAt: new Date(),
          lastSyncedAt: new Date(),
          lastError: null
        },
        create: {
          userId,
          lastSyncedGuildDiscordId: result.guildId,
          lastSyncedMinLevel: result.range.minLevel,
          lastSyncedMaxLevel: result.range.maxLevel,
          lastAttemptedAt: new Date(),
          lastSyncedAt: new Date()
        }
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Erreur Discord";
      await prisma.userLevelRoleSync.upsert({
        where: { userId },
        update: { lastAttemptedAt: new Date(), lastError: message },
        create: { userId, lastAttemptedAt: new Date(), lastError: message }
      }).catch(() => undefined);
      throw error;
    }
  }

  private async performSync(userId: string, botToken: string): Promise<LevelRoleSyncResult> {
    if (!botToken.trim()) {
      throw new AppError("Le token Discord du bot n'est pas configuré.", 503);
    }
    const [user, primaryGuild] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { discordId: true, level: true, progress: { select: { level: true } } }
      }),
      prisma.guild.findFirst({
        where: { isPrimary: true, isActive: true },
        select: { id: true, discordId: true, name: true }
      })
    ]);
    if (!user) throw new AppError("Joueur RTA introuvable.", 404);
    if (!primaryGuild) {
      throw new AppError("Aucun serveur principal actif n'est configuré.", 409);
    }
    const level = Math.max(0, user.progress?.level ?? user.level);
    const range = levelRoleRange(level);
    const botUser = await discordRequest<DiscordUser>(botToken, "/users/@me");
    let roles: DiscordRole[];
    let botMember: DiscordMember;
    let targetMember: DiscordMember;
    try {
      [roles, botMember, targetMember] = await Promise.all([
        discordRequest<DiscordRole[]>(botToken, `/guilds/${primaryGuild.discordId}/roles`),
        discordRequest<DiscordMember>(
          botToken,
          `/guilds/${primaryGuild.discordId}/members/${botUser.id}`
        ),
        discordRequest<DiscordMember>(
          botToken,
          `/guilds/${primaryGuild.discordId}/members/${user.discordId}`
        )
      ]);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        throw new AppError(
          `Tu dois être membre du serveur principal « ${primaryGuild.name} » pour recevoir ton rôle de niveau.`,
          404
        );
      }
      throw error;
    }
    const permissions = rolePermissions(botMember.roles, roles, primaryGuild.discordId);
    if ((permissions & ADMINISTRATOR) === 0n && (permissions & MANAGE_ROLES) === 0n) {
      throw new AppError(
        `Le bot doit avoir la permission « Gérer les rôles » sur ${primaryGuild.name}.`,
        403
      );
    }
    const botHighestPosition = highestRolePosition(botMember.roles, roles);
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const existingMappings = await prisma.guildLevelRole.findMany({
      where: { guildId: primaryGuild.id }
    });
    let mapping = existingMappings.find((entry) => entry.minLevel === range.minLevel);
    let currentRole = mapping ? roleById.get(mapping.discordRoleId) : undefined;
    let created = false;

    if (!currentRole) {
      const ensured = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${
            `level-role:${primaryGuild.id}:${range.minLevel}`
          }, 0))`
        );
        const freshMapping = await tx.guildLevelRole.findUnique({
          where: {
            guildId_minLevel: {
              guildId: primaryGuild.id,
              minLevel: range.minLevel
            }
          }
        });
        if (freshMapping) {
          const refreshedRoles = await discordRequest<DiscordRole[]>(
            botToken,
            `/guilds/${primaryGuild.discordId}/roles`
          );
          const freshRole = refreshedRoles.find(
            (candidate) => candidate.id === freshMapping.discordRoleId
          );
          if (freshRole) {
            return { mapping: freshMapping, role: freshRole, created: false };
          }
        }
        const createdRole = await discordRequest<DiscordRole>(
          botToken,
          `/guilds/${primaryGuild.discordId}/roles`,
          {
            method: "POST",
            body: JSON.stringify({
              name: `⭐ ${range.label}`,
              permissions: "0",
              color: levelRoleColor(range.minLevel),
              hoist: false,
              mentionable: false
            }),
            headers: { "X-Audit-Log-Reason": "RTA dynamic level role" }
          }
        );
        const savedMapping = await tx.guildLevelRole.upsert({
          where: {
            guildId_minLevel: {
              guildId: primaryGuild.id,
              minLevel: range.minLevel
            }
          },
          update: { maxLevel: range.maxLevel, discordRoleId: createdRole.id },
          create: {
            guildId: primaryGuild.id,
            minLevel: range.minLevel,
            maxLevel: range.maxLevel,
            discordRoleId: createdRole.id
          }
        });
        return { mapping: savedMapping, role: createdRole, created: true };
      }, { maxWait: 5_000, timeout: 15_000 });
      mapping = ensured.mapping;
      currentRole = ensured.role;
      created = ensured.created;
      roleById.set(currentRole.id, currentRole);
    }
    if (currentRole.managed || currentRole.position >= botHighestPosition) {
      throw new AppError(
        `Le rôle « ${currentRole.name} » doit être placé sous le rôle principal du bot.`,
        403
      );
    }
    let added = false;
    if (!targetMember.roles.includes(currentRole.id)) {
      await discordRequest<void>(
        botToken,
        `/guilds/${primaryGuild.discordId}/members/${user.discordId}/roles/${currentRole.id}`,
        {
          method: "PUT",
          headers: { "X-Audit-Log-Reason": `RTA level ${level}` }
        }
      );
      targetMember.roles.push(currentRole.id);
      added = true;
    }
    let removed = 0;
    for (const oldMapping of existingMappings) {
      if (
        oldMapping.minLevel === range.minLevel
        || !targetMember.roles.includes(oldMapping.discordRoleId)
      ) {
        continue;
      }
      const oldRole = roleById.get(oldMapping.discordRoleId);
      if (!oldRole || oldRole.managed || oldRole.position >= botHighestPosition) continue;
      await discordRequest<void>(
        botToken,
        `/guilds/${primaryGuild.discordId}/members/${user.discordId}/roles/${oldRole.id}`,
        {
          method: "DELETE",
          headers: { "X-Audit-Log-Reason": `RTA level role replaced by ${range.label}` }
        }
      );
      removed += 1;
    }
    return {
      guildId: primaryGuild.discordId,
      guildName: primaryGuild.name,
      level,
      range,
      roleName: currentRole.name,
      created,
      added,
      removed
    };
  }
}
