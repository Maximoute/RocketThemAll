import { prisma } from "@rta/database";

export class LogsService {
  getLogs() {
    return Promise.all([
      prisma.captureLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { user: true, card: true } }),
      prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { admin: true } })
    ]);
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
