import {
  Prisma,
  prisma,
  type CollectionContractType
} from "@rta/database";
import { AppError } from "./errors.js";

const CONTRACT_DURATION_MS = 24 * 60 * 60_000;
const CONTRACT_CREATE_COOLDOWN_MS = 5 * 60_000;
const CONTRACT_REWARD_MIN = 50;
const CONTRACT_REWARD_MAX = 10_000;
const DAILY_DONATION_LIMIT = 3;

function jsonRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function nextUtcMidnight(date = new Date()) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1
  ));
}

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
}

async function effectKeys(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.userSkill.findMany({
    where: { userId, rank: { gt: 0 }, skill: { status: "PUBLISHED" } },
    select: { skill: { select: { effectKey: true } } }
  });
  return new Set(rows.map((row) => row.skill.effectKey));
}

async function refundEscrow(
  tx: Prisma.TransactionClient,
  contract: {
    id: string;
    requesterUserId: string;
    guildId: string;
    rewardCredits: number;
  },
  reason: "cancelled" | "expired"
) {
  if (contract.rewardCredits <= 0) return;
  const user = await tx.user.findUniqueOrThrow({
    where: { id: contract.requesterUserId }
  });
  await tx.user.update({
    where: { id: user.id },
    data: {
      credits: { increment: contract.rewardCredits },
      balanceVersion: { increment: 1 }
    }
  });
  await tx.economicLedgerEntry.create({
    data: {
      userId: user.id,
      guildId: contract.guildId,
      asset: "CREDITS",
      delta: contract.rewardCredits,
      balanceBefore: user.credits,
      balanceAfter: user.credits + contract.rewardCredits,
      reason: `collection_contract.${reason}_refund`,
      referenceType: "CollectionContract",
      referenceId: contract.id,
      operationKey: `collection-contract:${contract.id}:${reason}:refund`
    }
  });
}

