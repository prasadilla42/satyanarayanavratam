import { settleCheckout } from "@/lib/bookings";

/**
 * SumUp checkout-status callback (the `return_url` we send when creating each checkout).
 *
 * SumUp's callback is not signed, so the body is treated only as a hint: we take the checkout
 * id from it and ask SumUp's API what really happened (see settleCheckout). Spoofed calls
 * therefore cannot confirm anything, and ids we never created are ignored.
 *
 * Reply with an empty 2xx quickly; anything else makes SumUp retry (1 min, 5 min, 20 min, 2 h).
 */
export async function POST(req: Request) {
  let body: { event_type?: string; id?: string } | null = null;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const id = typeof body?.id === "string" ? body.id : "";
  // Unknown events are ignored on purpose; new event types may be added by SumUp at any time.
  if (body?.event_type !== "CHECKOUT_STATUS_CHANGED" || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    return new Response(null, { status: 204 });
  }

  try {
    await settleCheckout(id);
  } catch (err) {
    console.error(`[sumup-callback] could not verify checkout ${id}`, err);
    return new Response(null, { status: 500 }); // SumUp will retry
  }
  return new Response(null, { status: 204 });
}
