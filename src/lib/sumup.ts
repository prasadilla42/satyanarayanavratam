/**
 * Minimal SumUp Checkouts API client (no SDK needed).
 *
 * Docs:
 *  - Hosted Checkout   https://developer.sumup.com/online-payments/checkouts/hosted-checkout/
 *  - Checkouts API     https://developer.sumup.com/api/checkouts
 *  - Webhooks          https://developer.sumup.com/online-payments/webhooks
 *  - API keys          https://developer.sumup.com/tools/authorization/api-keys/
 */

const DEFAULT_API_BASE = "https://api.sumup.com";

/** Strips quotes / whitespace / a pasted "NAME=" prefix, which are common copy-paste mistakes. */
function clean(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

export function sumupApiKey(): string {
  const key = clean(process.env.SUMUP_API_KEY);
  if (!key) throw new Error("SUMUP_API_KEY is not set");
  if (key.startsWith("sup_pk_")) {
    throw new Error(
      "SUMUP_API_KEY is the PUBLIC key (sup_pk_…). Create a secret API key in SumUp: Settings → For Developers → Toolkit → API Keys → Create.",
    );
  }
  if (!key.startsWith("sup_sk_")) {
    throw new Error("SUMUP_API_KEY does not look like a SumUp secret API key (expected it to start with sup_sk_).");
  }
  return key;
}

export function sumupMerchantCode(): string {
  const code = clean(process.env.SUMUP_MERCHANT_CODE).toUpperCase();
  if (!code) throw new Error("SUMUP_MERCHANT_CODE is not set");
  if (!/^[A-Z0-9]{4,20}$/.test(code)) {
    throw new Error("SUMUP_MERCHANT_CODE looks wrong. It is a short code such as MCXXXXXX shown in your SumUp dashboard.");
  }
  return code;
}

function apiBase(): string {
  // SUMUP_API_BASE exists only so the local test script can point at a fake SumUp server.
  return (clean(process.env.SUMUP_API_BASE) || DEFAULT_API_BASE).replace(/\/+$/, "");
}

/* ------------------------------------------------------------------ */
/* Types (only the fields we use)                                      */
/* ------------------------------------------------------------------ */

export type SumUpCheckoutStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED";

export interface SumUpTransaction {
  id?: string;
  transaction_code?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

export interface SumUpCheckout {
  id: string;
  checkout_reference: string;
  /** Major units, e.g. 51 or 10.1 */
  amount: number;
  currency: string;
  merchant_code: string;
  status: SumUpCheckoutStatus;
  valid_until?: string | null;
  hosted_checkout_url?: string;
  transactions?: SumUpTransaction[];
}

export class SumUpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "SumUpError";
  }
}

async function request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${sumupApiKey()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(`Could not reach SumUp: ${err instanceof Error ? err.message : String(err)}`);
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const detail =
      parsed && typeof parsed === "object"
        ? ((parsed as { message?: string; detail?: string; error_message?: string }).message ??
          (parsed as { detail?: string }).detail ??
          (parsed as { error_message?: string }).error_message)
        : undefined;
    throw new SumUpError(
      `SumUp ${method} ${path.split("?")[0]} failed (${res.status})${detail ? `: ${detail}` : ""}`,
      res.status,
      parsed,
    );
  }
  return parsed as T;
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

export interface CreateCheckoutInput {
  /** Our own unique reference (max 64 chars), e.g. SSV26-7K3QX9 */
  reference: string;
  amountPence: number;
  /** ISO 4217, e.g. "GBP" */
  currency: string;
  description: string;
  /** Where the SumUp success page's "back to website" button sends the customer */
  redirectUrl: string;
  /** Public https URL SumUp calls when the checkout status changes (omit on localhost) */
  callbackUrl?: string;
  validUntil: Date;
}

/** Creates a Hosted Checkout and returns it, including `hosted_checkout_url`. */
export async function createHostedCheckout(input: CreateCheckoutInput): Promise<SumUpCheckout> {
  const checkout = await request<SumUpCheckout>("POST", "/v0.1/checkouts", {
    checkout_reference: input.reference,
    // SumUp amounts are in major units (pounds), not pence
    amount: Number((input.amountPence / 100).toFixed(2)),
    currency: input.currency.toUpperCase(),
    merchant_code: sumupMerchantCode(),
    description: input.description,
    redirect_url: input.redirectUrl,
    ...(input.callbackUrl ? { return_url: input.callbackUrl } : {}),
    valid_until: input.validUntil.toISOString(),
    hosted_checkout: { enabled: true },
  });
  if (!checkout.id || !checkout.hosted_checkout_url) {
    throw new Error("SumUp did not return a hosted checkout URL. Is Hosted Checkout available on your account?");
  }
  return checkout;
}

export function getCheckout(id: string): Promise<SumUpCheckout> {
  return request<SumUpCheckout>("GET", `/v0.1/checkouts/${encodeURIComponent(id)}`);
}

/** Stops an unpaid checkout from being used (best effort). */
export async function deactivateCheckout(id: string): Promise<void> {
  try {
    await request("DELETE", `/v0.1/checkouts/${encodeURIComponent(id)}`);
  } catch (err) {
    console.error("[sumup] could not deactivate checkout", id, err instanceof Error ? err.message : err);
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const checkoutAmountPence = (c: SumUpCheckout) => Math.round(Number(c.amount) * 100);

/** The SumUp transaction code of the successful payment, if present. */
export function checkoutTransactionId(c: SumUpCheckout): string | null {
  const tx = c.transactions?.find((t) => t.status === "SUCCESSFUL") ?? c.transactions?.[0];
  return tx?.transaction_code ?? tx?.id ?? null;
}
