-- Switch the payment provider from Stripe to SumUp.
-- Existing values are kept (columns are renamed, not dropped).

-- Booking
ALTER TABLE "Booking" RENAME COLUMN "stripeSessionId" TO "sumupCheckoutId";
ALTER TABLE "Booking" RENAME COLUMN "paymentIntentId" TO "sumupTransactionId";
ALTER TABLE "Booking" ADD COLUMN "sumupCheckoutUrl" TEXT;
ALTER INDEX "Booking_stripeSessionId_key" RENAME TO "Booking_sumupCheckoutId_key";

-- Donation
ALTER TABLE "Donation" RENAME COLUMN "stripeSessionId" TO "sumupCheckoutId";
ALTER TABLE "Donation" RENAME COLUMN "paymentIntentId" TO "sumupTransactionId";
ALTER TABLE "Donation" ADD COLUMN "sumupCheckoutUrl" TEXT;
ALTER INDEX "Donation_stripeSessionId_key" RENAME TO "Donation_sumupCheckoutId_key";
