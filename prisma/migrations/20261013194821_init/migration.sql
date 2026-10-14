-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'NEEDS_REFUND');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED');

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "phoneKey" TEXT NOT NULL,
    "gothram" TEXT,
    "notes" TEXT,
    "yajamaniQty" INTEGER NOT NULL DEFAULT 0,
    "generalQty" INTEGER NOT NULL DEFAULT 0,
    "amountPence" INTEGER NOT NULL DEFAULT 0,
    "stripeSessionId" TEXT,
    "paymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT,
    "amountPence" INTEGER NOT NULL,
    "stripeSessionId" TEXT,
    "paymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_accessToken_key" ON "Booking"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_stripeSessionId_key" ON "Booking"("stripeSessionId");

-- CreateIndex
CREATE INDEX "Booking_status_expiresAt_idx" ON "Booking"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Booking_emailKey_idx" ON "Booking"("emailKey");

-- CreateIndex
CREATE INDEX "Booking_phoneKey_idx" ON "Booking"("phoneKey");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_reference_key" ON "Donation"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_accessToken_key" ON "Donation"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_stripeSessionId_key" ON "Donation"("stripeSessionId");

-- CreateIndex
CREATE INDEX "Donation_status_idx" ON "Donation"("status");
