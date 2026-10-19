import { after } from "next/server";
import {
  createBooking,
  resumeCheckoutUrl,
  sendBookingEmail,
  startBookingCheckout,
} from "@/lib/bookings";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { bookingSchema, fieldErrors } from "@/lib/validation";

// Lets the background payment check (watchCheckout) keep running after the response is sent.
export const maxDuration = 300;

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  if (!rateLimit(`book:${clientIp(req)}`, 8, 10 * 60_000)) {
    return json(
      { ok: false, code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes and try again." },
      429,
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, code: "BAD_REQUEST", message: "Invalid request" }, 400);
  }

  // Honeypot: bots fill hidden fields. Pretend it worked.
  if (typeof raw === "object" && raw && "website" in raw && (raw as { website?: unknown }).website) {
    return json({ ok: true, type: "free", url: "/" });
  }

  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, code: "VALIDATION", errors: fieldErrors(parsed.error) }, 400);
  }

  try {
    const result = await createBooking(parsed.data);

    if (!result.ok) {
      if (result.code === "SOLD_OUT") {
        const left = result.availability[result.field === "yajamaniQty" ? "yajamani" : "general"].remaining;
        const label = result.field === "yajamaniQty" ? "Yajamani" : "General";
        return json(
          {
            ok: false,
            code: "SOLD_OUT",
            field: result.field,
            availability: result.availability,
            message:
              left > 0
                ? `Only ${left} ${label} ticket${left === 1 ? " is" : "s are"} left. Please reduce the quantity.`
                : `Sorry, ${label} tickets are fully booked.`,
          },
          409,
        );
      }

      // Duplicate. If it's the same person's unpaid checkout, let them pick up where they left off.
      if (result.resumable) {
        const url = await resumeCheckoutUrl(result.resumable);
        if (url) return json({ ok: true, type: "paid", url, resumed: true });
      }
      return json(
        {
          ok: false,
          code: "DUPLICATE",
          message:
            "A booking already exists for this email address or phone number. Please check your inbox for the confirmation email, or contact the organisers if you need to change your booking.",
        },
        409,
      );
    }

    const { booking, requiresPayment } = result;

    if (requiresPayment) {
      const url = await startBookingCheckout(booking);
      return json({ ok: true, type: "paid", url });
    }

    // Free registration: confirmed immediately, email goes out after the response.
    after(() => sendBookingEmail(booking.id));
    return json({
      ok: true,
      type: "free",
      url: `/confirmation?ref=${encodeURIComponent(booking.reference)}&token=${encodeURIComponent(booking.accessToken)}`,
    });
  } catch (err) {
    console.error("[api/bookings] failed", err);
    return json(
      { ok: false, code: "SERVER_ERROR", message: "Something went wrong while creating your booking. Please try again." },
      500,
    );
  }
}
