import { cardsService, prisma } from "./service-instances.js";
import { hasDiscordAdminRole, ADMIN_ROLE_ID } from "@rta/auth";

export { hasDiscordAdminRole, ADMIN_ROLE_ID };

export function formatDuration(ms: number | null) {
  if (ms === null || ms <= 0) {
    return "0h 0m";
  }

  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export async function findCardByName(cardName: string) {
  const cards = await cardsService.getCards();
  return cards.find((card) => card.name.toLowerCase() === cardName.toLowerCase());
}

export async function resolveActiveTradeForUser(userId: string) {
  return prisma.trade.findFirst({
    where: {
      status: "pending",
      expiresAt: { gt: new Date() },
      OR: [{ user1Id: userId }, { user2Id: userId }]
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function resolveIncomingTradeForUser(userId: string) {
  return prisma.trade.findFirst({
    where: {
      status: "pending",
      expiresAt: { gt: new Date() },
      user2Id: userId
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function isTradeAccepted(tradeId: string) {
  const accepted = await prisma.adminLog.findFirst({
    where: { action: "TRADE_ACCEPTED", target: tradeId }
  });
  return Boolean(accepted);
}
