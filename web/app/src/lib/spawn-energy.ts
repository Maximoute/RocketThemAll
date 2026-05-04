import { prisma } from "@rta/database";

export type SpawnEnergySnapshot = {
  userId: string;
  charges: number;
  maxCharges: number;
  regenHours: number;
  nextChargeInMs: number | null;
  lastRegenAt: Date | null;
};

async function getSpawnConfig() {
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
      manualSpawnMaxCharges: 4,
      manualSpawnRegenHours: 6
    }
  });
}

function buildSnapshot(args: {
  userId: string;
  charges: number;
  maxCharges: number;
  regenHours: number;
  lastRegenAt: Date | null;
}): SpawnEnergySnapshot {
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

export async function getSpawnEnergySnapshot(userId: string) {
  const config = await getSpawnConfig();
  const maxCharges = Math.max(1, config.manualSpawnMaxCharges ?? 4);
  const regenHours = Math.max(1, config.manualSpawnRegenHours ?? 6);
  const intervalMs = regenHours * 60 * 60 * 1000;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("User not found");
  }

  const currentCharges = Math.min(Math.max(user.spawnCharges, 0), maxCharges);
  if (currentCharges >= maxCharges) {
    if (user.spawnCharges !== maxCharges || user.lastSpawnChargeRegenAt !== null) {
      await prisma.user.update({
        where: { id: userId },
        data: { spawnCharges: maxCharges, lastSpawnChargeRegenAt: null }
      });
    }

    return buildSnapshot({
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

  if (regenCount > 0) {
    const chargesAfter = Math.min(maxCharges, currentCharges + regenCount);
    const lastRegenAt = chargesAfter >= maxCharges ? null : new Date(baseDate.getTime() + regenCount * intervalMs);

    await prisma.user.update({
      where: { id: userId },
      data: {
        spawnCharges: chargesAfter,
        lastSpawnChargeRegenAt: lastRegenAt
      }
    });

    return buildSnapshot({
      userId,
      charges: chargesAfter,
      maxCharges,
      regenHours,
      lastRegenAt
    });
  }

  return buildSnapshot({
    userId,
    charges: currentCharges,
    maxCharges,
    regenHours,
    lastRegenAt: baseDate
  });
}

export async function adminUpdateSpawnCharges(userId: string, nextCharges: number) {
  const snapshot = await getSpawnEnergySnapshot(userId);
  const chargesAfter = Math.min(snapshot.maxCharges, Math.max(0, Math.floor(nextCharges)));
  const lastRegenAt = chargesAfter >= snapshot.maxCharges ? null : (snapshot.lastRegenAt ?? new Date());

  await prisma.user.update({
    where: { id: userId },
    data: {
      spawnCharges: chargesAfter,
      lastSpawnChargeRegenAt: lastRegenAt
    }
  });

  await prisma.spawnChargeLog.create({
    data: {
      userId,
      action: "admin_update",
      amount: chargesAfter - snapshot.charges,
      chargesBefore: snapshot.charges,
      chargesAfter
    }
  });

  return buildSnapshot({
    userId,
    charges: chargesAfter,
    maxCharges: snapshot.maxCharges,
    regenHours: snapshot.regenHours,
    lastRegenAt
  });
}