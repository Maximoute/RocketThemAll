import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function assertCardCanLeaveCollection(
  client: DbClient,
  input: {
    userId: string;
    cardId: string;
    quantity: number;
    variant?: "normal" | "shiny" | "holo";
    confirmedLastCopy?: boolean;
  }
) {
  const rows = await client.inventoryItem.findMany({
    where: {
      userId: input.userId,
      cardId: input.cardId,
      ...(input.variant ? { variant: input.variant } : {})
    },
    select: {
      id: true,
      quantity: true,
      archive: { select: { id: true } }
    }
  });
  const owned = rows.reduce((sum, row) => sum + row.quantity, 0);
  if (rows.some((row) => row.archive) && input.quantity > 0) {
    throw new AppError(
      "Cette carte est verrouillée dans les Archives. Retire-la des Archives avant de la céder.",
      409
    );
  }
  if (owned < input.quantity) {
    throw new AppError("Tu ne possèdes pas assez d'exemplaires de cette carte.", 409);
  }

  const protection = await client.userSkill.findFirst({
    where: {
      userId: input.userId,
      rank: { gt: 0 },
      skill: { effectKey: "COL_PROTECT_LAST_COPY", status: "PUBLISHED" }
    },
    select: { id: true }
  });
  if (protection && owned - input.quantity <= 0 && !input.confirmedLastCopy) {
    throw new AppError(
      "DERNIER_EXEMPLAIRE: cette action retirerait le dernier exemplaire. Une confirmation renforcée est requise.",
      409
    );
  }
}
