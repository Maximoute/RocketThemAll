import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  MonetizationProvider,
  prisma
} from "@rta/database";
import { MonetizationService } from "../src/monetization.service.js";

const enabled = Boolean(process.env.RTA_TEST_DATABASE_URL);
const suite = enabled ? describe.sequential : describe.skip;
const prefix = `monetization-test-${randomUUID()}`;
const userIds: string[] = [];
const service = new MonetizationService();

suite("monetization PostgreSQL integration", () => {
  afterAll(async () => {
    if (!enabled) return;
    await prisma.economicLedgerEntry.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.transactionLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.economyLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.paymentWebhookEvent.deleteMany({
      where: { providerEventId: { startsWith: prefix } }
    });
    await prisma.$disconnect();
  });

  it("grants a Stripe credit pack exactly once", async () => {
    const user = await prisma.user.create({
      data: { discordId: `${prefix}-credits`, username: "Credit buyer" }
    });
    userIds.push(user.id);
    const order = await service.createOrder({
      userId: user.id,
      provider: MonetizationProvider.STRIPE,
      productKey: "credits_12000",
      withdrawalWaiverAcceptedAt: new Date()
    });
    await service.attachCheckout({
      orderId: order.id,
      providerCheckoutId: `${prefix}-checkout`,
      providerCustomerId: `${prefix}-customer`
    });
    const input = {
      orderId: order.id,
      providerCheckoutId: `${prefix}-checkout`,
      providerPaymentId: `${prefix}-payment`,
      providerCustomerId: `${prefix}-customer`,
      amountSubtotal: 999,
      currency: "eur"
    };
    const first = await service.fulfillStripeCreditOrder(input);
    const replay = await service.fulfillStripeCreditOrder(input);
    const [updated, ledgerCount, storedOrder] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.economicLedgerEntry.count({
        where: { operationKey: `payment:stripe:${prefix}-checkout:credits` }
      }),
      prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } })
    ]);
    expect(first).toMatchObject({ replayed: false, credits: 12_000 });
    expect(replay).toMatchObject({ replayed: true, credits: 0 });
    expect(updated.credits).toBe(12_000);
    expect(ledgerCount).toBe(1);
    expect(storedOrder).toMatchObject({
      status: "PAID",
      creditsGranted: 12_000
    });
  });

  it("activates and revokes the founder entitlement without stacking power", async () => {
    const user = await prisma.user.create({
      data: { discordId: `${prefix}-founder`, username: "Founder buyer" }
    });
    userIds.push(user.id);
    const order = await service.createOrder({
      userId: user.id,
      provider: MonetizationProvider.STRIPE,
      productKey: "founder_monthly",
      withdrawalWaiverAcceptedAt: new Date()
    });
    await service.activateStripeSubscription({
      orderId: order.id,
      userId: user.id,
      productKey: "founder_monthly",
      subscriptionId: `${prefix}-subscription`,
      customerId: `${prefix}-founder-customer`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 30 * 86_400_000),
      active: true,
      status: "active"
    });
    expect(await service.getUserAccess(user.id)).toMatchObject({
      tier: "FOUNDER",
      maxExplorationChargeBonus: 1
    });

    await service.activateStripeSubscription({
      orderId: order.id,
      userId: user.id,
      productKey: "founder_monthly",
      subscriptionId: `${prefix}-subscription`,
      customerId: `${prefix}-founder-customer`,
      startsAt: new Date(),
      endsAt: new Date(),
      active: false,
      status: "canceled"
    });
    expect(await service.getUserAccess(user.id)).toMatchObject({
      tier: "FREE",
      maxExplorationChargeBonus: 0
    });
  });
});