export class CollectionContractService {
  async getBoard(discordGuildId: string, userId: string) {
    const guild = await prisma.guild.findUnique({
      where: { discordId: discordGuildId },
      include: { config: true }
    });
    if (!guild || !guild.isActive) {
      throw new AppError("Serveur RTA introuvable ou inactif.", 404);
    }
    const [skills, state, contracts, ownContracts, donationCount] =
      await Promise.all([
        prisma.userSkill.findMany({
          where: {
            userId,
            rank: { gt: 0 },
            skill: { status: "PUBLISHED" }
          },
          select: { skill: { select: { effectKey: true } } }
        }),
        prisma.userGameplayState.findUnique({ where: { userId } }),
        prisma.collectionContract.findMany({
          where: {
            guildId: guild.id,
            status: "OPEN",
            expiresAt: { gt: new Date() }
          },
          include: {
            requester: { select: { discordId: true, username: true } },
            card: { include: { deck: true, rarity: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 15
        }),
        prisma.collectionContract.findMany({
          where: {
            requesterUserId: userId,
            status: "OPEN",
            expiresAt: { gt: new Date() }
          },
          include: { card: { include: { deck: true, rarity: true } } },
          orderBy: { createdAt: "desc" }
        }),
        prisma.collectionContract.count({
          where: {
            fulfilledByUserId: userId,
            type: "DONATION",
            status: "COMPLETED",
            completedAt: { gte: utcDayStart() }
          }
        })
      ]);
    const learned = new Set(skills.map((row) => row.skill.effectKey));
    const counters = jsonRecord(state?.counters);
    return {
      guild,
      enabled: learned.has("COL_BROKER_GRANT_CONTRACT_TABLE"),
      slotLimit: learned.has("COL_CONTRACT_THREE_SLOTS") ? 3 : 1,
      donationEnabled: learned.has("COL_GUILD_DONATION_NETWORK"),
      smartMatchEnabled: learned.has("COL_CONTRACT_SMART_MATCH"),
      smartMatchOptIn: counters.contractSmartMatchOptIn === true,
      donationsRemaining: Math.max(0, DAILY_DONATION_LIMIT - donationCount),
      contracts,
      ownContracts
    };
  }

  async listDecks() {
    return prisma.deck.findMany({
      where: { status: "PUBLISHED", isActive: true },
      orderBy: { name: "asc" }
    });
  }

  async listMissingCards(userId: string, deckId: string) {
    const deck = await prisma.deck.findFirst({
      where: { id: deckId, status: "PUBLISHED", isActive: true }
    });
    if (!deck) throw new AppError("Deck introuvable.", 404);
    const owned = await prisma.inventoryItem.findMany({
      where: { userId, quantity: { gt: 0 }, card: { deckId } },
      select: { cardId: true },
      distinct: ["cardId"]
    });
    return prisma.card.findMany({
      where: {
        deckId,
        id: { notIn: owned.map((row) => row.cardId) },
        source: "vault",
        status: "PUBLISHED",
        isActive: true
      },
      include: { deck: true, rarity: true },
      orderBy: [{ rarity: { weight: "desc" } }, { name: "asc" }],
      take: 25
    });
  }

  async createContract(input: {
    discordGuildId: string;
    userId: string;
    cardId: string;
    type: CollectionContractType;
    rewardCredits: number;
    operationKey: string;
  }) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,199}$/.test(input.operationKey)) {
      throw new AppError("Une clé d'idempotence valide est requise.", 400);
    }
    const scopeKey = `collection-contract:create:${input.userId}:${input.operationKey}`;
    const requestHash = JSON.stringify({
      guild: input.discordGuildId,
      cardId: input.cardId,
      type: input.type,
      rewardCredits: input.rewardCredits
    });
    const createdId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${scopeKey}, 0))`
      );
      const replay = await tx.idempotencyRecord.findUnique({ where: { scopeKey } });
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new AppError("Cette opération a déjà servi pour un autre contrat.", 409);
        }
        const response = jsonRecord(replay.response);
        if (typeof response.contractId !== "string") {
          throw new AppError("Le contrat enregistré est invalide.", 500);
        }
        return response.contractId;
      }

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`
      );
      const [user, guild, skills, card] = await Promise.all([
        tx.user.findUnique({ where: { id: input.userId } }),
        tx.guild.findUnique({
          where: { discordId: input.discordGuildId },
          include: { config: true }
        }),
        effectKeys(tx, input.userId),
        tx.card.findFirst({
          where: {
            id: input.cardId,
            source: "vault",
            status: "PUBLISHED",
            isActive: true
          },
          include: { deck: true, rarity: true }
        })
      ]);
      if (!user) throw new AppError("Utilisateur introuvable.", 404);
      if (!guild || !guild.isActive) {
        throw new AppError("Serveur RTA introuvable ou inactif.", 404);
      }
      if (!skills.has("COL_BROKER_GRANT_CONTRACT_TABLE")) {
        throw new AppError("La spécialisation Courtier est requise.", 403);
      }
      if (
        input.type === "DONATION" &&
        !skills.has("COL_GUILD_DONATION_NETWORK")
      ) {
        throw new AppError("Le Réseau de guilde est requis pour demander un don.", 403);
      }
      if (!card) throw new AppError("Carte demandée introuvable.", 404);
      const ownedCount = await tx.inventoryItem.aggregate({
        where: { userId: input.userId, cardId: card.id },
        _sum: { quantity: true }
      });
      if ((ownedCount._sum.quantity ?? 0) > 0) {
        throw new AppError("Un contrat ne peut viser qu'une carte manquante.", 409);
      }
      const activeLimit = skills.has("COL_CONTRACT_THREE_SLOTS") ? 3 : 1;
      const activeCount = await tx.collectionContract.count({
        where: {
          requesterUserId: input.userId,
          status: "OPEN",
          expiresAt: { gt: new Date() }
        }
      });
      if (activeCount >= activeLimit) {
        throw new AppError(
          `Tu utilises déjà tes ${activeLimit} emplacement(s) de contrat.`,
          409
        );
      }
      const duplicate = await tx.collectionContract.findFirst({
        where: {
          requesterUserId: input.userId,
          cardId: card.id,
          status: "OPEN",
          expiresAt: { gt: new Date() }
        }
      });
      if (duplicate) {
        throw new AppError("Tu as déjà un contrat actif pour cette carte.", 409);
      }
      const cooldown = await tx.actionCooldown.findUnique({
        where: { scopeKey: `collection-contract:create:${input.userId}` }
      });
      if (cooldown && cooldown.expiresAt > new Date()) {
        throw new AppError("Attends quelques minutes avant de publier un autre contrat.", 429);
      }

      const rewardCredits = input.type === "SEARCH"
        ? Math.floor(input.rewardCredits)
        : 0;
      if (
        input.type === "SEARCH" &&
        (
          !Number.isSafeInteger(rewardCredits) ||
          rewardCredits < CONTRACT_REWARD_MIN ||
          rewardCredits > CONTRACT_REWARD_MAX
        )
      ) {
        throw new AppError(
          `La prime doit être comprise entre ${CONTRACT_REWARD_MIN} et ${CONTRACT_REWARD_MAX} crédits.`,
          400
        );
      }
      if (user.credits < rewardCredits) {
        throw new AppError("Crédits insuffisants pour placer cette prime en séquestre.", 409);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + CONTRACT_DURATION_MS);
      const contract = await tx.collectionContract.create({
        data: {
          guildId: guild.id,
          requesterUserId: input.userId,
          cardId: card.id,
          type: input.type,
          rewardCredits,
          channelId: guild.config?.gameChannelId ?? null,
          expiresAt
        }
      });
      if (rewardCredits > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            credits: { decrement: rewardCredits },
            balanceVersion: { increment: 1 }
          }
        });
        await tx.economicLedgerEntry.create({
          data: {
            userId: user.id,
            guildId: guild.id,
            asset: "CREDITS",
            delta: -rewardCredits,
            balanceBefore: user.credits,
            balanceAfter: user.credits - rewardCredits,
            reason: "collection_contract.escrow",
            referenceType: "CollectionContract",
            referenceId: contract.id,
            operationKey: `collection-contract:${contract.id}:escrow`,
            metadata: { cardId: card.id, cardName: card.name }
          }
        });
      }
      await tx.guildMember.upsert({
        where: {
          guildId_userId: { guildId: guild.id, userId: input.userId }
        },
        update: { isActive: true, lastActiveAt: now },
        create: {
          guildId: guild.id,
          userId: input.userId,
          isActive: true,
          lastActiveAt: now
        }
      });
      await tx.actionCooldown.upsert({
        where: { scopeKey: `collection-contract:create:${input.userId}` },
        update: {
          action: "COLLECTION_CONTRACT_CREATE",
          userId: input.userId,
          guildId: guild.id,
          expiresAt: new Date(now.getTime() + CONTRACT_CREATE_COOLDOWN_MS)
        },
        create: {
          scopeKey: `collection-contract:create:${input.userId}`,
          action: "COLLECTION_CONTRACT_CREATE",
          userId: input.userId,
          guildId: guild.id,
          expiresAt: new Date(now.getTime() + CONTRACT_CREATE_COOLDOWN_MS)
        }
      });
      await tx.scheduledJob.create({
        data: {
          queue: "gameplay",
          type: "collection_contract.expire",
          dedupeKey: `collection-contract.expire:${contract.id}`,
          payload: { contractId: contract.id },
          runAt: expiresAt
        }
      });
      await tx.transactionLog.create({
        data: {
          userId: input.userId,
          type: "collection_contract",
          amount: -rewardCredits,
          metadata: {
            action: "create",
            contractId: contract.id,
            contractType: input.type,
            cardId: card.id
          }
        }
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `collection-contract:${contract.id}:created`,
          aggregateType: "CollectionContract",
          aggregateId: contract.id,
          eventType: "collection_contract.created",
          eventVersion: 1,
          payload: {
            contractId: contract.id,
            guildId: guild.id,
            requesterUserId: input.userId,
            cardId: card.id,
            type: input.type,
            rewardCredits
          }
        }
      });
      await tx.idempotencyRecord.create({
        data: {
          scopeKey,
          scope: "collection_contract.create",
          key: input.operationKey,
          requestHash,
          status: "COMPLETED",
          response: { contractId: contract.id },
          responseCode: 200,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000)
        }
      });
      return contract.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return prisma.collectionContract.findUniqueOrThrow({
      where: { id: createdId },
      include: {
        guild: { include: { config: true } },
        requester: true,
        card: { include: { deck: true, rarity: true } }
      }
    });
  }

  async attachMessage(contractId: string, channelId: string, messageId: string) {
    return prisma.collectionContract.updateMany({
      where: { id: contractId, status: "OPEN" },
      data: { channelId, messageId, version: { increment: 1 } }
    });
  }

  async fulfillContract(contractId: string, userId: string, operationKey: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "CollectionContract" WHERE "id" = ${contractId} FOR UPDATE`
      );
      const contract = await tx.collectionContract.findUnique({
        where: { id: contractId },
        include: {
          guild: true,
          requester: true,
          fulfilledBy: true,
          card: { include: { deck: true, rarity: true } }
        }
      });
      if (!contract) throw new AppError("Contrat introuvable.", 404);
      if (contract.status === "COMPLETED") {
        if (contract.fulfilledByUserId !== userId) {
          throw new AppError("Ce contrat a déjà été rempli.", 409);
        }
        return { contract, variant: null, replayed: true };
      }
      if (contract.status !== "OPEN" || contract.expiresAt <= new Date()) {
        throw new AppError("Ce contrat n'est plus actif.", 409);
      }
      if (contract.requesterUserId === userId) {
        throw new AppError("Tu ne peux pas remplir ton propre contrat.", 409);
      }
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" IN (${userId}, ${contract.requesterUserId}) ORDER BY "id" FOR UPDATE`
      );
      const member = await tx.guildMember.findUnique({
        where: {
          guildId_userId: { guildId: contract.guildId, userId }
        }
      });
      if (!member?.isActive) {
        throw new AppError("Tu dois être membre actif de ce serveur RTA.", 403);
      }
      if (contract.type === "DONATION") {
        const donationsToday = await tx.collectionContract.count({
          where: {
            fulfilledByUserId: userId,
            type: "DONATION",
            status: "COMPLETED",
            completedAt: { gte: utcDayStart() }
          }
        });
        if (donationsToday >= DAILY_DONATION_LIMIT) {
          throw new AppError("Tu as déjà effectué tes 3 dons aujourd'hui.", 429);
        }
      }

      const inventory = await tx.inventoryItem.findMany({
        where: {
          userId,
          cardId: contract.cardId,
          quantity: { gt: 0 }
        },
        include: { archive: true },
        orderBy: { variant: "asc" }
      });
      const totalQuantity = inventory.reduce((sum, entry) => sum + entry.quantity, 0);
      if (totalQuantity < 2) {
        throw new AppError(
          "Il faut posséder un doublon : la dernière copie ne peut pas être donnée.",
          409
        );
      }
      const transferable = inventory.find((entry) => !entry.archive);
      if (!transferable) {
        throw new AppError("Tes copies disponibles sont protégées dans les Archives.", 409);
      }
      const requesterInventory = await tx.inventoryItem.findUnique({
        where: {
          userId_cardId_variant: {
            userId: contract.requesterUserId,
            cardId: contract.cardId,
            variant: transferable.variant
          }
        }
      });
      const removed = await tx.inventoryItem.updateMany({
        where: {
          id: transferable.id,
          quantity: { gt: 0 },
          version: transferable.version
        },
        data: { quantity: { decrement: 1 }, version: { increment: 1 } }
      });
      if (removed.count !== 1) throw new AppError("Ton inventaire a changé.", 409);
      await tx.inventoryItem.upsert({
        where: {
          userId_cardId_variant: {
            userId: contract.requesterUserId,
            cardId: contract.cardId,
            variant: transferable.variant
          }
        },
        update: { quantity: { increment: 1 }, version: { increment: 1 } },
        create: {
          userId: contract.requesterUserId,
          cardId: contract.cardId,
          variant: transferable.variant,
          quantity: 1
        }
      });

      const ledgers: Prisma.EconomicLedgerEntryCreateManyInput[] = [
        {
          userId,
          guildId: contract.guildId,
          asset: "CARD",
          assetKey: `${contract.cardId}:${transferable.variant}`,
          delta: -1,
          balanceBefore: transferable.quantity,
          balanceAfter: transferable.quantity - 1,
          reason: "collection_contract.fulfilled",
          referenceType: "CollectionContract",
          referenceId: contract.id,
          operationKey: `${operationKey}:card-out`
        },
        {
          userId: contract.requesterUserId,
          guildId: contract.guildId,
          asset: "CARD",
          assetKey: `${contract.cardId}:${transferable.variant}`,
          delta: 1,
          balanceBefore: requesterInventory?.quantity ?? 0,
          balanceAfter: (requesterInventory?.quantity ?? 0) + 1,
          reason: "collection_contract.received",
          referenceType: "CollectionContract",
          referenceId: contract.id,
          operationKey: `${operationKey}:card-in`
        }
      ];
      if (contract.rewardCredits > 0) {
        const fulfiller = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        await tx.user.update({
          where: { id: userId },
          data: {
            credits: { increment: contract.rewardCredits },
            balanceVersion: { increment: 1 }
          }
        });
        ledgers.push({
          userId,
          guildId: contract.guildId,
          asset: "CREDITS",
          delta: contract.rewardCredits,
          balanceBefore: fulfiller.credits,
          balanceAfter: fulfiller.credits + contract.rewardCredits,
          reason: "collection_contract.bounty",
          referenceType: "CollectionContract",
          referenceId: contract.id,
          operationKey: `${operationKey}:bounty`
        });
      }
      if (contract.type === "DONATION") {
        const state = await tx.userGameplayState.upsert({
          where: { userId },
          update: {},
          create: { userId }
        });
        const counters = jsonRecord(state.counters);
        await tx.userGameplayState.update({
          where: { userId },
          data: {
            counters: {
              ...counters,
              socialReputation:
                Math.max(0, Number(counters.socialReputation ?? 0)) + 1
            } as Prisma.InputJsonObject,
            version: { increment: 1 }
          }
        });
        const guildProgress = await tx.guildProgress.findUnique({
          where: { guildId: contract.guildId }
        });
        if (guildProgress) {
          const nextMastery = Math.min(
            guildProgress.masteryTarget,
            guildProgress.mastery + 1
          );
          if (nextMastery > guildProgress.mastery) {
            await tx.guildProgress.update({
              where: { guildId: contract.guildId },
              data: { mastery: nextMastery, version: { increment: 1 } }
            });
            ledgers.push({
              userId,
              guildId: contract.guildId,
              asset: "GUILD_MASTERY",
              assetKey: "donation-network",
              delta: 1,
              balanceBefore: guildProgress.mastery,
              balanceAfter: nextMastery,
              reason: "collection_contract.donation",
              referenceType: "CollectionContract",
              referenceId: contract.id,
              operationKey: `${operationKey}:mastery`
            });
          }
        }
      }
      await tx.economicLedgerEntry.createMany({ data: ledgers });
      const completed = await tx.collectionContract.update({
        where: { id: contract.id },
        data: {
          status: "COMPLETED",
          fulfilledByUserId: userId,
          completedAt: new Date(),
          version: { increment: 1 }
        },
        include: {
          guild: true,
          requester: true,
          fulfilledBy: true,
          card: { include: { deck: true, rarity: true } }
        }
      });
      await tx.scheduledJob.updateMany({
        where: {
          dedupeKey: `collection-contract.expire:${contract.id}`,
          status: "PENDING"
        },
        data: { status: "CANCELLED", completedAt: new Date() }
      });
      await tx.transactionLog.createMany({
        data: [
          {
            userId,
            type: "collection_contract",
            amount: contract.rewardCredits,
            metadata: {
              action: "fulfill",
              contractId: contract.id,
              variant: transferable.variant
            }
          },
          {
            userId: contract.requesterUserId,
            type: "collection_contract",
            amount: -contract.rewardCredits,
            metadata: {
              action: "receive",
              contractId: contract.id,
              variant: transferable.variant
            }
          }
        ]
      });
      await tx.outboxEvent.create({
        data: {
          eventId: `collection-contract:${contract.id}:completed`,
          aggregateType: "CollectionContract",
          aggregateId: contract.id,
          eventType: "collection_contract.completed",
          eventVersion: 1,
          payload: {
            contractId: contract.id,
            requesterUserId: contract.requesterUserId,
            fulfilledByUserId: userId,
            cardId: contract.cardId,
            type: contract.type,
            rewardCredits: contract.rewardCredits
          }
        }
      });
      return {
        contract: completed,
        variant: transferable.variant,
        replayed: false
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancelContract(contractId: string, requesterUserId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "CollectionContract" WHERE "id" = ${contractId} FOR UPDATE`
      );
      const contract = await tx.collectionContract.findUnique({
        where: { id: contractId },
        include: { card: true }
      });
      if (!contract) throw new AppError("Contrat introuvable.", 404);
      if (contract.requesterUserId !== requesterUserId) {
        throw new AppError("Tu ne peux pas annuler ce contrat.", 403);
      }
      if (contract.status !== "OPEN") {
        throw new AppError("Ce contrat n'est plus annulable.", 409);
      }
      await refundEscrow(tx, contract, "cancelled");
      const cancelled = await tx.collectionContract.update({
        where: { id: contract.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          version: { increment: 1 }
        },
        include: { card: { include: { deck: true, rarity: true } } }
      });
      await tx.scheduledJob.updateMany({
        where: {
          dedupeKey: `collection-contract.expire:${contract.id}`,
          status: "PENDING"
        },
        data: { status: "CANCELLED", completedAt: new Date() }
      });
      return cancelled;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async expireContract(contractId: string, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "CollectionContract" WHERE "id" = ${contractId} FOR UPDATE`
      );
      const contract = await tx.collectionContract.findUnique({
        where: { id: contractId }
      });
      if (
        !contract ||
        contract.status !== "OPEN" ||
        contract.expiresAt > now
      ) {
        return null;
      }
      await refundEscrow(tx, contract, "expired");
      return tx.collectionContract.update({
        where: { id: contract.id },
        data: { status: "EXPIRED", version: { increment: 1 } }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async toggleSmartMatchOptIn(userId: string) {
    return prisma.$transaction(async (tx) => {
      const state = await tx.userGameplayState.upsert({
        where: { userId },
        update: {},
        create: { userId }
      });
      const counters = jsonRecord(state.counters);
      const enabled = counters.contractSmartMatchOptIn !== true;
      await tx.userGameplayState.update({
        where: { userId },
        data: {
          counters: {
            ...counters,
            contractSmartMatchOptIn: enabled
          } as Prisma.InputJsonObject,
          version: { increment: 1 }
        }
      });
      return enabled;
    });
  }

  async getSmartMatches(contractId: string) {
    const contract = await prisma.collectionContract.findUnique({
      where: { id: contractId },
      include: { requester: { include: { skills: { include: { skill: true } } } } }
    });
    if (!contract || contract.status !== "OPEN") return [];
    const canMatch = contract.requester.skills.some(
      (row) =>
        row.rank > 0 &&
        row.skill.status === "PUBLISHED" &&
        row.skill.effectKey === "COL_CONTRACT_SMART_MATCH"
    );
    if (!canMatch) return [];
    const members = await prisma.guildMember.findMany({
      where: {
        guildId: contract.guildId,
        isActive: true,
        userId: { not: contract.requesterUserId }
      },
      include: {
        user: {
          include: {
            gameplayState: true,
            inventory: {
              where: { cardId: contract.cardId, quantity: { gt: 0 } },
              select: { quantity: true }
            }
          }
        }
      }
    });
    return members.flatMap((member) => {
      const counters = jsonRecord(member.user.gameplayState?.counters);
      const quantity = member.user.inventory.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
      return counters.contractSmartMatchOptIn === true && quantity >= 2
        ? [{
            discordId: member.user.discordId,
            username: member.user.username
          }]
        : [];
    }).slice(0, 3);
  }
}

export const COLLECTION_CONTRACT_RULES = {
  durationHours: CONTRACT_DURATION_MS / (60 * 60_000),
  creationCooldownMinutes: CONTRACT_CREATE_COOLDOWN_MS / 60_000,
  dailyDonationLimit: DAILY_DONATION_LIMIT,
  minimumBounty: CONTRACT_REWARD_MIN,
  maximumBounty: CONTRACT_REWARD_MAX,
  donationResetAt: nextUtcMidnight
} as const;
