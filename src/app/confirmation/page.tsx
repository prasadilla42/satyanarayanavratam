import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Booking, Donation } from "@prisma/client";
import { AutoRefresh } from "@/components/AutoRefresh";
import { confirmPaidBooking, confirmPaidDonation } from "@/lib/bookings";
import { EVENT, TICKETS, formatGBP } from "@/lib/config";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export const metadata: Metadata = {
  title: `Confirmation | ${EVENT.name}`,
  robots: { index: false, follow: false },
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The webhook is the primary way payments are confirmed. If the visitor lands
 * here before it has arrived, ask Stripe directly so they see the right state.
 */
async function verifyWithStripe(sessionId: string | null, kind: "booking" | "donation") {
  if (!sessionId) return;
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (kind === "booking") await confirmPaidBooking(session);
    else await confirmPaidDonation(session);
  } catch (err) {
    console.error("[confirmation] could not verify with Stripe", err);
  }
}

export default function ConfirmationPage({ searchParams }: PageProps<"/confirmation">) {
  return (
    <main className="pattern-cream flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <Suspense
          fallback={
            <Card>
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gold/30 border-t-saffron" aria-hidden />
              <p className="mt-4 text-ink/75">Loading your booking…</p>
            </Card>
          }
        >
          <ConfirmationContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function ConfirmationContent({
  searchParams,
}: {
  searchParams: PageProps<"/confirmation">["searchParams"];
}) {
  const params = await searchParams;
  const ref = first(params.ref).trim().toUpperCase();
  const token = first(params.token).trim();

  let booking: Booking | null = null;
  let donation: Donation | null = null;

  if (ref && token) {
    if (ref.startsWith("DON")) {
      donation = await db.donation.findFirst({ where: { reference: ref, accessToken: token } });
      if (donation && donation.status === "PENDING") {
        await verifyWithStripe(donation.stripeSessionId, "donation");
        donation = await db.donation.findUnique({ where: { id: donation.id } });
      }
    } else {
      booking = await db.booking.findFirst({ where: { reference: ref, accessToken: token } });
      if (booking && booking.status === "PENDING") {
        await verifyWithStripe(booking.stripeSessionId, "booking");
        booking = await db.booking.findUnique({ where: { id: booking.id } });
      }
    }
  }

  if (booking) return <BookingView booking={booking} />;
  if (donation) return <DonationView donation={donation} />;
  return (
    <Card>
      <h1 className="font-display text-2xl font-bold text-maroon">Booking not found</h1>
      <p className="mt-2 text-ink/75">
        We couldn&apos;t find that booking. Please use the link from your confirmation email, or contact the
        organisers.
      </p>
      <HomeLink />
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border-2 border-gold bg-white p-6 text-center shadow-xl sm:p-9">{children}</div>
  );
}

function HomeLink() {
  return (
    <Link href="/" className="mt-6 inline-block rounded-full bg-maroon px-6 py-2.5 font-bold text-white hover:bg-maroon-dark">
      Back to the event page
    </Link>
  );
}

function Tick() {
  return (
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700">
      <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m5 12 5 5 9-10" />
      </svg>
    </div>
  );
}

function Reference({ label, value }: { label: string; value: string }) {
  return (
    <div className="mx-auto mt-5 max-w-xs rounded-xl border-2 border-dashed border-gold bg-cream p-3">
      <div className="text-xs font-bold uppercase tracking-widest text-ink/60">{label}</div>
      <div className="font-mono text-2xl font-bold tracking-wider text-maroon">{value}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 py-2.5 text-left">
      <dt className="text-sm text-ink/60">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

function BookingView({ booking: b }: { booking: Booking }) {
  if (b.status === "PENDING") {
    return (
      <Card>
        <AutoRefresh />
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gold/30 border-t-saffron" aria-hidden />
        <h1 className="mt-5 font-display text-2xl font-bold text-maroon">Confirming your payment…</h1>
        <p className="mt-2 text-ink/75">
          This only takes a moment. Please don&apos;t close this page. If you completed payment, your booking
          will be confirmed shortly.
        </p>
        <p className="mt-4 text-sm text-ink/60">Reference: {b.reference}</p>
      </Card>
    );
  }

  if (b.status === "EXPIRED" || b.status === "CANCELLED") {
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold text-maroon">This booking wasn&apos;t completed</h1>
        <p className="mt-2 text-ink/75">
          Payment was not completed, so no seats were reserved and you haven&apos;t been charged. You&apos;re welcome
          to register again.
        </p>
        <HomeLink />
      </Card>
    );
  }

  if (b.status === "NEEDS_REFUND") {
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold text-maroon">We need to sort out your booking</h1>
        <p className="mt-2 text-ink/75">
          Your payment arrived after your seats were released and the event is now full. The organisers will
          refund you in full. Please quote reference <strong>{b.reference}</strong> if you get in touch.
        </p>
        <HomeLink />
      </Card>
    );
  }

  const paid = b.amountPence > 0;
  return (
    <Card>
      <Tick />
      <h1 className="mt-4 font-display text-3xl font-bold text-maroon">
        {paid ? "Payment received – booking confirmed" : "You're registered!"}
      </h1>
      <p className="mt-2 text-ink/75">
        Namaste {b.name}, thank you for registering for {EVENT.name}.
      </p>
      <Reference label="Booking reference" value={b.reference} />

      <dl className="mt-6 divide-y divide-gold/30 border-y border-gold/30">
        {b.yajamaniQty > 0 && <Row label={TICKETS.yajamani.name}>{b.yajamaniQty} × {formatGBP(TICKETS.yajamani.pricePence)}</Row>}
        {b.generalQty > 0 && <Row label={TICKETS.general.name}>{b.generalQty} × Free</Row>}
        <Row label={paid ? "Amount paid" : "Amount"}>{paid ? formatGBP(b.amountPence) : "£0"}</Row>
        <Row label="Date">{EVENT.dateLong}</Row>
        <Row label="Venue">
          {EVENT.venueName}
          <br />
          <span className="font-normal text-ink/75">{EVENT.address}</span>
        </Row>
        <Row label="Timings">
          {EVENT.timings.length ? (
            EVENT.timings.map((t) => (
              <span key={t.time} className="block">{t.time} · {t.label}</span>
            ))
          ) : (
            <span className="font-normal text-ink/75">To be confirmed</span>
          )}
        </Row>
      </dl>

      <p className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-green-900">
        {b.emailSentAt
          ? <>A confirmation email has been sent to <strong>{b.email}</strong>.</>
          : <>A confirmation email is on its way to <strong>{b.email}</strong>. Please also check your spam folder.</>}
      </p>

      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <a href={EVENT.mapsDirectionsUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-saffron px-6 py-2.5 font-bold text-white hover:bg-saffron-dark">
          Get directions
        </a>
        <Link href="/" className="rounded-full border-2 border-maroon px-6 py-2.5 font-bold text-maroon hover:bg-maroon hover:text-white">
          Back to event page
        </Link>
      </div>
    </Card>
  );
}

function DonationView({ donation: d }: { donation: Donation }) {
  if (d.status === "PENDING") {
    return (
      <Card>
        <AutoRefresh />
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gold/30 border-t-saffron" aria-hidden />
        <h1 className="mt-5 font-display text-2xl font-bold text-maroon">Confirming your donation…</h1>
        <p className="mt-2 text-ink/75">This only takes a moment. Please don&apos;t close this page.</p>
      </Card>
    );
  }
  if (d.status === "EXPIRED") {
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold text-maroon">Donation not completed</h1>
        <p className="mt-2 text-ink/75">Payment was not completed and you haven&apos;t been charged.</p>
        <HomeLink />
      </Card>
    );
  }
  return (
    <Card>
      <Tick />
      <h1 className="mt-4 font-display text-3xl font-bold text-maroon">Thank you for your donation</h1>
      <p className="mt-2 text-ink/75">
        Namaste {d.name}, your generous gift of <strong>{formatGBP(d.amountPence)}</strong> towards {EVENT.name} has
        been received. May Sri Satyanarayana Swamy bless you and your family.
      </p>
      <Reference label="Donation reference" value={d.reference} />
      <p className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-green-900">
        {d.emailSentAt ? <>A receipt has been sent to <strong>{d.email}</strong>.</> : <>A receipt is on its way to <strong>{d.email}</strong>.</>}
      </p>
      <HomeLink />
    </Card>
  );
}
