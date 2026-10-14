import { createDonationCheckout } from "@/lib/bookings";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { donationSchema, fieldErrors } from "@/lib/validation";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  if (!rateLimit(`donate:${clientIp(req)}`, 10, 10 * 60_000)) {
    return json({ ok: false, code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes and try again." }, 429);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, code: "BAD_REQUEST", message: "Invalid request" }, 400);
  }

  if (typeof raw === "object" && raw && "website" in raw && (raw as { website?: unknown }).website) {
    return json({ ok: false, code: "BAD_REQUEST", message: "Invalid request" }, 400);
  }

  const parsed = donationSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, code: "VALIDATION", errors: fieldErrors(parsed.error) }, 400);
  }

  try {
    const url = await createDonationCheckout(parsed.data);
    return json({ ok: true, url });
  } catch (err) {
    console.error("[api/donations] failed", err);
    return json({ ok: false, code: "SERVER_ERROR", message: "We couldn't start the payment. Please try again." }, 500);
  }
}
