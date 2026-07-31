import { Prisma, prisma } from "@rta/database";
import { AppError } from "./errors.js";

const BASE_ARCHIVE_SLOTS = 3;

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function weekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

async function archiveLimit(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string
) {
  const bonus = await client.userSkill.findFirst({
    where: {
      userId,
      rank: { gt: 0 },
      skill: { effectKey: "COL_ARCHIVE_PLUS_THREE_SLOTS", status: "PUBLISHED" }
    },
    select: { id: true }
  });
  return BASE_ARCHIVE_SLOTS + (bonus ? 3 : 0);
}

async function assertVaultEquipped(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string
) {
  const equipped = await client.equippedArtifact.findFirst({
    where: {
      userId,
      item: { effectKey: "EXP_ARCHIVE_RESONANCE", status: "PUBLISHED" }
    },
    select: { id: true }
  });
  if (!equipped) {
    throw new AppError("Équipe le Coffre d'archives pour utiliser les Archives.", 409);
  }
}

export class ArchiveService {
  async getArchive(userId: string) {
    const [limit, entries, state] = await Promise.all([
      archiveLimit(prisma, userId),
      prisma.archivedCard.findMany({
        where: { userId },
        include: {
          inventoryItem: {
            include: { card: { include: { deck: true, rarity: true } } }
          }
        },
        orderBy: { slot: "asc" }
      }),
      prisma.userGameplayState.findUnique({ where: { userId } })
    ]);
    const weekly = state?.weeklyStateKey === weekKey()
      ? jsonRecord(state.weeklyState)
      : {};
    const counters = jsonRecord(state?.counters);
    const pinnedCardIds = Array.isArray(counters.pinnedMissingCardIds)
      ? counters.pinnedMissingCardIds.filter(
          (value): value is string => typeof value === "string"
        ).slice(0, 3)
      : [];
    const pinnedMissingCards = pinnedCardIds.length > 0
      ? await prisma.card.findMany({
          where: { id: { in: pinnedCardIds }, status: "PUBLISHED", isActive: true },
          include: { deck: true, rarity: true }
        })
      : [];
    return {
      limit,
      entries,
      wishlistDeckId: state?.wishlistDeckId ?? null,
      pinnedMissingCards: pinnedCardIds
        .map((cardId) => pinnedMissingCards.find((card) => card.id === cardId))
        .filter((card): card is NonNullable<typeof card> => Boolean(card)),
      weeklyUniqueCards: Array.isArray(weekly.archivedCardIds)
        ? weekly.archivedCardIds.length
        : 0,
      weeklyClaimed: weekly.exhibitionClaimed === true
    };
  }

