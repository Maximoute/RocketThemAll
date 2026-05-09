import { prisma } from "@rta/database";
import { AppError } from "./errors.js";
import { getEconomyConfig, getFragmentReward, getRecyclePrice } from "./economy-config.js";
import { LogsService, type GuildActivityLogInput } from "./logs.service.js";

type VariantName = "normal" | "shiny" | "holo";

export class RecycleService {
  private readonly logsService = new LogsService();

  async recycleCard(
    userId: string,
    cardId: string,
    quantity: number,
    variant: VariantName | "any" = "any",
    context?: Pick<GuildActivityLogInput, "guildId" | "guildName" | "channelId" | "discordUserId" | "username">
  ) {
    const safeQuantity = Math.max(1, Math.floor(quantity));
    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { rarity: true } });
    if (!card) {
      throw new AppError("Card not found", 404);
    }

    const inventoryRows = await prisma.inventoryItem.findMany({
      where: {
        userId,
        cardId,
        ...(variant === "any" ? {} : { variant })
      },
      orderBy: [
        { variant: "asc" },
        { quantity: "desc" }
      ]
    });
    const totalOwned = inventoryRows.reduce((sum, row) => sum + row.quantity, 0);
    if (totalOwned < safeQuantity) {
      throw new AppError("Not enough cards in inventory", 409);
    }

    const config = await getEconomyConfig();
    const unitCredits = getRecyclePrice(config, card.rarity.name as keyof typeof import("./economy-config.js").RECYCLE_PRICE_KEYS);
    const unitFragments = getFragmentReward(config, card.rarity.name as keyof typeof import("./economy-config.js").FRAGMENT_REWARD_KEYS);
    const credits = unitCredits * safeQuantity;
    const fragments = unitFragments * safeQuantity;

    await prisma.$transaction(async (tx) => {
      let remaining = safeQuantity;
      for (const row of inventoryRows) {
        if (remaining <= 0) break;
        const remove = Math.min(remaining, row.quantity);
        remaining -= remove;

        if (row.quantity === remove) {
          await tx.inventoryItem.delete({ where: { id: row.id } });
        } else {
          await tx.inventoryItem.update({ where: { id: row.id }, data: { quantity: { decrement: remove } } });
        }
      }

      await tx.user.update({ where: { id: userId }, data: { credits: { increment: credits }, fragments: { increment: fragments } } });
      await tx.fragmentBalance.upsert({
        where: { userId_rarityId: { userId, rarityId: card.rarityId } },
        update: { quantity: { increment: fragments } },
        create: { userId, rarityId: card.rarityId, quantity: fragments }
      });
      await tx.transactionLog.create({ data: { userId, type: "recycle", amount: credits, metadata: { cardId, quantity: safeQuantity, fragments, variant } } });
      await tx.economyLog.create({ data: { userId, type: "sell", amount: credits, metadata: { action: "recycle", cardId, quantity: safeQuantity, fragments, variant } } });
    });

    await this.logsService.logGuildEvent({
      ...context,
      userId,
      category: "recycle",
      action: "card_recycled",
      status: "success",
      summary: `${context?.username ?? userId} a recyclé ${safeQuantity}x ${card.name}`,
      details: {
        cardId,
        cardName: card.name,
        quantity: safeQuantity,
        variant,
        credits,
        fragments
      }
    });

    return { credits, fragments, quantity: safeQuantity, card, variant };
  }
}