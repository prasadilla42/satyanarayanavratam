import { db } from "@/lib/db";

// Access is protected by src/proxy.ts (HTTP Basic Auth)

/** Escapes a CSV cell and neutralises spreadsheet formula injection. */
function cell(value: unknown): string {
  let s = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function csv(rows: unknown[][]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export async function GET(req: Request) {
  const type = new URL(req.url).searchParams.get("type");

  if (type === "donations") {
    const donations = await db.donation.findMany({ orderBy: { createdAt: "desc" } });
    const body = csv([
      ["Reference", "Status", "Name", "Email", "Amount (GBP)", "Message", "Paid at", "Created at"],
      ...donations.map((d) => [
        d.reference, d.status, d.name, d.email, (d.amountPence / 100).toFixed(2), d.message, d.paidAt, d.createdAt,
      ]),
    ]);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="donations.csv"',
      },
    });
  }

  const bookings = await db.booking.findMany({ orderBy: { createdAt: "desc" } });
  const body = csv([
    [
      "Reference", "Status", "Name", "Email", "Phone", "Gothram", "Notes",
      "Yajamani qty", "General qty", "Amount (GBP)", "Paid at", "Email sent", "Created at",
    ],
    ...bookings.map((b) => [
      b.reference, b.status, b.name, b.email, b.phone, b.gothram, b.notes,
      b.yajamaniQty, b.generalQty, (b.amountPence / 100).toFixed(2), b.paidAt, b.emailSentAt, b.createdAt,
    ]),
  ]);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bookings.csv"',
    },
  });
}
