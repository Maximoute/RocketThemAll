CREATE TYPE "MonetizationProvider" AS ENUM (
  'STRIPE',
  'DISCORD'
);

CREATE TYPE "PaymentOrderStatus" AS ENUM (
  'PENDING',
  'CHECKOUT_CREATED',
  'PAID',
  'FAILED',
  'EXPIRED',
  'REFUNDED',
  'DISPUTED'
);

CREATE TYPE "PaymentWebhookStatus" AS ENUM (
  'PROCESSING',
  'PROCESSED',
  'FAILED'
);

CREATE TABLE "PaymentCustomer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "MonetizationProvider" NOT NULL,
  "providerCustomerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentOrder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "MonetizationProvider" NOT NULL,
  "productKey" TEXT NOT NULL,
  "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "providerCheckoutId" TEXT,
  "providerPaymentId" TEXT,
  "providerCustomerId" TEXT,
  "providerEntitlementId" TEXT,
  "creditsGranted" INTEGER NOT NULL DEFAULT 0,
  "creditsGrantedAt" TIMESTAMP(3),
  "withdrawalWaiverAcceptedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserEntitlement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "MonetizationProvider" NOT NULL,
  "providerExternalId" TEXT NOT NULL,
  "productKey" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" "MonetizationProvider" NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" "PaymentWebhookStatus" NOT NULL DEFAULT 'PROCESSING',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentCustomer_providerCustomerId_key"
ON "PaymentCustomer"("providerCustomerId");
CREATE UNIQUE INDEX "PaymentCustomer_userId_provider_key"
ON "PaymentCustomer"("userId", "provider");
CREATE INDEX "PaymentCustomer_provider_updatedAt_idx"
ON "PaymentCustomer"("provider", "updatedAt");

CREATE UNIQUE INDEX "PaymentOrder_provider_providerCheckoutId_key"
ON "PaymentOrder"("provider", "providerCheckoutId");
CREATE UNIQUE INDEX "PaymentOrder_provider_providerEntitlementId_key"
ON "PaymentOrder"("provider", "providerEntitlementId");
CREATE INDEX "PaymentOrder_userId_createdAt_idx"
ON "PaymentOrder"("userId", "createdAt");
CREATE INDEX "PaymentOrder_provider_status_createdAt_idx"
ON "PaymentOrder"("provider", "status", "createdAt");
CREATE INDEX "PaymentOrder_provider_providerPaymentId_idx"
ON "PaymentOrder"("provider", "providerPaymentId");

CREATE UNIQUE INDEX "UserEntitlement_provider_providerExternalId_key"
ON "UserEntitlement"("provider", "providerExternalId");
CREATE INDEX "UserEntitlement_userId_active_endsAt_idx"
ON "UserEntitlement"("userId", "active", "endsAt");
CREATE INDEX "UserEntitlement_productKey_active_endsAt_idx"
ON "UserEntitlement"("productKey", "active", "endsAt");

CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key"
ON "PaymentWebhookEvent"("provider", "providerEventId");
CREATE INDEX "PaymentWebhookEvent_status_updatedAt_idx"
ON "PaymentWebhookEvent"("status", "updatedAt");

ALTER TABLE "PaymentCustomer"
ADD CONSTRAINT "PaymentCustomer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentOrder"
ADD CONSTRAINT "PaymentOrder_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserEntitlement"
ADD CONSTRAINT "UserEntitlement_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentOrder"
ADD CONSTRAINT "PaymentOrder_amountCents_check"
CHECK ("amountCents" >= 0);

ALTER TABLE "PaymentOrder"
ADD CONSTRAINT "PaymentOrder_creditsGranted_check"
CHECK ("creditsGranted" >= 0);
