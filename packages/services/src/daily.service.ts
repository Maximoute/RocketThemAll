import { prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { getEconomyConfig } from "./economy-config.js";

export class DailyService {
  async claimDaily(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { boosters: true } });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const now = new Date();
    if (user.lastDailyRewardAt) {
      const nextAt = new Date(user.lastDailyRewardAt.getTime() + 24 * 60 * 60 * 1000);
      if (nextAt.getTime() > now.getTime()) {
        throw new AppError("Récompense journalière déjà récupérée aujourd'hui.", 409);
      }
    }

    const config = await getEconomyConfig();
    const credits = Math.floor(Math.random() * (config.dailyCreditMax - config.dailyCreditMin + 1)) + config.dailyCreditMin;
    const grantedBooster = Math.random() < config.dailyBoosterChance;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { credits: { increment: credits }, lastDailyRewardAt: now } });
      if (grantedBooster) {
        await tx.userBooster.upsert({ where: { userId_boosterType: { userId, boosterType: "basic" } }, update: { quantity: { increment: 1 } }, create: { userId, boosterType: "basic", quantity: 1 } });
      }
      await tx.transactionLog.create({ data: { userId, type: "daily", amount: credits, metadata: { grantedBooster } } });
      await tx.economyLog.create({ data: { userId, type: "admin_update", amount: credits, metadata: { action: "daily", grantedBooster } } });
    });

    return { credits, grantedBooster };
  }
}