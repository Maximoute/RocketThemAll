import "server-only";
import Stripe from "stripe";
import {
  MONETIZATION_PRODUCTS,
  type MonetizationProductKey
} from "@rta/services";

let stripeClient: Stripe | null | undefined;

export function paymentsEnabled() {
  return process.env.RTA_PAYMENTS_ENABLED === "true";
}

export function stripeAutomaticTaxEnabled() {
  return process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true";
}

export function stripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function getStripeClient() {
  if (stripeClient !== undefined) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  stripeClient = secretKey ? new Stripe(secretKey) : null;
  return stripeClient;
}

export function stripePriceId(productKey: MonetizationProductKey) {
  const priceId = process.env[
    MONETIZATION_PRODUCTS[productKey].stripePriceEnv
  ]?.trim();
  return priceId && /^price_[A-Za-z0-9]+$/.test(priceId) ? priceId : null;
}

export function stripeProductReady(productKey: MonetizationProductKey) {
  return Boolean(
    paymentsEnabled() &&
    getStripeClient() &&
    stripeWebhookSecret() &&
    stripePriceId(productKey)
  );
}

export function paymentBaseUrl() {
  const raw = process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000";
  const url = new URL(raw);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new Error("NEXTAUTH_URL doit utiliser HTTPS pour activer les paiements.");
  }
  return url.origin;
}

export function stripeModeLabel() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return "non configuré";
}
