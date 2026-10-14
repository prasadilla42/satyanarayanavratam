import type Stripe from "stripe";
import {
  confirmPaidBooking,
  confirmPaidDonation,
  expireBookingSession,
} from "@/lib/bookings";
import { stripe, stripeWebhookSecret } from "@/lib/stripe";

/**
 * Stripe webhook – the source of truth for payments.
 * Subscribe this endpoint to:
 *   checkout.session.completed
 *   checkout.session.async_payment_succeeded
 *   checkout.session.expired
 */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // The raw body is required for signature verification
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, stripeWebhookSecret());
  } catch (err) {
    console.error("[webhook] signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.kind === "donation") await confirmPaidDonation(session);
        else await confirmPaidBooking(session);
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await expireBookingSession(session.id);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`[webhook] handler failed for ${event.type}`, err);
    // 500 makes Stripe retry later
    return new Response("Handler error", { status: 500 });
  }

  return Response.json({ received: true });
}
