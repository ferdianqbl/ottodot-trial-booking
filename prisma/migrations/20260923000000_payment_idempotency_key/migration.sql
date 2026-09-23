-- The key sent to the gateway for an attempt. A retried request reuses it, so the card is
-- authorized once; a reconciliation job can also match a row back to the provider with it.
ALTER TABLE "PaymentAttempt" ADD COLUMN "idempotencyKey" TEXT;
