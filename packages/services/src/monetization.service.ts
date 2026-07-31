import {
  MonetizationProvider,
  PaymentOrderStatus,
  PaymentWebhookStatus,
  Prisma,
  prisma
} from "@rta/database";
import { AppError } from "./errors.js";

export const MONETIZATION_PRODUCTS = {
  vip_monthly: {
    key: "vip_monthly",
    kind: "SUBSCRIPTION",
    tier: "VIP",
    name: "RTA VIP",
    priceCents: 199,
    currency: "eur",
    credits: 0,
    bonusCredits: 0,
    stripePriceEnv: "STRIPE_PRICE_VIP_MONTHLY",
    discordSkuEnv: "DISCORD_SKU_VIP_MONTHLY",
    description: "Le statut VIP et une charge d’exploration maximale supplémentaire.",
    benefits: [
      "Badge VIP sur le profil web et Discord",
      "5 charges d’exploration de base au lieu de 4",
      "Soutien direct au développement de RTA"
    ]
  },
  founder_monthly: {
    key: "founder_monthly",
    kind: "SUBSCRIPTION",
    tier: "FOUNDER",
    name: "Fondateur RTA",
    priceCents: 1_500,
    currency: "eur",
    credits: 0,
    bonusCredits: 0,
    stripePriceEnv: "STRIPE_PRICE_FOUNDER_MONTHLY",
    discordSkuEnv: "DISCORD_SKU_FOUNDER_MONTHLY",
    description: "Le niveau de soutien maximal avec le badge Fondateur.",
    benefits: [
      "Tous les avantages VIP, sans bonus de puissance supplémentaire",
      "Badge Fondateur distinctif sur le profil web et Discord",
      "Soutien prioritaire au développement et à l’hébergement de RTA"
    ]
  },
  credits_1000: {
    key: "credits_1000",
    kind: "CREDIT_PACK",
    tier: null,
    name: "Pack 1 000 crédits",
    priceCents: 99,
    currency: "eur",
    credits: 1_000,
    bonusCredits: 0,
    stripePriceEnv: "STRIPE_PRICE_CREDITS_1000",
    discordSkuEnv: "DISCORD_SKU_CREDITS_1000",
    description: "1 000 crédits ajoutés directement au solde RTA.",
    benefits: ["1 000 crédits", "Aucune monnaie premium intermédiaire"]
  },
  credits_12000: {
    key: "credits_12000",
    kind: "CREDIT_PACK",
    tier: null,
    name: "Pack 12 000 crédits",
    priceCents: 999,
    currency: "eur",
    credits: 12_000,
    bonusCredits: 2_000,
    stripePriceEnv: "STRIPE_PRICE_CREDITS_12000",
    discordSkuEnv: "DISCORD_SKU_CREDITS_12000",
    description: "10 000 crédits achetés et 2 000 crédits offerts.",
    benefits: ["12 000 crédits au total", "2 000 crédits de bonus", "20 % de crédits supplémentaires"]
  }
} as const;

export type MonetizationProductKey = keyof typeof MONETIZATION_PRODUCTS;
export type SupporterTier = "FREE" | "VIP" | "FOUNDER";

const subscriptionKeys: MonetizationProductKey[] = [
  "vip_monthly",
  "founder_monthly"
];

export function getMonetizationProduct(value: string) {
  if (!Object.prototype.hasOwnProperty.call(MONETIZATION_PRODUCTS, value)) {
    throw new AppError("Produit de paiement RTA inconnu.", 400);
  }
  return MONETIZATION_PRODUCTS[value as MonetizationProductKey];
}

export function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency: "EUR"
  }).format(cents / 100);
}

export function productKeyForDiscordSku(skuId: string) {
  for (const product of Object.values(MONETIZATION_PRODUCTS)) {
    const configured = process.env[product.discordSkuEnv]?.trim();
    if (configured && configured === skuId) return product.key;
  }
  return null;
}

