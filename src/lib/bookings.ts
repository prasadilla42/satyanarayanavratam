import { Prisma, type Booking, type Donation } from "@prisma/client";
import { after } from "next/server";
import { db } from "./db";
import {
  BOOKING_REF_PREFIX,
  CHECKOUT_HOLD_MINUTES,
  CURRENCY,
  DONATION_REF_PREFIX,
  EVENT,
  HOLD_GRACE_MINUTES,
  TICKETS,
  siteUrl,
} from "./config";
import { sendBookingConfirmationEmail, sendDonationReceiptEmail } from "./email";
import { emailKey, generateAccessToken, generateReference, phoneKey } from "./normalize";
import {
  checkoutAmountPence,
  checkoutTransactionId,
  createHostedCheckout,
  deactivateCheckout,
  getCheckout,
  sumupMerchantCode,
  type SumUpCheckout,
} from "./sumup";
import type { BookingInput, DonationInput } from "./validation";

type Tx = Prisma.TransactionClient;

/**
 * Takes a Postgres advisory lock (id 20261115, held until the transaction ends)
 * so every operation that changes seat counts runs one at a time. This is what
 * prevents overselling and duplicate bookings under concurrent requests.
 */
async function lockSeats(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261115)`;
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

export interface Slot {
  capacity: number;
  taken: number;
  remaining: number;
}
export interface Availability {
  yajamani: Slot;
  general: Slot;
}

/** Seats currently used: confirmed bookings + unpaid bookings whose hold hasn't lapsed. */
async function countHeld(tx: Tx | typeof db, excludeId?: string) {
  const agg = await tx.booking.aggregate({
    where: {
      OR: [
        { status: "CONFIRMED" },
        { status: "PENDING", expiresAt: { gt: new Date() } },
      ],
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    _sum: { yajamaniQty: true, generalQty: true },
  });
  return {
    yajamani: agg._sum.yajamaniQty ?? 0,
    general: agg._sum.generalQty ?? 0,
  };
}

export interface Capacities {
  yajamani: number;
  general: number;
}

/** Ticket limits. Editable by the organiser in /admin; falls back to the defaults in config.ts. */
export async function getCapacities(tx: Tx | typeof db = db): Promise<Capacities> {
  const s = await tx.eventSettings.findUnique({ where: { id: 1 } });
  return {
    yajamani: s?.yajamaniCapacity ?? TICKETS.yajamani.capacity,
    general: s?.generalCapacity ?? TICKETS.general.capacity,
  };
}

function toAvailability(held: { yajamani: number; general: number }, caps: Capacities): Availability {
  const slot = (capacity: number, taken: number): Slot => ({
    capacity,
    taken,
    remaining: Math.max(0, capacity - taken),
  });
  return {
    yajamani: slot(caps.yajamani, held.yajamani),
    general: slot(caps.general, held.general),
  };
}

export async function getAvailability(): Promise<Availability> {
  const [held, caps] = await Promise.all([countHeld(db), getCapacities(db)]);
  return toAvailability(held, caps);
}

/* ------------------------------------------------------------------ */
/* Create booking (reserves seats, rejects duplicates)                 */
/* ------------------------------------------------------------------ */

export type CreateBookingResult =
  | { ok: true; booking: Booking; requiresPayment: boolean }
  | {
      ok: false;
      code: "DUPLICATE";
      /** An unpaid booking by the same person that can be resumed on SumUp */
      resumable: Booking | null;
    }
  | {
      ok: false;
      code: "SOLD_OUT";
      field: "yajamaniQty" | "generalQty";
      availability: Availability;
    };

export async function createBooking(input: BookingInput): Promise<CreateBookingResult> {
  const ek = emailKey(input.email);
  const pk = phoneKey(input.phone);
  const amountPence = input.yajamaniQty * TICKETS.yajamani.pricePence;
  const requiresPayment = amountPence > 0;

  return db.$transaction(
    async (tx): Promise<CreateBookingResult> => {
      await lockSeats(tx);
      const now = new Date();

      // 1. Duplicate check: same email OR same phone with an active booking
      const existing = await tx.booking.findMany({
        where: {
          AND: [
            { OR: [{ emailKey: ek }, { phoneKey: pk }] },
            { OR: [{ status: "CONFIRMED" }, { status: "PENDING", expiresAt: { gt: now } }] },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing.length > 0) {
        const resumable =
          existing.find(
            (b) => b.status === "PENDING" && b.emailKey === ek && b.phoneKey === pk,
          ) ?? null;
        return { ok: false, code: "DUPLICATE", resumable };
      }

      // 2. Capacity check
      const held = await countHeld(tx);
      const caps = await getCapacities(tx);
      if (input.yajamaniQty > 0 && held.yajamani + input.yajamaniQty > caps.yajamani) {
        return {
          ok: false,
          code: "SOLD_OUT",
          field: "yajamaniQty",
          availability: toAvailability(held, caps),
        };
      }
      if (input.generalQty > 0 && held.general + input.generalQty > caps.general) {
        return {
          ok: false,
          code: "SOLD_OUT",
          field: "generalQty",
          availability: toAvailability(held, caps),
        };
      }

      // 3. Unique reference
      let reference = generateReference(BOOKING_REF_PREFIX);
      while (await tx.booking.findUnique({ where: { reference }, select: { id: true } })) {
        reference = generateReference(BOOKING_REF_PREFIX);
      }

      // 4. Reserve
      const booking = await tx.booking.create({
        data: {
          reference,
          accessToken: generateAccessToken(),
          status: requiresPayment ? "PENDING" : "CONFIRMED",
          name: input.name,
          email: input.email.trim(),
          phone: input.phone,
          emailKey: ek,
          phoneKey: pk,
          gothram: input.gothram || null,
          notes: input.notes || null,
          yajamaniQty: input.yajamaniQty,
          generalQty: input.generalQty,
          amountPence,
          expiresAt: requiresPayment
            ? new Date(now.getTime() + (CHECKOUT_HOLD_MINUTES + HOLD_GRACE_MINUTES) * 60_000)
            : null,
        },
      });
      return { ok: true, booking, requiresPayment };
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

/** Public https address SumUp calls when a checkout changes status. Omitted on localhost (SumUp can't reach it). */
function callbackUrl(): string | undefined {
  const base = siteUrl();
  return base.startsWith("https://") ? `${base}/api/webhooks/sumup` : undefined;
}

const confirmationUrl = (reference: string, token: string) =>
  `${siteUrl()}/confirmation?ref=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`;

/** Creates the SumUp Hosted Checkout for a PENDING booking and returns the payment page URL. */
export async function startBookingCheckout(booking: Booking): Promise<string> {
  try {
    const checkout = await createHostedCheckout({
      reference: booking.reference,
      amountPence: booking.amountPence,
      currency: CURRENCY,
      description: `${EVENT.name} – ${booking.yajamaniQty} × ${TICKETS.yajamani.name} (${booking.reference})`.slice(0, 250),
      redirectUrl: confirmationUrl(booking.reference, booking.accessToken),
      callbackUrl: callbackUrl(),
      validUntil: new Date(Date.now() + CHECKOUT_HOLD_MINUTES * 60_000),
    });
    await db.booking.update({
      where: { id: booking.id },
      data: { sumupCheckoutId: checkout.id, sumupCheckoutUrl: checkout.hosted_checkout_url },
    });
    after(() => watchCheckout(checkout.id));
    return checkout.hosted_checkout_url!;
  } catch (err) {
    // Release the seats straight away
    await db.booking
      .update({ where: { id: booking.id }, data: { status: "CANCELLED" } })
      .catch(() => {});
    throw err;
  }
}

const WATCH_INTERVAL_MS = 8_000;

/**
 * Safety net that does not depend on SumUp's callback or on the customer coming back to our
 * site: for a few minutes after a checkout is created we ask SumUp every few seconds whether it
 * has been paid. As soon as it is, the booking/donation is confirmed and the email is sent.
 * Run it with `after()` from a route that sets `maxDuration` (the loop stops before that limit).
 * CHECKOUT_WATCH_SECONDS=0 turns it off.
 */
export async function watchCheckout(checkoutId: string): Promise<void> {
  const seconds = Number(process.env.CHECKOUT_WATCH_SECONDS ?? 270);
  const end = Date.now() + (Number.isFinite(seconds) ? seconds : 270) * 1000;
  while (Date.now() + WATCH_INTERVAL_MS < end) {
    await new Promise((r) => setTimeout(r, WATCH_INTERVAL_MS));
    try {
      const checkout = await getCheckout(checkoutId);
      if (checkout.status === "PAID" || checkout.status === "EXPIRED") {
        await settleCheckout(checkoutId);
        return;
      }
    } catch (err) {
      console.error("[sumup] watch failed for", checkoutId, err instanceof Error ? err.message : err);
    }
  }
}

/** If the visitor already has an unpaid checkout open, returns its SumUp payment page URL. */
export async function resumeCheckoutUrl(booking: Booking): Promise<string | null> {
  if (!booking.sumupCheckoutId || !booking.sumupCheckoutUrl) return null;
  try {
    const checkout = await getCheckout(booking.sumupCheckoutId);
    // FAILED means the last card attempt failed; SumUp lets the customer try again on the same page.
    const usable = checkout.status === "PENDING" || checkout.status === "FAILED";
    const notExpired = !checkout.valid_until || new Date(checkout.valid_until).getTime() > Date.now();
    return usable && notExpired ? booking.sumupCheckoutUrl : null;
  } catch {
    return null;
  }
}
/* ------------------------------------------------------------------ */
/* Payment verification (SumUp callback + confirmation page fallback)  */
/* ------------------------------------------------------------------ */

/**
 * SumUp's status callback is NOT signed, so we never trust it. Every payment is verified by
 * fetching the checkout from SumUp's API and checking reference, amount, currency and merchant.
 * Returns a description of the problem, or null if everything matches.
 */
function checkoutMismatch(checkout: SumUpCheckout, expectedPence: number, reference: string): string | null {
  if (checkout.checkout_reference !== reference) {
    return `reference is ${checkout.checkout_reference}, expected ${reference}`;
  }
  if (checkoutAmountPence(checkout) !== expectedPence || checkout.currency?.toUpperCase() !== CURRENCY.toUpperCase()) {
    return `paid ${checkout.amount} ${checkout.currency}, expected ${expectedPence} pence`;
  }
  if (checkout.merchant_code?.toUpperCase() !== sumupMerchantCode()) {
    return `merchant ${checkout.merchant_code} is not ours`;
  }
  return null;
}

/**
 * Marks a booking as CONFIRMED once SumUp reports its checkout as PAID.
 * Safe to call many times (callback retries, confirmation-page refreshes).
 */
export async function confirmPaidBooking(checkout: SumUpCheckout): Promise<Booking | null> {
  if (checkout.status !== "PAID") return null;

  const booking = await db.booking.findUnique({ where: { sumupCheckoutId: checkout.id } });
  if (!booking) {
    console.error(`[sumup] Paid checkout ${checkout.id} has no matching booking`);
    return null;
  }

  const mismatch = checkoutMismatch(checkout, booking.amountPence, booking.reference);
  if (mismatch) {
    console.error(`[sumup] Checkout mismatch for ${booking.reference}: ${mismatch}`);
    return booking;
  }
  const transactionId = checkoutTransactionId(checkout);

  if (booking.status !== "CONFIRMED") {
    const updated = await db.$transaction(
      async (tx) => {
        await lockSeats(tx);
        const current = await tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
        if (current.status === "CONFIRMED" || current.status === "NEEDS_REFUND") return current;

        const holdLapsed =
          current.status !== "PENDING" || (current.expiresAt && current.expiresAt < new Date());
        if (holdLapsed) {
          const held = await countHeld(tx, current.id);
          const caps = await getCapacities(tx);
          const full =
            held.yajamani + current.yajamaniQty > caps.yajamani ||
            held.general + current.generalQty > caps.general;
          if (full) {
            return tx.booking.update({
              where: { id: current.id },
              data: { status: "NEEDS_REFUND", paidAt: new Date(), sumupTransactionId: transactionId },
            });
          }
        }
        return tx.booking.update({
          where: { id: current.id },
          data: { status: "CONFIRMED", paidAt: new Date(), sumupTransactionId: transactionId, expiresAt: null },
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    if (updated.status === "NEEDS_REFUND") {
      console.error(`[sumup] ${updated.reference} was paid after seats were released – refund required`);
      return updated;
    }
    await sendBookingEmail(updated.id);
    return updated;
  }

  await sendBookingEmail(booking.id);
  return booking;
}

/** Releases the seats of an unpaid booking / donation whose SumUp checkout has expired. */
export async function expireCheckout(checkoutId: string) {
  await db.booking.updateMany({
    where: { sumupCheckoutId: checkoutId, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  await db.donation.updateMany({
    where: { sumupCheckoutId: checkoutId, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
}

/**
 * Looks the checkout up at SumUp (the only source of truth) and updates our booking or donation.
 * Used by the SumUp callback and by the confirmation page. Ids we did not create are ignored
 * without calling SumUp.
 */
export async function settleCheckout(checkoutId: string): Promise<"booking" | "donation" | null> {
  const [booking, donation] = await Promise.all([
    db.booking.findUnique({ where: { sumupCheckoutId: checkoutId }, select: { id: true } }),
    db.donation.findUnique({ where: { sumupCheckoutId: checkoutId }, select: { id: true } }),
  ]);
  if (!booking && !donation) return null;

  const checkout = await getCheckout(checkoutId);
  if (checkout.status === "PAID") {
    if (booking) await confirmPaidBooking(checkout);
    else await confirmPaidDonation(checkout);
  } else if (checkout.status === "EXPIRED") {
    await expireCheckout(checkoutId);
  }
  // PENDING / FAILED: the customer may still retry on SumUp's page, so leave it as is.
  return booking ? "booking" : "donation";
}

/* ------------------------------------------------------------------ */
/* Emails (sent at most once per booking / donation)                   */
/* ------------------------------------------------------------------ */

export async function sendBookingEmail(bookingId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const claimed = await db.booking.updateMany({
    where: { id: bookingId, status: "CONFIRMED", ...(opts.force ? {} : { emailSentAt: null }) },
    data: { emailSentAt: new Date() },
  });
  if (claimed.count === 0) return false;
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  try {
    const sent = await sendBookingConfirmationEmail(booking);
    if (!sent) await db.booking.update({ where: { id: bookingId }, data: { emailSentAt: null } });
    return sent;
  } catch (err) {
    console.error(`[email] Failed to send confirmation for ${booking.reference}`, err);
    await db.booking.update({ where: { id: bookingId }, data: { emailSentAt: null } });
    return false;
  }
}

export async function sendDonationEmail(donationId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const claimed = await db.donation.updateMany({
    where: { id: donationId, status: "PAID", ...(opts.force ? {} : { emailSentAt: null }) },
    data: { emailSentAt: new Date() },
  });
  if (claimed.count === 0) return false;
  const donation = await db.donation.findUniqueOrThrow({ where: { id: donationId } });
  try {
    const sent = await sendDonationReceiptEmail(donation);
    if (!sent) await db.donation.update({ where: { id: donationId }, data: { emailSentAt: null } });
    return sent;
  } catch (err) {
    console.error(`[email] Failed to send receipt for ${donation.reference}`, err);
    await db.donation.update({ where: { id: donationId }, data: { emailSentAt: null } });
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Donations                                                           */
/* ------------------------------------------------------------------ */

export async function createDonationCheckout(input: DonationInput): Promise<string> {
  let reference = generateReference(DONATION_REF_PREFIX);
  while (await db.donation.findUnique({ where: { reference }, select: { id: true } })) {
    reference = generateReference(DONATION_REF_PREFIX);
  }
  const donation = await db.donation.create({
    data: {
      reference,
      accessToken: generateAccessToken(),
      name: input.name,
      email: input.email.trim(),
      message: input.message || null,
      amountPence: input.amountPence,
    },
  });

  try {
    const checkout = await createHostedCheckout({
      reference: donation.reference,
      amountPence: donation.amountPence,
      currency: CURRENCY,
      description: `Donation – ${EVENT.name} (${donation.reference})`.slice(0, 250),
      redirectUrl: confirmationUrl(donation.reference, donation.accessToken),
      callbackUrl: callbackUrl(),
      validUntil: new Date(Date.now() + CHECKOUT_HOLD_MINUTES * 60_000),
    });
    await db.donation.update({
      where: { id: donation.id },
      data: { sumupCheckoutId: checkout.id, sumupCheckoutUrl: checkout.hosted_checkout_url },
    });
    after(() => watchCheckout(checkout.id));
    return checkout.hosted_checkout_url!;
  } catch (err) {
    await db.donation.update({ where: { id: donation.id }, data: { status: "EXPIRED" } }).catch(() => {});
    throw err;
  }
}

export async function confirmPaidDonation(checkout: SumUpCheckout): Promise<Donation | null> {
  if (checkout.status !== "PAID") return null;
  const donation = await db.donation.findUnique({ where: { sumupCheckoutId: checkout.id } });
  if (!donation) {
    console.error(`[sumup] Paid checkout ${checkout.id} has no matching donation`);
    return null;
  }
  const mismatch = checkoutMismatch(checkout, donation.amountPence, donation.reference);
  if (mismatch) {
    console.error(`[sumup] Checkout mismatch for ${donation.reference}: ${mismatch}`);
    return donation;
  }
  let current = donation;
  if (donation.status !== "PAID") {
    current = await db.donation.update({
      where: { id: donation.id },
      data: { status: "PAID", paidAt: new Date(), sumupTransactionId: checkoutTransactionId(checkout) },
    });
  }
  await sendDonationEmail(current.id);
  return current;
}

/* ------------------------------------------------------------------ */
/* Admin actions (only reachable from /admin, which is password protected) */
/* ------------------------------------------------------------------ */

export const MAX_CAPACITY = 5000;

export type AdminResult = { ok: boolean; message: string };

/** Changes the ticket limits. A limit can't go below the seats already confirmed or held. */
export async function setCapacities(yajamani: number, general: number): Promise<AdminResult> {
  const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_CAPACITY;
  if (!valid(yajamani) || !valid(general)) {
    return { ok: false, message: `Enter whole numbers between 0 and ${MAX_CAPACITY}.` };
  }
  return db.$transaction(
    async (tx): Promise<AdminResult> => {
      await lockSeats(tx);
      const held = await countHeld(tx);
      if (yajamani < held.yajamani) {
        return {
          ok: false,
          message: `${held.yajamani} Yajamani seats are already booked or held, so the limit can't be below ${held.yajamani}. Cancel some bookings first.`,
        };
      }
      if (general < held.general) {
        return {
          ok: false,
          message: `${held.general} General seats are already booked or held, so the limit can't be below ${held.general}. Cancel some bookings first.`,
        };
      }
      await tx.eventSettings.upsert({
        where: { id: 1 },
        create: { id: 1, yajamaniCapacity: yajamani, generalCapacity: general },
        update: { yajamaniCapacity: yajamani, generalCapacity: general },
      });
      return { ok: true, message: `Saved: ${yajamani} Yajamani and ${general} General tickets.` };
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

