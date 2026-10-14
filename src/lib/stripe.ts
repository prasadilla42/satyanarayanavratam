import Stripe from "stripe";

/** Tidies a pasted env value: trims spaces and removes surrounding quotes / a "NAME=" prefix. */
function clean(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    const key = clean(process.env.STRIPE_SECRET_KEY);
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    if (key.startsWith("pk_")) {
      throw new Error(
        "STRIPE_SECRET_KEY is a PUBLISHABLE key (pk_…). Use the SECRET key (sk_test_… / sk_live_…) from Stripe → Developers → API keys.",
      );
    }
    if (!/^(sk|rk)_(test|live)_/.test(key)) {
      throw new Error("STRIPE_SECRET_KEY does not look like a Stripe secret key (expected sk_test_… or sk_live_…).");
    }
    client = new Stripe(key);
  }
  return client;
}

export function stripeWebhookSecret(): string {
  const secret = clean(process.env.STRIPE_WEBHOOK_SECRET);
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!secret.startsWith("whsec_")) {
    throw new Error("STRIPE_WEBHOOK_SECRET should start with whsec_ (Stripe → Developers → Webhooks → your endpoint → Signing secret).");
  }
  return secret;
}
