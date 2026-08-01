import { PaymentOrderStatus } from "@rta/database";
import {
  getMonetizationProduct,
  MonetizationService,
  type MonetizationProductKey
} from "@rta/services";
import type Stripe from "stripe";
import {
  getStripeClient,
  stripeWebhookSecret
} from "../../../../../lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const monetizationService = new MonetizationService();
const MAX_WEBHOOK_BYTES = 1_000_000;

function resourceId(
  value: string | { id: string } | null | undefined
) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function timestamp(value: number | null | undefined) {
  return value ? new Date(value * 1_000) : null;
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => Number.isFinite(value));
  return ends.length > 0 ? new Date(Math.max(...ends) * 1_000) : null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata.rtaUserId;
  const rawProductKey = subscription.metadata.rtaProductKey;
  if (!userId || !rawProductKey) return;
  const product = getMonetizationProduct(rawProductKey);
  if (product.kind !== "SUBSCRIPTION") return;
  await monetizationService.activateStripeSubscription({
    orderId: subscription.metadata.rtaOrderId || null,
    userId,
    productKey: product.key as MonetizationProductKey,
    subscriptionId: subscription.id,
    customerId: resourceId(subscription.customer),
    startsAt: timestamp(subscription.start_date),
    endsAt: subscriptionPeriodEnd(subscription),
    active: subscription.status === "active" || subscription.status === "trialing",
    status: subscription.status
  });
}

async function processCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  forcePaid = false
) {
  const orderId = session.metadata?.rtaOrderId;
  const rawProductKey = session.metadata?.rtaProductKey;
  if (!orderId || !rawProductKey) return;
  const product = getMonetizationProduct(rawProductKey);
  if (product.kind === "CREDIT_PACK") {
    if (!forcePaid && session.payment_status !== "paid") return;
    await monetizationService.fulfillStripeCreditOrder({
      orderId,
      providerCheckoutId: session.id,
      providerPaymentId: resourceId(session.payment_intent),
      providerCustomerId: resourceId(session.customer),
      amountSubtotal: session.amount_subtotal ?? -1,
      currency: session.currency ?? ""
    });
    return;
  }
  const subscriptionId = resourceId(session.subscription);
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(subscription);
}

async function processStripeEvent(stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await processCheckoutSession(stripe, event.data.object);
      break;
    case "checkout.session.async_payment_succeeded":
      await processCheckoutSession(stripe, event.data.object, true);
      break;
    case "checkout.session.async_payment_failed":
      await monetizationService.markCheckoutStatus(
        event.data.object.id,
        PaymentOrderStatus.FAILED,
        "async_payment_failed"
      );
      break;
    case "checkout.session.expired":
      await monetizationService.markCheckoutStatus(
        event.data.object.id,
        PaymentOrderStatus.EXPIRED,
        "checkout_expired"
      );
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      break;
    case "charge.refunded": {
      const paymentIntentId = resourceId(event.data.object.payment_intent);
      if (paymentIntentId) {
        await monetizationService.markStripePaymentStatus(
          paymentIntentId,
          PaymentOrderStatus.REFUNDED,
          "charge_refunded"
        );
      }
      break;
    }
    case "charge.dispute.created": {
      const paymentIntentId = resourceId(event.data.object.payment_intent);
      if (paymentIntentId) {
        await monetizationService.markStripePaymentStatus(
          paymentIntentId,
          PaymentOrderStatus.DISPUTED,
          "charge_disputed"
        );
      }
      break;
    }
    default:
      break;
  }
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return Response.json(
      { ok: false, error: "Stripe webhook payload is too large" },
      { status: 413 }
    );
  }
  const stripe = getStripeClient();
  const secret = stripeWebhookSecret();
  if (!stripe || !secret) {
    return Response.json(
      { ok: false, error: "Stripe webhook is not configured" },
      { status: 503 }
    );
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json(
      { ok: false, error: "Missing Stripe-Signature header" },
      { status: 400 }
    );
  }
  let event: Stripe.Event;
  try {
    const payload = await request.text();
    if (Buffer.byteLength(payload, "utf8") > MAX_WEBHOOK_BYTES) {
      return Response.json(
        { ok: false, error: "Stripe webhook payload is too large" },
        { status: 413 }
      );
    }
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return Response.json(
      { ok: false, error: "Invalid Stripe webhook signature" },
      { status: 400 }
    );
  }

  const state = await monetizationService.beginWebhook(event.id, event.type);
  if (!state.process) return Response.json({ ok: true, replayed: true });

  try {
    await processStripeEvent(stripe, event);
    await monetizationService.completeWebhook(event.id);
    return Response.json({ ok: true });
  } catch (error) {
    await monetizationService.failWebhook(event.id, error);
    return Response.json(
      { ok: false, error: "Stripe event processing failed" },
      { status: 500 }
    );
  }
}
