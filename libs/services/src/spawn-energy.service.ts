import { prisma } from "@rta/database";
import { AppError } from "./errors.js";

type EnergySnapshot = {
  userId: string;
  charges: number;
  maxCharges: number;
  regenHours: number;
  nextChargeInMs: number | null;
  lastRegenAt: Date | null;
};

export class SpawnEnergyService {
  private async getConfig() {
    return prisma.appConfig.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        spawnIntervalS: 300,
        captureCooldownS: 5,
        autoSpawnEnabled: true,
        autoSpawnIntervalMinutes: 5,
        manualSpawnEnabled: true,
        manualSpawnCooldownMinutes: 120,
        manualSpawnMaxCharges: 4,
        manualSpawnRegenHours: 6
      }
    });
  }

  private buildSnapshot(args: {
    userId: string;
    charges: number;
    maxCharges: number;
    regenHours: number;
    lastRegenAt: Date | null;
  }): EnergySnapshot {
    const intervalMs = args.regenHours * 60 * 60 * 1000;
    let nextChargeInMs: number | null = null;

    if (args.charges < args.maxCharges) {
      const base = args.lastRegenAt?.getTime() ?? Date.now();
      const elapsed = Date.now() - base;
      const remainder = elapsed % intervalMs;
      nextChargeInMs = remainder === 0 ? intervalMs : intervalMs - remainder;
    }

    return {
      userId: args.userId,
      charges: args.charges,
      maxCharges: args.maxCharges,
      regenHours: args.regenHours,
      nextChargeInMs,
      lastRegenAt: args.lastRegenAt
    };
  }

  async regenerateSpawnCharges(userId: string) {
    const config = await this.getConfig();
    const maxCharges = Math.max(1, config.manualSpawnMaxCharges ?? 4);
    const regenHours = Math.max(1, config.manualSpawnRegenHours ?? 6);
    const intervalMs = regenHours * 60 * 60 * 1000;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const currentCharges = Math.min(Math.max(user.spawnCharges, 0), maxCharges);
    if (currentCharges >= maxCharges) {
      if (user.spawnCharges !== maxCharges || user.lastSpawnChargeRegenAt !== null) {
        await prisma.user.update({
          where: { id: userId },
          data: { spawnCharges: maxCharges, lastSpawnChargeRegenAt: null }
        });
      }

      return this.buildSnapshot({
        userId,
        charges: maxCharges,
        maxCharges,
        regenHours,
        lastRegenAt: null
      });
    }

    const now = Date.now();
    const baseDate = user.lastSpawnChargeRegenAt ?? new Date(now);
    const elapsed = now - baseDate.getTime();
    const regenCount = Math.max(0, Math.floor(elapsed / intervalMs));

    if (regenCount <= 0) {
      return this.buildSnapshot({
        userId,
        charges: currentCharges,
        maxCharges,
        regenHours,
        lastRegenAt: baseDate
      });
    }

    const chargesAfter = Math.min(maxCharges, currentCharges + regenCount);
    const lastRegenAt = chargesAfter >= maxCharges ? null : new Date(baseDate.getTime() + regenCount * intervalMs);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          spawnCharges: chargesAfter,
          lastSpawnChargeRegenAt: lastRegenAt
        }
      });

      await tx.spawnChargeLog.create({
        data: {
          userId,
          action: "regen",
          amount: chargesAfter - currentCharges,
          chargesBefore: currentCharges,
          chargesAfter
        }
      });
    });

    return this.buildSnapshot({
      userId,
      charges: chargesAfter,
      maxCharges,
      regenHours,
      lastRegenAt
    });
  }

  async getUserSpawnCharges(userId: string) {
    return this.regenerateSpawnCharges(userId);
  }

  async consumeSpawnCharge(userId: string) {
    const snapshot = await this.regenerateSpawnCharges(userId);
    if (snapshot.charges <= 0) {
      throw new AppError("NO_SPAWN_CHARGES", 429);
    }

    const chargesBefore = snapshot.charges;
    const chargesAfter = Math.max(0, chargesBefore - 1);
    const nextBase = chargesBefore >= snapshot.maxCharges || !snapshot.lastRegenAt ? new Date() : snapshot.lastRegenAt;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          spawnCharges: chargesAfter,
          lastSpawnChargeRegenAt: chargesAfter >= snapshot.maxCharges ? null : nextBase
        }
      });

      await tx.spawnChargeLog.create({
        data: {
          userId,
          action: "consume",
          amount: 1,
          chargesBefore,
          chargesAfter
        }
      });
    });

    return this.buildSnapshot({
      userId,
      charges: chargesAfter,
      maxCharges: snapshot.maxCharges,
      regenHours: snapshot.regenHours,
      lastRegenAt: chargesAfter >= snapshot.maxCharges ? null : nextBase
    });
  }

  async getTimeUntilNextCharge(userId: string) {
    const snapshot = await this.regenerateSpawnCharges(userId);
    return snapshot.nextChargeInMs;
  }

  async adminUpdateCharges(userId: string, nextCharges: number) {
    const snapshot = await this.regenerateSpawnCharges(userId);
    const chargesAfter = Math.min(snapshot.maxCharges, Math.max(0, Math.floor(nextCharges)));
    const lastRegenAt = chargesAfter >= snapshot.maxCharges ? null : (snapshot.lastRegenAt ?? new Date());

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          spawnCharges: chargesAfter,
          lastSpawnChargeRegenAt: lastRegenAt
        }
      });

      await tx.spawnChargeLog.create({
        data: {
          userId,
          action: "admin_update",
          amount: chargesAfter - snapshot.charges,
          chargesBefore: snapshot.charges,
          chargesAfter
        }
      });
    });

    return this.buildSnapshot({
      userId,
      charges: chargesAfter,
      maxCharges: snapshot.maxCharges,
      regenHours: snapshot.regenHours,
      lastRegenAt
    });
  }
}