  async archiveCard(userId: string, inventoryItemId: string, slot: number) {
    return prisma.$transaction(async (tx) => {
      await assertVaultEquipped(tx, userId);
      const limit = await archiveLimit(tx, userId);
      if (!Number.isSafeInteger(slot) || slot < 1 || slot > limit) {
        throw new AppError(`Emplacement d'archives invalide (1 à ${limit}).`, 400);
      }
      const owned = await tx.inventoryItem.findFirst({
        where: { id: inventoryItemId, userId, quantity: { gt: 0 } },
        select: { id: true }
      });
      if (!owned) throw new AppError("Cette carte n'est plus dans ta collection.", 409);
      await tx.archivedCard.deleteMany({ where: { userId, slot } });
      await tx.archivedCard.upsert({
        where: { inventoryItemId },
        update: { userId, slot },
        create: { userId, inventoryItemId, slot }
      });
      const state = await tx.userGameplayState.findUnique({ where: { userId } });
      const currentWeekKey = weekKey();
      const weekly = state?.weeklyStateKey === currentWeekKey
        ? jsonRecord(state.weeklyState)
        : {};
      const archivedCardIds = new Set(
        Array.isArray(weekly.archivedCardIds)
          ? weekly.archivedCardIds.filter((value): value is string => typeof value === "string")
          : []
      );
      const inventory = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: inventoryItemId },
        select: { cardId: true }
      });
      archivedCardIds.add(inventory.cardId);
      await tx.userGameplayState.upsert({
        where: { userId },
        update: {
          weeklyStateKey: currentWeekKey,
          weeklyState: {
            archivedCardIds: [...archivedCardIds],
            exhibitionClaimed: weekly.exhibitionClaimed === true
          },
          version: { increment: 1 }
        },
        create: {
          userId,
          weeklyStateKey: currentWeekKey,
          weeklyState: {
            archivedCardIds: [...archivedCardIds],
            exhibitionClaimed: false
          }
        }
      });
      return tx.archivedCard.findUniqueOrThrow({ where: { inventoryItemId } });
    });
  }

  async archiveNextAvailable(userId: string, inventoryItemId: string) {
    const archive = await this.getArchive(userId);
    const used = new Set(archive.entries.map((entry) => entry.slot));
    const slot = Array.from({ length: archive.limit }, (_, index) => index + 1)
      .find((candidate) => !used.has(candidate));
    if (!slot) {
      throw new AppError("Tes Archives sont pleines. Libère d'abord un emplacement.", 409);
    }
    return this.archiveCard(userId, inventoryItemId, slot);
  }

  async setWishlistDeck(userId: string, deckId: string | null) {
    const learned = await prisma.userSkill.findFirst({
      where: {
        userId,
        rank: { gt: 0 },
        skill: { effectKey: "COL_DECK_WISHLIST", status: "PUBLISHED" }
      }
    });
    if (!learned) throw new AppError("Débloque d'abord la Liste de souhaits de deck.", 409);
    if (deckId) {
      const deck = await prisma.deck.findFirst({
        where: { id: deckId, status: "PUBLISHED", isActive: true }
      });
      if (!deck) throw new AppError("Deck introuvable.", 404);
    }
    await prisma.$transaction(async (tx) => {
      const state = await tx.userGameplayState.findUnique({ where: { userId } });
      const counters = jsonRecord(state?.counters);
      const clearPins = state?.wishlistDeckId !== deckId;
      await tx.userGameplayState.upsert({
        where: { userId },
        update: {
          wishlistDeckId: deckId,
          counters: clearPins
            ? { ...counters, pinnedMissingCardIds: [] }
            : undefined,
          version: { increment: 1 }
        },
        create: {
          userId,
          wishlistDeckId: deckId,
          counters: clearPins
            ? { ...counters, pinnedMissingCardIds: [] }
            : Prisma.JsonNull
        }
      });
    });
    return { deckId };
  }

  async togglePinnedMissingCard(userId: string, cardId: string) {
    return prisma.$transaction(async (tx) => {
      const skill = await tx.userSkill.findFirst({
        where: {
          userId,
          rank: { gt: 0 },
          skill: { effectKey: "COL_ARCHIVE_PIN_MISSING_CARDS", status: "PUBLISHED" }
        },
        select: { id: true }
      });
      if (!skill) throw new AppError("Débloque d'abord Catalogue vivant.", 409);
      const state = await tx.userGameplayState.findUnique({ where: { userId } });
      if (!state?.wishlistDeckId) {
        throw new AppError("Choisis d'abord un deck dans ta liste de recherche.", 409);
      }
      const card = await tx.card.findFirst({
        where: {
          id: cardId,
          deckId: state.wishlistDeckId,
          status: "PUBLISHED",
          isActive: true
        },
        select: { id: true }
      });
      if (!card) throw new AppError("Cette carte n'appartient pas au deck recherché.", 400);
      const owned = await tx.inventoryItem.aggregate({
        where: { userId, cardId, quantity: { gt: 0 } },
        _sum: { quantity: true }
      });
      if ((owned._sum.quantity ?? 0) > 0) {
        throw new AppError("Cette carte est déjà dans ta collection.", 409);
      }
      const counters = jsonRecord(state.counters);
      const pinned = new Set(
        Array.isArray(counters.pinnedMissingCardIds)
          ? counters.pinnedMissingCardIds.filter(
              (value): value is string => typeof value === "string"
            )
          : []
      );
      if (pinned.has(cardId)) {
        pinned.delete(cardId);
      } else {
        if (pinned.size >= 3) {
          throw new AppError("Tu peux épingler au maximum trois cartes manquantes.", 409);
        }
        pinned.add(cardId);
      }
      await tx.userGameplayState.update({
        where: { userId },
        data: {
          counters: { ...counters, pinnedMissingCardIds: [...pinned] },
          version: { increment: 1 }
        }
      });
      return { pinnedCardIds: [...pinned] };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async claimWeeklyExhibition(
    userId: string,
    choice: "credits" | "fragments" | "booster" = "credits"
  ) {
    return prisma.$transaction(async (tx) => {
      const skill = await tx.userSkill.findFirst({
        where: {
          userId,
          rank: { gt: 0 },
          skill: { effectKey: "COL_ARCHIVE_WEEKLY_EXHIBITION", status: "PUBLISHED" }
        }
      });
      if (!skill) throw new AppError("L'Exposition hebdomadaire n'est pas débloquée.", 409);
      const state = await tx.userGameplayState.findUnique({ where: { userId } });
      const currentWeekKey = weekKey();
      const weekly = state?.weeklyStateKey === currentWeekKey
        ? jsonRecord(state.weeklyState)
        : {};
      const unique = Array.isArray(weekly.archivedCardIds)
        ? new Set(weekly.archivedCardIds).size
        : 0;
      if (weekly.exhibitionClaimed === true) {
        throw new AppError("La récompense hebdomadaire a déjà été réclamée.", 409);
      }
      if (unique < 9) {
        throw new AppError(`Archive encore ${9 - unique} carte(s) unique(s) cette semaine.`, 409);
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const reward =
        choice === "credits"
          ? { choice, credits: 750, fragments: 0, booster: 0 }
          : choice === "fragments"
            ? { choice, credits: 0, fragments: 3, booster: 0 }
            : { choice, credits: 0, fragments: 0, booster: 1 };
      if (reward.credits > 0 || reward.fragments > 0) {
        await tx.user.update({
          where: { id: userId },
          data: {
            credits: { increment: reward.credits },
            fragments: { increment: reward.fragments },
            balanceVersion: { increment: 1 }
          }
        });
      }
      const boosterBefore = reward.booster > 0
        ? await tx.userBooster.findUnique({
            where: { userId_boosterType: { userId, boosterType: "basic" } }
          })
        : null;
      if (reward.booster > 0) {
        await tx.userBooster.upsert({
          where: { userId_boosterType: { userId, boosterType: "basic" } },
          update: { quantity: { increment: reward.booster } },
          create: { userId, boosterType: "basic", quantity: reward.booster }
        });
      }
      await tx.userGameplayState.update({
        where: { userId },
        data: {
          weeklyState: {
            ...weekly,
            exhibitionClaimed: true
          },
          version: { increment: 1 }
        }
      });
      const ledgerRows: Prisma.EconomicLedgerEntryCreateManyInput[] = [];
      if (reward.credits > 0) {
        ledgerRows.push({
            userId,
            asset: "CREDITS",
            delta: reward.credits,
            balanceBefore: user.credits,
            balanceAfter: user.credits + reward.credits,
            reason: "archive.weekly_exhibition",
            referenceType: "User",
            referenceId: userId,
            operationKey: `archive-exhibition:${userId}:${currentWeekKey}:credits`
        });
      }
      if (reward.fragments > 0) {
        ledgerRows.push({
            userId,
            asset: "FRAGMENTS",
            delta: reward.fragments,
            balanceBefore: user.fragments,
            balanceAfter: user.fragments + reward.fragments,
            reason: "archive.weekly_exhibition",
            referenceType: "User",
            referenceId: userId,
            operationKey: `archive-exhibition:${userId}:${currentWeekKey}:fragments`
        });
      }
      if (reward.booster > 0) {
        ledgerRows.push({
          userId,
          asset: "BOOSTER",
          assetKey: "basic",
          delta: reward.booster,
          balanceBefore: boosterBefore?.quantity ?? 0,
          balanceAfter: (boosterBefore?.quantity ?? 0) + reward.booster,
          reason: "archive.weekly_exhibition",
          referenceType: "User",
          referenceId: userId,
          operationKey: `archive-exhibition:${userId}:${currentWeekKey}:booster`
        });
      }
      await tx.economicLedgerEntry.createMany({ data: ledgerRows });
      return reward;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async removeFromArchive(userId: string, slot: number) {
    await prisma.archivedCard.deleteMany({ where: { userId, slot } });
    return this.getArchive(userId);
  }

  async resonance(userId: string, deckId: string, rarityName: string) {
    const [entries, equipped] = await Promise.all([
      prisma.archivedCard.findMany({
        where: { userId },
        include: {
          inventoryItem: {
            include: { card: { select: { deckId: true, rarity: { select: { name: true } } } } }
          }
        }
      }),
      prisma.equippedArtifact.findFirst({
        where: {
          userId,
          item: { effectKey: "EXP_ARCHIVE_RESONANCE", status: "PUBLISHED" }
        },
        select: { id: true }
      })
    ]);
    if (!equipped) return 1;
    const sameDeck = entries.filter(
      (entry) => entry.inventoryItem.card.deckId === deckId
    ).length >= 3;
    const sameTier = entries.filter(
      (entry) => entry.inventoryItem.card.rarity.name === rarityName
    ).length >= 3;
    // When both patterns overlap, deck resonance has priority; the two effects never stack.
    if (sameDeck) return 1.5;
    if (!sameTier) return 1;
    return {
      Common: 1.4,
      Uncommon: 1.35,
      Rare: 1.3,
      "Very Rare": 1.2,
      Import: 1.08,
      Exotic: 1.04,
      "Black Market": 1.02
    }[rarityName] ?? 1;
  }
}
