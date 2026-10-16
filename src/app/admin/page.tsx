import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { getAvailability } from "@/lib/bookings";
import { formatGBP } from "@/lib/config";
import { resendBookingEmailAction, resendDonationEmailAction } from "./actions";

export const metadata: Metadata = {
  title: "Admin – Satyanarayana Vratam 2026",
  robots: { index: false, follow: false },
};

const dt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

const statusStyle: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-800",
  PAID: "bg-green-100 text-green-800",
  PENDING: "bg-amber-100 text-amber-800",
  EXPIRED: "bg-stone-200 text-stone-600",
  CANCELLED: "bg-stone-200 text-stone-600",
  NEEDS_REFUND: "bg-red-100 text-red-800",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle[status] ?? ""}`}>
      {status}
    </span>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-600">Loading dashboard…</p>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await connection(); // always rendered at request time with live data
  const [availability, bookings, donations, paidAgg, donationAgg] = await Promise.all([
    getAvailability(),
    db.booking.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    db.donation.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    db.booking.aggregate({ where: { status: "CONFIRMED" }, _sum: { amountPence: true } }),
    db.donation.aggregate({ where: { status: "PAID" }, _sum: { amountPence: true }, _count: true }),
  ]);
  const needsRefund = bookings.filter((b) => b.status === "NEEDS_REFUND");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-stone-800">
      <h1 className="font-display text-3xl font-bold text-maroon">Admin – Satyanarayana Vratam 2026</h1>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Yajamani tickets" value={`${availability.yajamani.taken} / ${availability.yajamani.capacity}`} sub={`${availability.yajamani.remaining} left`} />
        <Stat label="General tickets" value={`${availability.general.taken} / ${availability.general.capacity}`} sub={`${availability.general.remaining} left`} />
        <Stat label="Ticket revenue" value={formatGBP(paidAgg._sum.amountPence ?? 0)} sub="confirmed bookings" />
        <Stat label="Donations" value={formatGBP(donationAgg._sum.amountPence ?? 0)} sub={`${donationAgg._count} paid`} />
      </section>
      <p className="mt-2 text-xs text-stone-500">
        Seat counts include unpaid bookings that are still holding seats during checkout.
      </p>

      {needsRefund.length > 0 && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <strong>Action needed:</strong> {needsRefund.length} booking(s) were paid after the seats were released
          and the event was full. Please refund them in your SumUp dashboard:{" "}
          {needsRefund.map((b) => b.reference).join(", ")}
        </div>
      )}

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-bold text-maroon">Bookings ({bookings.length})</h2>
          <a className="rounded-full bg-maroon px-4 py-1.5 text-sm font-semibold text-white" href="/api/admin/export?type=bookings">
            Download CSV
          </a>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-cream-dark text-xs uppercase tracking-wide text-stone-600">
              <tr>
                <th className="p-3">Reference</th><th className="p-3">Status</th><th className="p-3">Name</th>
                <th className="p-3">Contact</th><th className="p-3">Yajamani</th><th className="p-3">General</th>
                <th className="p-3">Paid</th><th className="p-3">Created</th><th className="p-3">Email</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-stone-100 align-top">
                  <td className="p-3 font-mono text-xs">{b.reference}</td>
                  <td className="p-3"><Badge status={b.status} /></td>
                  <td className="p-3">
                    {b.name}
                    {b.gothram && <div className="text-xs text-stone-500">Gothram: {b.gothram}</div>}
                    {b.notes && <div className="text-xs text-stone-500">{b.notes}</div>}
                  </td>
                  <td className="p-3">{b.email}<div className="text-xs text-stone-500">{b.phone}</div></td>
                  <td className="p-3">{b.yajamaniQty}</td>
                  <td className="p-3">{b.generalQty}</td>
                  <td className="p-3">{b.amountPence ? formatGBP(b.amountPence) : "Free"}</td>
                  <td className="p-3 whitespace-nowrap">{dt.format(b.createdAt)}</td>
                  <td className="p-3">
                    {b.status === "CONFIRMED" ? (
                      <form action={resendBookingEmailAction}>
                        <input type="hidden" name="id" value={b.id} />
                        <span className="mr-2 text-xs">{b.emailSentAt ? "Sent" : "Not sent"}</span>
                        <button className="rounded border border-maroon px-2 py-0.5 text-xs text-maroon hover:bg-maroon hover:text-white">
                          {b.emailSentAt ? "Resend" : "Send"}
                        </button>
                      </form>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-stone-500">No bookings yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 mb-16">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-bold text-maroon">Donations ({donations.length})</h2>
          <a className="rounded-full bg-maroon px-4 py-1.5 text-sm font-semibold text-white" href="/api/admin/export?type=donations">
            Download CSV
          </a>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-cream-dark text-xs uppercase tracking-wide text-stone-600">
              <tr>
                <th className="p-3">Reference</th><th className="p-3">Status</th><th className="p-3">Name</th>
                <th className="p-3">Email</th><th className="p-3">Amount</th><th className="p-3">Created</th>
                <th className="p-3">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {donations.map((d) => (
                <tr key={d.id} className="border-t border-stone-100 align-top">
                  <td className="p-3 font-mono text-xs">{d.reference}</td>
                  <td className="p-3"><Badge status={d.status} /></td>
                  <td className="p-3">{d.name}{d.message && <div className="text-xs text-stone-500">{d.message}</div>}</td>
                  <td className="p-3">{d.email}</td>
                  <td className="p-3">{formatGBP(d.amountPence)}</td>
                  <td className="p-3 whitespace-nowrap">{dt.format(d.createdAt)}</td>
                  <td className="p-3">
                    {d.status === "PAID" ? (
                      <form action={resendDonationEmailAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <span className="mr-2 text-xs">{d.emailSentAt ? "Sent" : "Not sent"}</span>
                        <button className="rounded border border-maroon px-2 py-0.5 text-xs text-maroon hover:bg-maroon hover:text-white">
                          {d.emailSentAt ? "Resend" : "Send"}
                        </button>
                      </form>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              ))}
              {donations.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-stone-500">No donations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-gold/40 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold text-maroon">{value}</div>
      <div className="text-xs text-stone-500">{sub}</div>
    </div>
  );
}