export function configuredDiscordSku(productKey: MonetizationProductKey) {
  const skuId = process.env[MONETIZATION_PRODUCTS[productKey].discordSkuEnv]?.trim();
  return skuId && /^\d{17,20}$/.test(skuId) ? skuId : null;
}

export function discordMonetizationEnabled() {
  return process.env.DISCORD_MONETIZATION_ENABLED === "true";
}

export type SupporterAccess = {
  tier: SupporterTier;
  label: string;
  productKey: MonetizationProductKey | null;
  activeUntil: Date | null;
  providers: MonetizationProvider[];
  maxExplorationChargeBonus: number;
};

function accessFromEntitlements(
  entitlements: Array<{
    productKey: string;
    provider: MonetizationProvider;
    endsAt: Date | null;
  }>
): SupporterAccess {
  const founder = entitlements.filter((entry) => entry.productKey === "founder_monthly");
  const vip = entitlements.filter((entry) => entry.productKey === "vip_monthly");
  const selected = founder.length > 0 ? founder : vip;
  const tier: SupporterTier = founder.length > 0 ? "FOUNDER" : vip.length > 0 ? "VIP" : "FREE";
  const activeUntil = selected.some((entry) => entry.endsAt === null)
    ? null
    : selected.reduce<Date | null>(
        (latest, entry) => !latest || (entry.endsAt && entry.endsAt > latest) ? entry.endsAt : latest,
        null
      );
  return {
    tier,
    label: tier === "FOUNDER" ? "Fondateur RTA" : tier === "VIP" ? "RTA VIP" : "Joueur",
    productKey: tier === "FOUNDER" ? "founder_monthly" : tier === "VIP" ? "vip_monthly" : null,
    activeUntil,
    providers: [...new Set(selected.map((entry) => entry.provider))],
    maxExplorationChargeBonus: tier === "FREE" ? 0 : 1
  };
}

async function activeSubscriptionEntitlements(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  now: Date
) {
  return client.userEntitlement.findMany({
    where: {
      userId,
      active: true,
      productKey: { in: subscriptionKeys },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }]
    },
    select: {
      productKey: true,
      provider: true,
      endsAt: true
    }
  });
}

export async function supporterAccessInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  now = new Date()
) {
  return accessFromEntitlements(await activeSubscriptionEntitlements(tx, userId, now));
}

