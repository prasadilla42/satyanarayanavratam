import { Prisma, type Booking, type Donation } from "@prisma/client";
import type Stripe from "stripe";
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
import { stripe } from "./stripe";
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

function toAvailability(held: { yajamani: number; general: number }): Availability {
  const slot = (capacity: number, taken: number): Slot => ({
    capacity,
    taken,
    remaining: Math.max(0, capacity - taken),
  });
  return {
    yajamani: slot(TICKETS.yajamani.capacity, held.yajamani),
    general: slot(TICKETS.general.capacity, held.general),
  };
}

export async function getAvailability(): Promise<Availability> {
  return toAvailability(await countHeld(db));
}

/* ------------------------------------------------------------------ */
/* Create booking (reserves seats, rejects duplicates)                 */
/* ------------------------------------------------------------------ */

export type CreateBookingResult =
  | { ok: true; booking: Booking; requiresPayment: boolean }
  | {
      ok: false;
      code: "DUPLICATE";
      /** An unpaid booking by the same person that can be resumed on Stripe */
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
      if (input.yajamaniQty > 0 && held.yajamani + input.yajamaniQty > TICKETS.yajamani.capacity) {
        return {
          ok: false,
          code: "SOLD_OUT",
          field: "yajamaniQty",
          availability: toAvailability(held),
        };
      }
      if (input.generalQty > 0 && held.general + input.generalQty > TICKETS.general.capacity) {
        return {
          ok: false,
          code: "SOLD_OUT",
          field: "generalQty",
          availability: toAvailability(held),
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

/** Creates the Stripe Checkout session for a PENDING booking and stores its id. */
export async function startBookingCheckout(booking: Booking): Promise<string> {
  try {
    const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_HOLD_MINUTES * 60;
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: booking.email,
      client_reference_id: booking.reference,
      line_items: [
        {
          quantity: booking.yajamaniQty,
          price_data: {
            currency: CURRENCY,
            unit_amount: TICKETS.yajamani.pricePence,
            product_data: {
              name: `${TICKETS.yajamani.name} – ${EVENT.name}`,
              description: `${EVENT.dateLong}, ${EVENT.venueName}`,
            },
          },
        },
      ],
      metadata: { kind: "booking", bookingId: booking.id, reference: booking.reference },
      payment_intent_data: {
        description: `${EVENT.name} – booking ${booking.reference}`,
        metadata: { kind: "booking", bookingId: booking.id, reference: booking.reference },
      },
      expires_at: expiresAt,
      success_url: `${siteUrl()}/confirmation?ref=${encodeURIComponent(booking.reference)}&token=${encodeURIComponent(booking.accessToken)}`,
      cancel_url: `${siteUrl()}/?checkout=cancelled#tickets`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    await db.booking.update({
      where: { id: booking.id },
      data: { stripeSessionId: session.id },
    });
    return session.url;
  } catch (err) {
    // Release the seats straight away
    await db.booking
      .update({ where: { id: booking.id }, data: { status: "CANCELLED" } })
      .catch(() => {});
    throw err;
  }
}

/** If the visitor already has an unpaid checkout open, returns its Stripe URL. */
export async function resumeCheckoutUrl(booking: Booking): Promise<string | null> {
  if (!booking.stripeSessionId) return null;
  try {
    const session = await stripe().checkout.sessions.retrieve(booking.stripeSessionId);
    return session.status === "open" && session.url ? session.url : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Payment verification (webhook + confirmation page fallback)         */
/* ------------------------------------------------------------------ */

const paymentIntentId = (s: Stripe.Checkout.Session) =>
  typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null);

/**
 * Marks a booking as CONFIRMED once Stripe reports the Checkout Session as paid.
 * Safe to call many times (webhook retries, confirmation-page refreshes).
 */
export async function confirmPaidBooking(session: Stripe.Checkout.Session): Promise<Booking | null> {
  if (session.payment_status !== "paid") return null;

  const bookingId = session.metadata?.bookingId;
  const booking = await db.booking.findFirst({
    where: { OR: [{ stripeSessionId: session.id }, ...(bookingId ? [{ id: bookingId }] : [])] },
  });
  if (!booking) {
    console.error(`[stripe] Paid session ${session.id} has no matching booking`);
    return null;
  }

  if (session.amount_total !== booking.amountPence || session.currency !== CURRENCY) {
    console.error(
      `[stripe] Amount mismatch for ${booking.reference}: paid ${session.amount_total} ${session.currency}, expected ${booking.amountPence}`,
    );
    return booking;
  }

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
          const full =
            held.yajamani + current.yajamaniQty > TICKETS.yajamani.capacity ||
            held.general + current.generalQty > TICKETS.general.capacity;
          if (full) {
            return tx.booking.update({
              where: { id: current.id },
              data: {
                status: "NEEDS_REFUND",
                paidAt: new Date(),
                paymentIntentId: paymentIntentId(session),
              },
            });
          }
        }
        return tx.booking.update({
          where: { id: current.id },
          data: {
            status: "CONFIRMED",
            paidAt: new Date(),
            paymentIntentId: paymentIntentId(session),
            expiresAt: null,
          },
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    if (updated.status === "NEEDS_REFUND") {
      console.error(`[stripe] ${updated.reference} was paid after seats were released – refund required`);
      return updated;
    }
    await sendBookingEmail(updated.id);
    return updated;
  }

  await sendBookingEmail(booking.id);
  return booking;
}

export async function expireBookingSession(sessionId: string) {
  await db.booking.updateMany({
    where: { stripeSessionId: sessionId, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  await db.donation.updateMany({
    where: { stripeSessionId: sessionId, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
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
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: donation.email,
      client_reference_id: donation.reference,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: donation.amountPence,
            product_data: {
              name: `Donation – ${EVENT.name}`,
              description: `${EVENT.venueName}, ${EVENT.dateLong}`,
            },
          },
        },
      ],
      metadata: { kind: "donation", donationId: donation.id, reference: donation.reference },
      payment_intent_data: {
        description: `${EVENT.name} – donation ${donation.reference}`,
        metadata: { kind: "donation", donationId: donation.id, reference: donation.reference },
      },
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_HOLD_MINUTES * 60,
      success_url: `${siteUrl()}/confirmation?ref=${encodeURIComponent(donation.reference)}&token=${encodeURIComponent(donation.accessToken)}`,
      cancel_url: `${siteUrl()}/?checkout=cancelled#donate`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    await db.donation.update({ where: { id: donation.id }, data: { stripeSessionId: session.id } });
    return session.url;
  } catch (err) {
    await db.donation.update({ where: { id: donation.id }, data: { status: "EXPIRED" } }).catch(() => {});
    throw err;
  }
}

export async function confirmPaidDonation(session: Stripe.Checkout.Session): Promise<Donation | null> {
  if (session.payment_status !== "paid") return null;
  const donationId = session.metadata?.donationId;
  const donation = await db.donation.findFirst({
    where: { OR: [{ stripeSessionId: session.id }, ...(donationId ? [{ id: donationId }] : [])] },
  });
  if (!donation) {
    console.error(`[stripe] Paid session ${session.id} has no matching donation`);
    return null;
  }
  if (session.amount_total !== donation.amountPence || session.currency !== CURRENCY) {
    console.error(`[stripe] Amount mismatch for ${donation.reference}`);
    return donation;
  }
  let current = donation;
  if (donation.status !== "PAID") {
    current = await db.donation.update({
      where: { id: donation.id },
      data: { status: "PAID", paidAt: new Date(), paymentIntentId: paymentIntentId(session) },
    });
  }
  await sendDonationEmail(current.id);
  return current;
}