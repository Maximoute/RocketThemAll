import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { supporterAccessInTransaction } from "./monetization.service.js";

export const BASE_EXPLORATION_CHARGES = 4;
export const BASE_EXPLORATION_REGEN_MINUTES = 5;
const MIN_EXPLORATION_REGEN_MINUTES = 1;

export type ExplorationEnergySnapshot = {
  userId: string;
  charges: number;
  maxCharges: number;
  isUnlimited: boolean;
  regenIntervalMinutes: number;
  regenStartedAt: Date | null;
  nextChargeAt: Date | null;
};

export function calculateExplorationEnergy(input: {
  charges: number;
  maxCharges: number;
  regenStartedAt: Date | null;
  regenIntervalMinutes: number;
  now: Date;
}) {
  const maxCharges = Math.max(1, Math.floor(input.maxCharges));
  const intervalMs =
    Math.max(MIN_EXPLORATION_REGEN_MINUTES, input.regenIntervalMinutes) * 60_000;
  let charges = Math.min(maxCharges, Math.max(0, Math.floor(input.charges)));
  let regenStartedAt = input.regenStartedAt;

  if (charges >= maxCharges) {
    return {
      charges: maxCharges,
      regenStartedAt: null,
      nextChargeAt: null
    };
  }

  if (!regenStartedAt || regenStartedAt.getTime() > input.now.getTime()) {
    regenStartedAt = input.now;
  }
  const elapsedMs = Math.max(0, input.now.getTime() - regenStartedAt.getTime());
  const regenerated = Math.floor(elapsedMs / intervalMs);
  if (regenerated > 0) {
    charges = Math.min(maxCharges, charges + regenerated);
    regenStartedAt = charges >= maxCharges
      ? null
      : new Date(regenStartedAt.getTime() + regenerated * intervalMs);
  }

  return {
    charges,
    regenStartedAt,
    nextChargeAt: regenStartedAt
      ? new Date(regenStartedAt.getTime() + intervalMs)
      : null
  };
}

function numericParam(value: Prisma.JsonValue, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const parsed = Number((value as Record<string, Prisma.JsonValue>)[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function energyRules(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date
) {
  const [learned, supporter] = await Promise.all([
    tx.userSkill.findMany({
      where: {
        userId,
        rank: { gt: 0 },
        skill: { status: "PUBLISHED" }
      },
      select: {
        rank: true,
        skill: {
          select: {
            effectKey: true,
            effectParams: true
          }
        }
      }
    }),
    supporterAccessInTransaction(tx, userId, now)
  ]);

  let maxChargeBonus = 0;
  let regenReductionMinutes = 0;
  for (const entry of learned) {
    if (entry.skill.effectKey === "EXP_MAX_CHARGE_PLUS_ONE") {
      maxChargeBonus += Math.max(1, entry.rank);
    }
    if (entry.skill.effectKey === "EXP_CHARGE_REGEN_REDUCTION") {
      regenReductionMinutes +=
        numericParam(entry.skill.effectParams, "minutes") * Math.max(1, entry.rank);
    }
  }

  return {
    maxCharges:
      BASE_EXPLORATION_CHARGES +
      maxChargeBonus +
      supporter.maxExplorationChargeBonus,
    regenIntervalMinutes: Math.max(
      MIN_EXPLORATION_REGEN_MINUTES,
      BASE_EXPLORATION_REGEN_MINUTES - regenReductionMinutes
    )
  };
}

function snapshot(
  userId: string,
  rules: { maxCharges: number; regenIntervalMinutes: number },
  state: ReturnType<typeof calculateExplorationEnergy>,
  isUnlimited: boolean
): ExplorationEnergySnapshot {
  return {
    userId,
    charges: state.charges,
    maxCharges: rules.maxCharges,
    isUnlimited,
    regenIntervalMinutes: rules.regenIntervalMinutes,
    regenStartedAt: state.regenStartedAt,
    nextChargeAt: isUnlimited ? null : state.nextChargeAt
  };
}

export class ExplorationEnergyService {
  async getSnapshot(userId: string, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
      );
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("Profil joueur introuvable.", 404);
      const rules = await energyRules(tx, userId, now);
      const state = calculateExplorationEnergy({
        charges: user.explorationCharges,
        maxCharges: rules.maxCharges,
        regenStartedAt: user.explorationRegenAt,
        regenIntervalMinutes: rules.regenIntervalMinutes,
        now
      });
      if (
        user.explorationCharges !== state.charges ||
        user.explorationRegenAt?.getTime() !== state.regenStartedAt?.getTime()
      ) {
        await tx.user.update({
          where: { id: userId },
          data: {
            explorationCharges: state.charges,
            explorationRegenAt: state.regenStartedAt
          }
        });
      }
      return snapshot(userId, rules, state, user.unlimitedExplorations);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
  }

  async consumeInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    now = new Date()
  ) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
    );
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("Profil joueur introuvable.", 404);
    const rules = await energyRules(tx, userId, now);
    const current = calculateExplorationEnergy({
      charges: user.explorationCharges,
      maxCharges: rules.maxCharges,
      regenStartedAt: user.explorationRegenAt,
      regenIntervalMinutes: rules.regenIntervalMinutes,
      now
    });
    if (user.unlimitedExplorations) {
      return {
        consumed: false,
        before: current.charges,
        after: current.charges,
        snapshot: snapshot(userId, rules, current, true)
      };
    }
    if (current.charges <= 0) {
      const minutes = current.nextChargeAt
        ? Math.max(1, Math.ceil((current.nextChargeAt.getTime() - now.getTime()) / 60_000))
        : rules.regenIntervalMinutes;
      throw new AppError(
        `Tu n'as plus de charge d'exploration. Prochaine charge dans environ ${minutes} minute(s).`,
        429
      );
    }

    const charges = current.charges - 1;
    const regenStartedAt = current.charges >= rules.maxCharges
      ? now
      : current.regenStartedAt ?? now;
    const nextChargeAt = new Date(
      regenStartedAt.getTime() + rules.regenIntervalMinutes * 60_000
    );
    await tx.user.update({
      where: { id: userId },
      data: {
        explorationCharges: charges,
        explorationRegenAt: regenStartedAt
      }
    });

    return {
      consumed: true,
      before: current.charges,
      after: charges,
      snapshot: {
        userId,
        charges,
        maxCharges: rules.maxCharges,
        isUnlimited: false,
        regenIntervalMinutes: rules.regenIntervalMinutes,
        regenStartedAt,
        nextChargeAt
      } satisfies ExplorationEnergySnapshot
    };
  }
}
