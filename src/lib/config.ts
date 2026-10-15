/**
 * Central event configuration. Edit values here (or via env vars) – nothing
 * else in the codebase hard-codes event details.
 */

export const EVENT = {
  name: "Rugby Samuhika Satyanarayana Vratam 2026",
  shortName: "Satyanarayana Vratam",
  /** ISO date, used for structured data */
  isoDate: "2026-11-15",
  dateLong: "Sunday, 15 November 2026",
  venueName: "Rugby Indian Association",
  address: "Edward St, Rugby CV21 2EZ",
  mapsDirectionsUrl:
    "https://www.google.com/maps/dir/?api=1&destination=Rugby+Indian+Association%2C+Edward+St%2C+Rugby+CV21+2EZ",
  mapsEmbedUrl:
    "https://www.google.com/maps?q=Rugby+Indian+Association,+Edward+St,+Rugby+CV21+2EZ&output=embed",
  /**
   * Confirmed timings. Leave empty until confirmed – the site then shows
   * "To be confirmed". Example:
   *   [{ time: "9:00 AM", label: "Registration" }, { time: "10:00 AM", label: "Vratam begins" }]
   */
  timings: [{ time: "9:30 AM – 3:00 PM", label: "Satyanarayana Vratam" }] as {
    time: string;
    label: string;
  }[],
  /**
   * Organiser contact details (public). Set via env vars once supplied.
   */
  contact: {
    name: process.env.NEXT_PUBLIC_ORGANISER_NAME || "",
    email: process.env.NEXT_PUBLIC_ORGANISER_EMAIL || "",
    phone: process.env.NEXT_PUBLIC_ORGANISER_PHONE || "",
  },
} as const;

// Prices and capacities are constants (not env vars) because the browser
// and the server must always agree on them.
export const TICKETS = {
  yajamani: {
    key: "yajamani" as const,
    name: "Yajamani Ticket",
    description: "Take part in the Vratam as a Yajamani. Limited to 50 tickets.",
    pricePence: 5100, // £51
    capacity: 50,
  },
  general: {
    key: "general" as const,
    name: "General Registration",
    description: "Free attendance ticket for the Vratam.",
    pricePence: 0,
    capacity: 300,
  },
};

/** Sanity cap on how many tickets of one type can go in a single booking. */
export const MAX_PER_BOOKING = 20;

/** Quick-pick donation amounts, in pounds. */
export const DONATION_PRESETS_GBP = [5, 11, 21, 51, 101];
export const DONATION_MIN_PENCE = 100; // £1
export const DONATION_MAX_PENCE = 1_000_000; // £10,000

/** How long seats are held while a visitor is on the Stripe payment page. */
export const CHECKOUT_HOLD_MINUTES = 31; // Stripe's minimum session life is 30 min
/** Extra grace before a held booking stops counting against capacity. */
export const HOLD_GRACE_MINUTES = 5;

export const CURRENCY = "gbp" as const;

export const BOOKING_REF_PREFIX = "SSV26";
export const DONATION_REF_PREFIX = "DON26";

export function formatGBP(pence: number): string {
  const pounds = pence / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: Number.isInteger(pounds) ? 0 : 2,
  }).format(pounds);
}

export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}
