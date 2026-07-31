"use server";

import { MonetizationProvider, prisma } from "@rta/database";
import {
  getMonetizationProduct,
  MonetizationService,
  type MonetizationProductKey
} from "@rta/services";
import { redirect } from "next/navigation";
import { requireUser } from "../../lib/guard";
import {
  getStripeClient,
  paymentBaseUrl,
  stripeAutomaticTaxEnabled,
  stripePriceId,
  stripeProductReady
} from "../../lib/stripe";

const monetizationService = new MonetizationService();

function shopError(message: string): never {
  redirect(`/shop?section=premium&error=${encodeURIComponent(message)}#support`);
}

export async function createStripeCheckout(formData: FormData) {
  const user = await requireUser();
  const rawProductKey = String(formData.get("productKey") ?? "");
  let product;
  try {
    product = getMonetizationProduct(rawProductKey);
  } catch (error) {
    shopError(error instanceof Error ? error.message : "Produit inconnu.");
  }
  const productKey = product.key as MonetizationProductKey;
  if (!stripeProductReady(productKey)) {
    shopError("Les paiements Stripe ne sont pas encore activés pour ce produit.");
  }
  if (formData.get("withdrawalWaiver") !== "accepted") {
    shopError(
      "Tu dois confirmer la livraison immédiate et les conditions de rétractation."
    );
  }
  const stripe = getStripeClient();
  const priceId = stripePriceId(productKey);
  if (!stripe || !priceId) {
    shopError("Configuration Stripe incomplète.");
  }

  if (product.kind === "SUBSCRIPTION") {
    const access = await monetizationService.getUserAccess(user.id);
    if (access.tier !== "FREE") {
      shopError(
        "Un abonnement RTA est déjà actif. Utilise la gestion d’abonnement pour le modifier."
      );
    }
  }

  const recentAttempts = await prisma.paymentOrder.count({
    where: {
      userId: user.id,
      provider: MonetizationProvider.STRIPE,
      createdAt: { gt: new Date(Date.now() - 60_000) }
    }
  });
  if (recentAttempts >= 5) {
    shopError("Trop de tentatives de paiement. Réessaie dans une minute.");
  }

  let orderId: string | null = null;
  try {
    let customer = await monetizationService.findPaymentCustomer(
      user.id,
      MonetizationProvider.STRIPE
    );
    if (!customer) {
      const created = await stripe.customers.create(
        {
          metadata: {
            rtaUserId: user.id
          }
        },
        { idempotencyKey: `rta-customer-${user.id}` }
      );
      customer = await monetizationService.upsertPaymentCustomer({
        userId: user.id,
        provider: MonetizationProvider.STRIPE,
        providerCustomerId: created.id
      });
    }

    const order = await monetizationService.createOrder({
      userId: user.id,
      provider: MonetizationProvider.STRIPE,
      productKey,
      withdrawalWaiverAcceptedAt: new Date(),
      metadata: { source: "web_shop" }
    });
    orderId = order.id;

    const baseUrl = paymentBaseUrl();
    const metadata = {
      rtaOrderId: order.id,
      rtaUserId: user.id,
      rtaProductKey: product.key
    };
    const session = await stripe.checkout.sessions.create(
      {
        mode: product.kind === "SUBSCRIPTION" ? "subscription" : "payment",
        customer: customer.providerCustomerId,
        client_reference_id: order.id,
        line_items: [{ price: priceId, quantity: 1 }],
        locale: "fr",
        success_url: `${baseUrl}/shop?section=premium&payment=success&session_id={CHECKOUT_SESSION_ID}#support`,
        cancel_url: `${baseUrl}/shop?section=premium&payment=cancelled#support`,
        billing_address_collection: stripeAutomaticTaxEnabled() ? "required" : "auto",
        automatic_tax: { enabled: stripeAutomaticTaxEnabled() },
        customer_update: {
          address: "auto",
          name: "auto"
        },
        metadata,
        ...(product.kind === "SUBSCRIPTION"
          ? { subscription_data: { metadata } }
          : { payment_intent_data: { metadata } })
      },
      { idempotencyKey: `rta-checkout-${order.id}` }
    );
    if (!session.url) {
      throw new Error("Stripe n’a pas fourni d’URL de paiement.");
    }
    await monetizationService.attachCheckout({
      orderId: order.id,
      providerCheckoutId: session.id,
      providerCustomerId: customer.providerCustomerId
    });
    redirect(session.url);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    if (orderId) {
      await monetizationService.markOrderFailed(
        orderId,
        error instanceof Error ? error.message : "stripe_checkout_error"
      );
    }
    shopError(
      "Paiement Stripe temporairement indisponible. Réessaie plus tard ou contacte le support RTA."
    );
  }
}

export async function openStripeCustomerPortal() {
  const user = await requireUser();
  const stripe = getStripeClient();
  if (!stripe) shopError("Stripe n’est pas encore configuré.");
  const customer = await monetizationService.findPaymentCustomer(
    user.id,
    MonetizationProvider.STRIPE
  );
  if (!customer) {
    shopError("Aucun compte de facturation Stripe n’est associé à ton profil.");
  }
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.providerCustomerId,
      return_url: `${paymentBaseUrl()}/shop?section=premium#support`
    });
    redirect(portal.url);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    shopError(
      "Portail Stripe temporairement indisponible. Réessaie plus tard ou contacte le support RTA."
    );
  }
}
