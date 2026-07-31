import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";

const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/;
const GATE_ITEM_GRANTS: Partial<Record<string, string>> = {
  EXP_CARTOGRAPHER_GRANT_SCANNER: "artifact.spectral_scanner",
  HUN_TAMER_GRANT_GAUNTLET: "artifact.momentum_gauntlet",
  COL_CONSERVATOR_GRANT_VAULT: "artifact.archive_vault"
};

function stringList(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export class SkillService {
  private async reconcileProgress(userId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("Utilisateur introuvable", 404);

      const learned = await tx.userSkill.findMany({
        where: { userId },
        include: { skill: { select: { cost: true } } }
      });
      const spentPoints = learned.reduce((total, entry) => total + entry.skill.cost, 0);
      const earnedPoints = Math.max(0, user.level - 1);
      const minimumAvailable = Math.max(0, earnedPoints - spentPoints);
      const current = await tx.userProgress.upsert({
        where: { userId },
        update: { level: user.level, xp: user.xp },
        create: {
          userId,
          level: user.level,
          xp: user.xp,
          unspentSkillPoints: minimumAvailable
        }
      });

      if (current.unspentSkillPoints >= minimumAvailable) return current;
      return tx.userProgress.update({
        where: { userId },
        data: {
          unspentSkillPoints: minimumAvailable,
          version: { increment: 1 }
        }
      });
    });
  }

  async getTree(userId: string) {
    await this.reconcileProgress(userId);
    const [definitions, learnedSkills, progress, state] = await Promise.all([
      prisma.skillDefinition.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ branch: "asc" }, { sortOrder: "asc" }]
      }),
      prisma.userSkill.findMany({
        where: { userId },
        include: { skill: true }
      }),
      prisma.userProgress.findUniqueOrThrow({ where: { userId } }),
      prisma.userSkillState.findUnique({ where: { userId } })
    ]);
    const learnedKeys = new Set(learnedSkills.map((entry) => entry.skill.contentKey));

    return {
      definitions: definitions.map((definition) => ({
        ...definition,
        prerequisiteKeys: stringList(definition.prerequisites),
        learned: learnedKeys.has(definition.contentKey),
        prerequisitesMet: stringList(definition.prerequisites).every((key) => learnedKeys.has(key))
      })),
      learnedSkills,
      progress,
      state
    };
  }

  async unlockSkill(userId: string, contentKey: string, idempotencyKey: string) {
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppError("Une clé d'idempotence valide est requise", 400);
    }
    const normalizedKey = contentKey.trim().toUpperCase();
    const operationKey = `skill-unlock:${userId}:${idempotencyKey}`;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`
      );
      const replay = await tx.economicLedgerEntry.findUnique({ where: { operationKey } });
      if (replay) {
        return {
          contentKey: replay.referenceId,
          cost: Math.abs(replay.delta),
          replayed: true
        };
      }

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("Utilisateur introuvable", 404);

      const node = await tx.skillDefinition.findUnique({ where: { contentKey: normalizedKey } });
      if (!node || node.status !== "PUBLISHED") {
        throw new AppError("Compétence introuvable", 404);
      }

      const learned = await tx.userSkill.findMany({
        where: { userId },
        include: { skill: { select: { contentKey: true, cost: true } } }
      });
      if (learned.some((entry) => entry.skillId === node.id)) {
        throw new AppError("Cette compétence est déjà débloquée", 409);
      }
      const learnedKeys = new Set(learned.map((entry) => entry.skill.contentKey));
      const missingPrerequisite = stringList(node.prerequisites).find((key) => !learnedKeys.has(key));
      if (missingPrerequisite) {
        throw new AppError(`Prérequis manquant : ${missingPrerequisite}`, 409);
      }

      const spentPoints = learned.reduce((total, entry) => total + entry.skill.cost, 0);
      const minimumAvailable = Math.max(0, user.level - 1 - spentPoints);
      let progress = await tx.userProgress.upsert({
        where: { userId },
        update: { level: user.level, xp: user.xp },
        create: {
          userId,
          level: user.level,
          xp: user.xp,
          unspentSkillPoints: minimumAvailable
        }
      });
      if (progress.unspentSkillPoints < minimumAvailable) {
        progress = await tx.userProgress.update({
          where: { userId },
          data: {
            unspentSkillPoints: minimumAvailable,
            version: { increment: 1 }
          }
        });
      }
      if (progress.unspentSkillPoints < node.cost) {
        throw new AppError("Pas assez de points de compétence", 409);
      }

      const state = await tx.userSkillState.upsert({
        where: { userId },
        update: {},
        create: { userId }
      });
      if (node.kind === "SPECIALIZATION_GATE") {
        if (state.committedSpecialization) {
          throw new AppError(
            `Termine d'abord la spécialisation ${state.committedSpecialization}`,
            409
          );
        }
        if (!node.specialization) {
          throw new AppError("Spécialisation invalide", 500);
        }
      }
      if (node.kind === "SPECIALIZATION_UPGRADE") {
        if (!node.specialization) {
          throw new AppError("Spécialisation invalide", 500);
        }
        if (
          state.committedSpecialization &&
          state.committedSpecialization !== node.specialization
        ) {
          throw new AppError(
            `Termine d'abord la spécialisation ${state.committedSpecialization}`,
            409
          );
        }
      }

      const pointsBefore = progress.unspentSkillPoints;
      const grantedItemKey =
        node.grantsItemKey ?? GATE_ITEM_GRANTS[node.effectKey] ?? null;
      await tx.userSkill.create({
        data: { userId, skillId: node.id, rank: 1 }
      });
      if (
        node.effectKey === "EXP_MAX_CHARGE_PLUS_ONE" &&
        user.explorationRegenAt === null
      ) {
        await tx.user.update({
          where: { id: userId },
          data: { explorationRegenAt: new Date() }
        });
      }
      await tx.userProgress.update({
        where: { userId },
        data: {
          unspentSkillPoints: { decrement: node.cost },
          version: { increment: 1 }
        }
      });

      if (node.kind === "SPECIALIZATION_GATE") {
        await tx.userSkillState.update({
          where: { userId },
          data: {
            committedBranch: node.branch,
            committedSpecialization: node.specialization,
            commitmentRank: 0,
            version: { increment: 1 }
          }
        });
      } else if (node.kind === "SPECIALIZATION_UPGRADE") {
        const completed = node.tier >= 3;
        await tx.userSkillState.update({
          where: { userId },
          data: {
            committedBranch: completed ? null : node.branch,
            committedSpecialization: completed ? null : node.specialization,
            commitmentRank: completed ? 0 : node.tier,
            version: { increment: 1 }
          }
        });
      }

      if (grantedItemKey) {
        const item = await tx.itemDefinition.findUnique({
          where: { contentKey: grantedItemKey }
        });
        if (item?.status === "PUBLISHED") {
          await tx.userItem.upsert({
            where: { userId_itemId: { userId, itemId: item.id } },
            update: { version: { increment: 1 } },
            create: { userId, itemId: item.id, quantity: 1 }
          });
        }
      }

      await tx.economicLedgerEntry.create({
        data: {
          userId,
          asset: "SKILL_POINT",
          assetKey: node.branch,
          delta: -node.cost,
          balanceBefore: pointsBefore,
          balanceAfter: pointsBefore - node.cost,
          reason: "skill.unlocked",
          referenceType: "SkillDefinition",
          referenceId: node.contentKey,
          operationKey,
          metadata: {
            name: node.name,
            branch: node.branch,
            specialization: node.specialization,
            grantedItemKey
          }
        }
      });
      await tx.transactionLog.create({
        data: {
          userId,
          type: "skill",
          amount: -node.cost,
          metadata: { action: "unlock", contentKey: node.contentKey, operationKey }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `${operationKey}:completed`,
          aggregateType: "User",
          aggregateId: userId,
          eventType: "skill.unlocked",
          eventVersion: 1,
          payload: { userId, contentKey: node.contentKey, cost: node.cost }
        }
      });

      return { contentKey: node.contentKey, cost: node.cost, replayed: false };
    });
  }
}
