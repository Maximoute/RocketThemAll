import { prisma } from "@rta/database";

export type GuildActivityLogInput = {
  guildId?: string | null;
  guildName?: string | null;
  channelId?: string | null;
  userId?: string | null;
  discordUserId?: string | null;
  username?: string | null;
  category: string;
  action: string;
  status?: string | null;
  summary: string;
  details?: unknown;
};

export class LogsService {
  getLogs() {
    return Promise.all([
      prisma.captureLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { user: true, card: true } }),
      prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { admin: true } })
    ]);
  }

  listGuildActivityLogs(guildId: string, take = 300) {
    return prisma.guildActivityLog.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take
    });
  }

  async logGuildEvent(input: GuildActivityLogInput) {
    if (!input.guildId) {
      return null;
    }

    return prisma.guildActivityLog.create({
      data: {
        guildId: input.guildId,
        guildName: input.guildName ?? undefined,
        channelId: input.channelId ?? undefined,
        userId: input.userId ?? undefined,
        discordUserId: input.discordUserId ?? undefined,
        username: input.username ?? undefined,
        category: input.category,
        action: input.action,
        status: input.status ?? undefined,
        summary: input.summary,
        details: input.details as never
      }
    });
  }

  addAdminLog(adminId: string | null, action: string, target?: string, metadata?: unknown) {
    return prisma.adminLog.create({
      data: {
        adminId: adminId ?? undefined,
        action,
        target,
        metadata: metadata as never
      }
    });
  }
}
