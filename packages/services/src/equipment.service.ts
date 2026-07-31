import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";

const BASE_EQUIPMENT_SLOTS = 2;

export function equipmentSlotLimitFromEffectKeys(effectKeys: string[]) {
  // EXP_EXTRA_CONSUMABLE_SLOT concerns preparation consumables for a run,
  // not permanent artifact equipment. Artifact equipment intentionally stays
  // at the two base slots requested by the game design.
  void effectKeys;
  return BASE_EQUIPMENT_SLOTS;
}

async function slotLimit(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string
) {
  const learned = await client.userSkill.findMany({
    where: { userId },
    select: { skill: { select: { effectKey: true } } }
  });
  return equipmentSlotLimitFromEffectKeys(
    learned.map((entry) => entry.skill.effectKey)
  );
}

export class EquipmentService {
  async getEquipment(userId: string) {
    const [ownedArtifacts, equipped, limit] = await Promise.all([
      prisma.userItem.findMany({
        where: {
          userId,
          quantity: { gt: 0 },
          item: { type: "ARTIFACT", status: "PUBLISHED" }
        },
        include: { item: true },
        orderBy: { item: { name: "asc" } }
      }),
      prisma.equippedArtifact.findMany({
        where: { userId },
        include: { item: true },
        orderBy: { slot: "asc" }
      }),
      slotLimit(prisma, userId)
    ]);

    return { ownedArtifacts, equipped, slotLimit: limit };
  }

  async equipArtifact(userId: string, itemId: string, slot: number) {
    await prisma.$transaction(async (tx) => {
      const limit = await slotLimit(tx, userId);
      if (!Number.isSafeInteger(slot) || slot < 1 || slot > limit) {
        throw new AppError(`Emplacement invalide : utilise un slot entre 1 et ${limit}.`, 400);
      }

      const owned = await tx.userItem.findFirst({
        where: {
          userId,
          itemId,
          quantity: { gt: 0 },
          item: { type: "ARTIFACT", status: "PUBLISHED" }
        },
        include: { item: true }
      });
      if (!owned) {
        throw new AppError("Tu ne possèdes pas cet artefact.", 409);
      }

      await tx.equippedArtifact.deleteMany({ where: { userId, itemId } });
      await tx.equippedArtifact.upsert({
        where: { userId_slot: { userId, slot } },
        update: { itemId },
        create: { userId, itemId, slot }
      });
    });

    return this.getEquipment(userId);
  }

  async unequipSlot(userId: string, slot: number) {
    const limit = await slotLimit(prisma, userId);
    if (!Number.isSafeInteger(slot) || slot < 1 || slot > limit) {
      throw new AppError(`Emplacement invalide : utilise un slot entre 1 et ${limit}.`, 400);
    }
    await prisma.equippedArtifact.deleteMany({ where: { userId, slot } });
    return this.getEquipment(userId);
  }
}