/**
 * Cancels a booking: frees its seats and its email address / phone number straight away.
 * The record stays in the list as CANCELLED. This does not refund any payment.
 */
export async function adminCancelBooking(id: string) {
  const booking = await db.$transaction(
    async (tx) => {
      await lockSeats(tx);
      const current = await tx.booking.findUnique({ where: { id } });
      if (!current || current.status === "CANCELLED") return null;
      return tx.booking.update({ where: { id }, data: { status: "CANCELLED", expiresAt: null } });
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
  // Make sure an unpaid checkout can't be paid after the booking was removed.
  if (booking?.sumupCheckoutId && booking.paidAt === null) await deactivateCheckout(booking.sumupCheckoutId);
}

/** Permanently deletes a booking record (frees seats, email and phone). Does not refund. */
export async function adminDeleteBooking(id: string) {
  const booking = await db.$transaction(
    async (tx) => {
      await lockSeats(tx);
      const current = await tx.booking.findUnique({ where: { id } });
      if (!current) return null;
      await tx.booking.delete({ where: { id } });
      return current;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
  if (booking?.sumupCheckoutId && booking.paidAt === null) await deactivateCheckout(booking.sumupCheckoutId);
}

/** Permanently deletes a donation record. Does not refund. */
/**
 * Asks SumUp whether a booking / donation was actually paid. If it was, it is confirmed and its
 * email is sent (same code path as SumUp's callback). Use when a payment was made but the
 * callback never arrived.
 */
export async function adminCheckPayment(kind: "booking" | "donation", id: string): Promise<AdminResult> {
  const row =
    kind === "booking"
      ? await db.booking.findUnique({ where: { id }, select: { sumupCheckoutId: true } })
      : await db.donation.findUnique({ where: { id }, select: { sumupCheckoutId: true } });
  if (!row) return { ok: false, message: "Not found." };
  if (!row.sumupCheckoutId) return { ok: false, message: "No SumUp payment was started for this record." };

  try {
    const checkout = await getCheckout(row.sumupCheckoutId);
    await settleCheckout(row.sumupCheckoutId);
    if (checkout.status === "PAID") {
      const after =
        kind === "booking"
          ? (await db.booking.findUnique({ where: { id }, select: { status: true } }))?.status
          : (await db.donation.findUnique({ where: { id }, select: { status: true } }))?.status;
      if (after === "CONFIRMED" || after === "PAID") return { ok: true, message: "Paid – confirmed, email sent." };
      return { ok: false, message: `SumUp says paid but the record is ${after ?? "missing"} (see server logs).` };
    }
    return { ok: false, message: `SumUp says: ${checkout.status.toLowerCase()} – no payment received.` };
  } catch (err) {
    console.error("[sumup] admin payment check failed", err instanceof Error ? err.message : err);
    return { ok: false, message: err instanceof Error ? err.message : "Could not check with SumUp." };
  }
}

export async function adminDeleteDonation(id: string) {
  const donation = await db.donation.findUnique({ where: { id } });
  if (!donation) return;
  await db.donation.delete({ where: { id } });
  if (donation.sumupCheckoutId && donation.paidAt === null) await deactivateCheckout(donation.sumupCheckoutId);
}
