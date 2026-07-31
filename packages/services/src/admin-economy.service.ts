import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { applyXpGain } from "./xp.service.js";

function safeDelta(value: number, label: string) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 100_000_000) {
    throw new AppError(`${label} invalide.`, 400);
  }
  return value;
}

function cleanReason(value: string) {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 240) {
    throw new AppError("Le motif admin doit contenir entre 3 et 240 caractères.", 400);
  }
  return reason;
}

export class AdminEconomyService {
  async adjustBalance(input: {
    adminId: string;
    userId: string;
    creditDelta?: number;
    fragmentDelta?: number;
    reason: string;
    operationKey: string;
  }) {
    const creditDelta = safeDelta(input.creditDelta ?? 0, "Variation de crédits");
    const fragmentDelta = safeDelta(input.fragmentDelta ?? 0, "Variation de fragments");
    const reason = cleanReason(input.reason);
    if (creditDelta === 0 && fragmentDelta === 0) {
      throw new AppError("Indique une variation de crédits ou de fragments.", 400);
    }

    return prisma.$transaction(async (tx) => {
      const replayKey = `${input.operationKey}:${creditDelta !== 0 ? "credits" : "fragments"}`;
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: replayKey }
      });
      if (replay) {
        return tx.user.findUniqueOrThrow({ where: { id: input.userId } });
      }

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`
      );
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
      const credits = user.credits + creditDelta;
      const fragments = user.fragments + fragmentDelta;
      if (credits < 0 || fragments < 0) {
        throw new AppError("Cette opération rendrait le solde du joueur négatif.", 409);
      }

      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          credits,
          fragments,
          balanceVersion: { increment: 1 }
        }
      });

      if (creditDelta !== 0) {
        await tx.economicLedgerEntry.create({
          data: {
            userId: user.id,
            asset: "CREDITS",
            delta: creditDelta,
            balanceBefore: user.credits,
            balanceAfter: credits,
            reason: "admin.balance_adjustment",
            referenceType: "AdminUserAdjustment",
            referenceId: input.adminId,
            operationKey: `${input.operationKey}:credits`,
            metadata: { reason, adminId: input.adminId }
          }
        });
      }
      if (fragmentDelta !== 0) {
        await tx.economicLedgerEntry.create({
          data: {
            userId: user.id,
            asset: "FRAGMENTS",
            delta: fragmentDelta,
            balanceBefore: user.fragments,
            balanceAfter: fragments,
            reason: "admin.balance_adjustment",
            referenceType: "AdminUserAdjustment",
            referenceId: input.adminId,
            operationKey: `${input.operationKey}:fragments`,
            metadata: { reason, adminId: input.adminId }
          }
        });
      }
      await tx.transactionLog.create({
        data: {
          userId: user.id,
          type: "admin_balance_adjustment",
          amount: creditDelta,
          metadata: { creditDelta, fragmentDelta, reason, adminId: input.adminId }
        }
      });
      await tx.economyLog.create({
        data: {
          userId: user.id,
          type: "admin_balance_adjustment",
          amount: creditDelta,
          metadata: { creditDelta, fragmentDelta, reason, adminId: input.adminId }
        }
      });
      await tx.adminLog.create({
        data: {
          adminId: input.adminId,
          action: "USER_BALANCE_ADJUSTED",
          target: user.id,
          metadata: {
            creditDelta,
            fragmentDelta,
            creditsBefore: user.credits,
            creditsAfter: credits,
            fragmentsBefore: user.fragments,
            fragmentsAfter: fragments,
            reason
          }
        }
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async grantXp(input: {
    adminId: string;
    userId: string;
    xp: number;
    reason: string;
    operationKey: string;
  }) {
    const xp = safeDelta(input.xp, "Quantité d’XP");
    const reason = cleanReason(input.reason);
    if (xp <= 0) throw new AppError("L’XP accordée doit être positive.", 400);

    return prisma.$transaction(async (tx) => {
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: `${input.operationKey}:xp` }
      });
      if (replay) return tx.user.findUniqueOrThrow({ where: { id: input.userId } });

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`
      );
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
      const progress = await tx.userProgress.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, level: user.level, xp: user.xp }
      });
      const result = applyXpGain(progress.level, progress.xp, xp);
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { level: result.level, xp: result.xp }
      });
      await tx.userProgress.update({
        where: { userId: user.id },
        data: {
          level: result.level,
          xp: result.xp,
          unspentSkillPoints: { increment: result.levelsGained },
          version: { increment: 1 }
        }
      });
      await tx.economicLedgerEntry.create({
        data: {
          userId: user.id,
          asset: "XP",
          delta: xp,
          balanceBefore: progress.xp,
          balanceAfter: result.xp,
          reason: "admin.xp_grant",
          referenceType: "AdminUserAdjustment",
          referenceId: input.adminId,
          operationKey: `${input.operationKey}:xp`,
          metadata: { reason, adminId: input.adminId, levelsGained: result.levelsGained }
        }
      });
      await tx.transactionLog.create({
        data: {
          userId: user.id,
          type: "admin_xp_grant",
          amount: xp,
          metadata: { reason, adminId: input.adminId, levelsGained: result.levelsGained }
        }
      });
      await tx.adminLog.create({
        data: {
          adminId: input.adminId,
          action: "USER_XP_GRANTED",
          target: user.id,
          metadata: { xp, reason, levelsGained: result.levelsGained }
        }
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async grantItem(input: {
    adminId: string;
    userId: string;
    itemKey: string;
    quantity: number;
    reason: string;
    operationKey: string;
  }) {
    const requested = safeDelta(input.quantity, "Quantité d’objet");
    const reason = cleanReason(input.reason);
    if (requested <= 0) throw new AppError("La quantité doit être positive.", 400);

    return prisma.$transaction(async (tx) => {
      const replay = await tx.economicLedgerEntry.findUnique({
        where: { operationKey: `${input.operationKey}:item` }
      });
      if (replay) return replay;
      const item = await tx.itemDefinition.findUnique({
        where: { contentKey: input.itemKey.trim() }
      });
      if (!item || item.status !== "PUBLISHED") {
        throw new AppError("Objet publié introuvable.", 404);
      }
      const owned = await tx.userItem.findUnique({
        where: { userId_itemId: { userId: input.userId, itemId: item.id } }
      });
      const before = owned?.quantity ?? 0;
      const amount = Math.min(requested, Math.max(0, item.maxStack - before));
      if (amount <= 0) throw new AppError("La pile de cet objet est déjà pleine.", 409);
      await tx.userItem.upsert({
        where: { userId_itemId: { userId: input.userId, itemId: item.id } },
        update: { quantity: { increment: amount }, version: { increment: 1 } },
        create: { userId: input.userId, itemId: item.id, quantity: amount }
      });
      const ledger = await tx.economicLedgerEntry.create({
        data: {
          userId: input.userId,
          asset: "ITEM",
          assetKey: item.contentKey,
          delta: amount,
          balanceBefore: before,
          balanceAfter: before + amount,
          reason: "admin.item_grant",
          referenceType: "AdminUserAdjustment",
          referenceId: input.adminId,
          operationKey: `${input.operationKey}:item`,
          metadata: { reason, adminId: input.adminId, requested }
        }
      });
      await tx.adminLog.create({
        data: {
          adminId: input.adminId,
          action: "USER_ITEM_GRANTED",
          target: input.userId,
          metadata: { itemKey: item.contentKey, quantity: amount, reason }
        }
      });
      return ledger;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