type CreateOrderInput = {
  userId: string;
  provider: MonetizationProvider;
  productKey: MonetizationProductKey;
  withdrawalWaiverAcceptedAt?: Date | null;
  providerEntitlementId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export class MonetizationService {
  async getUserAccess(userId: string, now = new Date()) {
    return accessFromEntitlements(await activeSubscriptionEntitlements(prisma, userId, now));
  }

  async getUserOrders(userId: string, take = 12) {
    return prisma.paymentOrder.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(50, Math.floor(take)))
    });
  }

  async findPaymentCustomer(userId: string, provider: MonetizationProvider) {
    return prisma.paymentCustomer.findUnique({
      where: { userId_provider: { userId, provider } }
    });
  }

  async upsertPaymentCustomer(input: {
    userId: string;
    provider: MonetizationProvider;
    providerCustomerId: string;
  }) {
    return prisma.paymentCustomer.upsert({
      where: {
        userId_provider: {
          userId: input.userId,
          provider: input.provider
        }
      },
      update: { providerCustomerId: input.providerCustomerId },
      create: input
    });
  }

  async createOrder(input: CreateOrderInput) {
    const product = getMonetizationProduct(input.productKey);
    return prisma.paymentOrder.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        productKey: product.key,
        amountCents: product.priceCents,
        currency: product.currency,
        providerEntitlementId: input.providerEntitlementId ?? null,
        withdrawalWaiverAcceptedAt: input.withdrawalWaiverAcceptedAt ?? null,
        metadata: input.metadata
      }
    });
  }

  async attachCheckout(input: {
    orderId: string;
    providerCheckoutId: string;
    providerCustomerId: string;
  }) {
    return prisma.paymentOrder.update({
      where: { id: input.orderId },
      data: {
        status: PaymentOrderStatus.CHECKOUT_CREATED,
        providerCheckoutId: input.providerCheckoutId,
        providerCustomerId: input.providerCustomerId,
        failureCode: null
      }
    });
  }

  async markOrderFailed(orderId: string, failureCode: string) {
    return prisma.paymentOrder.updateMany({
      where: {
        id: orderId,
        status: { in: [PaymentOrderStatus.PENDING, PaymentOrderStatus.CHECKOUT_CREATED] }
      },
      data: {
        status: PaymentOrderStatus.FAILED,
        failureCode: failureCode.slice(0, 160)
      }
    });
  }

  async markCheckoutStatus(
    providerCheckoutId: string,
    status: PaymentOrderStatus,
    failureCode?: string
  ) {
    return prisma.paymentOrder.updateMany({
      where: {
        provider: MonetizationProvider.STRIPE,
        providerCheckoutId,
        status: { not: PaymentOrderStatus.PAID }
      },
      data: {
        status,
        failureCode: failureCode?.slice(0, 160) ?? null
      }
    });
  }

  async beginWebhook(providerEventId: string, eventType: string) {
    const existing = await prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: MonetizationProvider.STRIPE,
          providerEventId
        }
      }
    });
    if (existing?.status === PaymentWebhookStatus.PROCESSED) {
      return { process: false, event: existing };
    }
    const event = existing
      ? await prisma.paymentWebhookEvent.update({
          where: { id: existing.id },
          data: {
            eventType,
            status: PaymentWebhookStatus.PROCESSING,
            attempts: { increment: 1 },
            lastError: null
          }
        })
      : await prisma.paymentWebhookEvent.create({
          data: {
            provider: MonetizationProvider.STRIPE,
            providerEventId,
            eventType
          }
        });
    return { process: true, event };
  }

  async completeWebhook(providerEventId: string) {
    await prisma.paymentWebhookEvent.update({
      where: {
        provider_providerEventId: {
          provider: MonetizationProvider.STRIPE,
          providerEventId
        }
      },
      data: {
        status: PaymentWebhookStatus.PROCESSED,
        processedAt: new Date(),
        lastError: null
      }
    });
  }

  async failWebhook(providerEventId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.paymentWebhookEvent.updateMany({
      where: {
        provider: MonetizationProvider.STRIPE,
        providerEventId
      },
      data: {
        status: PaymentWebhookStatus.FAILED,
        lastError: message.slice(0, 500)
      }
    });
  }

  async fulfillStripeCreditOrder(input: {
    orderId: string;
    providerCheckoutId: string;
    providerPaymentId: string | null;
    providerCustomerId: string | null;
    amountSubtotal: number;
    currency: string;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "PaymentOrder" WHERE "id" = ${input.orderId} FOR UPDATE`
      );
      const order = await tx.paymentOrder.findUnique({ where: { id: input.orderId } });
      if (!order || order.provider !== MonetizationProvider.STRIPE) {
        throw new AppError("Commande Stripe RTA introuvable.", 404);
      }
      if (order.providerCheckoutId && order.providerCheckoutId !== input.providerCheckoutId) {
        throw new AppError("Référence Stripe incohérente.", 409);
      }
      const product = getMonetizationProduct(order.productKey);
      if (product.kind !== "CREDIT_PACK") {
        throw new AppError("Cette commande n’est pas un pack de crédits.", 409);
      }
      if (
        input.currency.toLowerCase() !== product.currency ||
        input.amountSubtotal !== product.priceCents ||
        order.amountCents !== product.priceCents
      ) {
        throw new AppError("Le montant Stripe ne correspond pas au catalogue RTA.", 409);
      }
      return this.grantCredits(tx, {
        order,
        credits: product.credits,
        operationKey: `payment:stripe:${input.providerCheckoutId}:credits`,
        providerPaymentId: input.providerPaymentId,
        providerCustomerId: input.providerCustomerId,
        providerCheckoutId: input.providerCheckoutId
      });
    });
  }

  async activateStripeSubscription(input: {
    orderId?: string | null;
    userId: string;
    productKey: MonetizationProductKey;
    subscriptionId: string;
    customerId: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    active: boolean;
    status: string;
  }) {
    const product = getMonetizationProduct(input.productKey);
    if (product.kind !== "SUBSCRIPTION") {
      throw new AppError("Produit d’abonnement RTA invalide.", 409);
    }
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true } });
      if (!user) throw new AppError("Joueur RTA introuvable pour cet abonnement.", 404);
      if (input.customerId) {
        await tx.paymentCustomer.upsert({
          where: {
            userId_provider: {
              userId: input.userId,
              provider: MonetizationProvider.STRIPE
            }
          },
          update: { providerCustomerId: input.customerId },
          create: {
            userId: input.userId,
            provider: MonetizationProvider.STRIPE,
            providerCustomerId: input.customerId
          }
        });
      }
      if (input.orderId) {
        await tx.paymentOrder.updateMany({
          where: { id: input.orderId, userId: input.userId },
          data: {
            status: input.active ? PaymentOrderStatus.PAID : PaymentOrderStatus.FAILED,
            providerPaymentId: input.subscriptionId,
            providerCustomerId: input.customerId,
            failureCode: input.active ? null : input.status
          }
        });
      }
      return tx.userEntitlement.upsert({
        where: {
          provider_providerExternalId: {
            provider: MonetizationProvider.STRIPE,
            providerExternalId: input.subscriptionId
          }
        },
        update: {
          userId: input.userId,
          productKey: product.key,
          active: input.active,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          deletedAt: input.active ? null : new Date(),
          lastVerifiedAt: new Date(),
          metadata: { status: input.status }
        },
        create: {
          userId: input.userId,
          provider: MonetizationProvider.STRIPE,
          providerExternalId: input.subscriptionId,
          productKey: product.key,
          active: input.active,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          deletedAt: input.active ? null : new Date(),
          metadata: { status: input.status }
        }
      });
    });
  }

  async syncDiscordEntitlement(input: {
    entitlementId: string;
    skuId: string;
    discordUserId: string;
    username: string;
    avatarUrl?: string | null;
    active: boolean;
    consumed: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    deleted: boolean;
  }) {
    const productKey = productKeyForDiscordSku(input.skuId);
    if (!productKey) return { handled: false, creditsGranted: 0, shouldConsume: false };
    const product = getMonetizationProduct(productKey);
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { discordId: input.discordUserId },
        update: {
          username: input.username,
          ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {})
        },
        create: {
          discordId: input.discordUserId,
          username: input.username,
          avatarUrl: input.avatarUrl ?? null
        }
      });

      const existingOrder = await tx.paymentOrder.findFirst({
        where: {
          provider: MonetizationProvider.DISCORD,
          providerEntitlementId: input.entitlementId
        }
      });
      const order = existingOrder ?? await tx.paymentOrder.create({
        data: {
          userId: user.id,
          provider: MonetizationProvider.DISCORD,
          productKey: product.key,
          status: input.active ? PaymentOrderStatus.PAID : PaymentOrderStatus.FAILED,
          amountCents: product.priceCents,
          currency: product.currency,
          providerPaymentId: input.skuId,
          providerEntitlementId: input.entitlementId,
          metadata: { skuId: input.skuId, consumed: input.consumed }
        }
      });

      if (product.kind === "CREDIT_PACK") {
        if (!input.active || input.deleted || input.consumed) {
          return { handled: true, creditsGranted: 0, shouldConsume: false };
        }
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "PaymentOrder" WHERE "id" = ${order.id} FOR UPDATE`
        );
        const freshOrder = await tx.paymentOrder.findUnique({ where: { id: order.id } });
        if (!freshOrder) throw new AppError("Commande Discord introuvable.", 404);
        const result = await this.grantCredits(tx, {
          order: freshOrder,
          credits: product.credits,
          operationKey: `payment:discord:${input.entitlementId}:credits`,
          providerPaymentId: input.skuId,
          providerCustomerId: null,
          providerCheckoutId: null
        });
        return {
          handled: true,
          creditsGranted: result.replayed ? 0 : product.credits,
          shouldConsume: true
        };
      }

      await tx.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: input.active && !input.deleted
            ? PaymentOrderStatus.PAID
            : PaymentOrderStatus.EXPIRED,
          metadata: { skuId: input.skuId, consumed: input.consumed }
        }
      });
      await tx.userEntitlement.upsert({
        where: {
          provider_providerExternalId: {
            provider: MonetizationProvider.DISCORD,
            providerExternalId: input.entitlementId
          }
        },
        update: {
          userId: user.id,
          productKey: product.key,
          active: input.active && !input.deleted,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          deletedAt: input.deleted ? new Date() : null,
          lastVerifiedAt: new Date(),
          metadata: { skuId: input.skuId }
        },
        create: {
          userId: user.id,
          provider: MonetizationProvider.DISCORD,
          providerExternalId: input.entitlementId,
          productKey: product.key,
          active: input.active && !input.deleted,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          deletedAt: input.deleted ? new Date() : null,
          metadata: { skuId: input.skuId }
        }
      });
      return { handled: true, creditsGranted: 0, shouldConsume: false };
    });
  }

  async markStripePaymentStatus(
    providerPaymentId: string,
    status: PaymentOrderStatus,
    failureCode: string
  ) {
    return prisma.paymentOrder.updateMany({
      where: {
        provider: MonetizationProvider.STRIPE,
        providerPaymentId
      },
      data: {
        status,
        failureCode: failureCode.slice(0, 160)
      }
    });
  }

  private async grantCredits(
    tx: Prisma.TransactionClient,
    input: {
      order: {
        id: string;
        userId: string;
        creditsGrantedAt: Date | null;
      };
      credits: number;
      operationKey: string;
      providerPaymentId: string | null;
      providerCustomerId: string | null;
      providerCheckoutId: string | null;
    }
  ) {
    if (input.order.creditsGrantedAt) {
      return { replayed: true, credits: 0 };
    }
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.order.userId} FOR UPDATE`
    );
    const user = await tx.user.findUnique({
      where: { id: input.order.userId },
      select: { credits: true }
    });
    if (!user) throw new AppError("Joueur RTA introuvable.", 404);
    const balanceAfter = user.credits + input.credits;
    await tx.user.update({
      where: { id: input.order.userId },
      data: {
        credits: balanceAfter,
        balanceVersion: { increment: 1 }
      }
    });
    await tx.economicLedgerEntry.create({
      data: {
        userId: input.order.userId,
        asset: "CREDITS",
        delta: input.credits,
        balanceBefore: user.credits,
        balanceAfter,
        reason: "payment.credit_pack",
        referenceType: "PaymentOrder",
        referenceId: input.order.id,
        operationKey: input.operationKey
      }
    });
    await Promise.all([
      tx.transactionLog.create({
        data: {
          userId: input.order.userId,
          type: "credit_purchase",
          amount: input.credits,
          metadata: { orderId: input.order.id, operationKey: input.operationKey }
        }
      }),
      tx.economyLog.create({
        data: {
          userId: input.order.userId,
          type: "credit_purchase",
          amount: input.credits,
          metadata: { orderId: input.order.id, operationKey: input.operationKey }
        }
      }),
      tx.paymentOrder.update({
        where: { id: input.order.id },
        data: {
          status: PaymentOrderStatus.PAID,
          providerCheckoutId: input.providerCheckoutId,
          providerPaymentId: input.providerPaymentId,
          providerCustomerId: input.providerCustomerId,
          creditsGranted: input.credits,
          creditsGrantedAt: new Date(),
          failureCode: null
        }
      })
    ]);
    return { replayed: false, credits: input.credits };
  }
}
