# Samuhika Satyanarayana Vratam 2026

Single-page event site: event info, ticket booking, donations and venue details on one page.
SumUp Hosted Checkout opens only when payment is needed; free registrations are confirmed instantly.

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · SumUp Hosted Checkout · PostgreSQL + Prisma · Brevo email · Vercel

## How it works

| Item | Rule |
| --- | --- |
| Yajamani ticket | £51 each, any quantity per booking (max 20), **50 in total** |
| General ticket | Free, any quantity per booking (max 20), **300 in total** |
| Duplicates | One active booking per email address **or** phone number (see below) |
| Paid booking | Seats are held for ~35 min → SumUp payment page → SumUp calls us, we verify the payment with SumUp → confirmed + email |
| Free booking | Confirmed immediately → confirmation screen + email |
| Donations | £5 / £11 / £21 / £51 / £101 or custom amount → SumUp payment page → receipt email |
| Admin | `/admin` (HTTP Basic Auth): bookings, donations, seat counts, CSV export, resend email |

**Limits can't be oversold.** Every seat change runs under a Postgres advisory lock, so two people
clicking at the same moment can't take the last seat. Unpaid seats are held while the visitor is on the
SumUp page and released automatically if checkout is abandoned or expires.

**Duplicate protection.** A booking is rejected if its email *or* phone number matches an existing
confirmed (or currently-held) booking. Emails are normalised (case, `+tags`, and Gmail dots /
`googlemail.com`), and phones are normalised (`07700 900123` = `+44 7700 900123`). If the same person
starts a paid booking and comes back before paying, they're sent back to their open checkout instead of
being blocked. Cancelled / expired bookings free the email and phone for a new booking. Donations are
never restricted.

## Setup

### 1. Install

```bash
npm install
cp .env.example .env     # then fill in the values (see below)
```

### 2. Database (PostgreSQL)

Create a free database at [Neon](https://neon.tech) (or Supabase / Vercel Postgres / Prisma Postgres) and
put its connection string in `DATABASE_URL`. It must start with `postgres://` or `postgresql://`
(a `prisma+postgres://` URL such as `PRISMA_DATABASE_URL` will not work). Then create the tables:

```bash
npm run db:deploy
```

`DIRECT_URL` is optional (a non-pooled URL used only for migrations). `DATABASE_URL` is used if it isn't set.

### 3. SumUp (card payments)

Payments use [SumUp Hosted Checkout](https://developer.sumup.com/online-payments/checkouts/hosted-checkout/):
the site creates a checkout through SumUp's API and sends the visitor to SumUp's payment page
(cards, Apple Pay, Google Pay). SumUp then calls `https://YOUR-DOMAIN/api/webhooks/sumup`; that call is
not signed, so the site never trusts it – it asks SumUp's API whether the checkout really is `PAID`
and checks the reference, amount (£, GBP) and merchant before confirming anything.

There is **no webhook to set up in the SumUp dashboard**: the callback address is sent with every checkout.
You only need two values:

1. **`SUMUP_API_KEY`** – sign in at <https://me.sumup.com> → your profile → **Settings → For Developers →
   Toolkit → API Keys → Create**. Name it (e.g. "Vratam website") and copy the key straight away
   (it starts with `sup_sk_`; SumUp never shows it again). Do **not** use the "Public Key".
2. **`SUMUP_MERCHANT_CODE`** – the short code of the merchant account that receives the money
   (e.g. `MCXXXXXX`), shown next to your name / in the business drop-down at the top-left of the SumUp dashboard.

Use a **sandbox merchant account** first (<https://me.sumup.com/settings/developer?tab=sandboxes>): create
the API key and read the merchant code *while signed in to the sandbox account*. Sandbox test card:
`4200 0000 0000 0091`, any future expiry, any 3-digit CVV. (An amount of exactly £11 always fails in the
sandbox, by design.) Switch to the live account's key + code before going public.

Local testing without a SumUp account: `.env` points `SUMUP_API_BASE` at a fake SumUp server started by
`npm run test:paid`. Remove `SUMUP_API_BASE` when using real SumUp keys.
### 4. Confirmation emails (Brevo)

Emails are sent with the [Brevo](https://www.brevo.com) transactional email API (free plan: 300 emails/day,
plenty for 350 bookings). You need three values:

1. **`BREVO_API_KEY`** – Brevo → account menu → **Settings → SMTP & API → API Keys → Generate a new API key**.
   Copy it at once (it starts with `xkeysib-`; Brevo shows it only once). This is the *API key*, not the *SMTP key*.
2. **`EMAIL_FROM_ADDRESS`** – the address the emails come from. In Brevo go to **Settings → Senders, Domains,
   IPs → Senders → Add a sender**, then type in the 6-digit code Brevo emails to that address.
   * Best deliverability: first **authenticate your own domain** (Brevo gives you DNS records for DKIM / DMARC)
     and use an address on it, e.g. `bookings@rsnv.org`. Senders on an authenticated domain need no extra verification.
   * A `@gmail.com` / `@yahoo.com` sender can be verified, but those domains can't be authenticated, so
     mail is more likely to land in spam.
   * Never use the `…@smtp-brevo.com` SMTP login as the sender.
3. `EMAIL_FROM_NAME` (optional display name) and `ORGANISER_NOTIFY_EMAIL` (optional BCC of every email).

New Brevo accounts sometimes need transactional sending activated: if emails are rejected, contact Brevo support.
If Brevo isn't configured, emails are printed to the server log instead of being sent.
Each email is sent at most once; if sending fails, use **Resend** in the admin dashboard.
### 5. Run locally

```bash
npm run dev          # http://localhost:3000
```

### 6. Deploy to Vercel

1. Push the project to GitHub and import it in Vercel.
2. Add every variable from `.env.example` in **Project → Settings → Environment Variables**
   (set `NEXT_PUBLIC_SITE_URL` to your real domain).
3. Deploy. The `vercel-build` script applies database migrations automatically.
4. Use your **live** SumUp API key and merchant code when ready. `NEXT_PUBLIC_SITE_URL` must be your public https domain, because SumUp has to reach `/api/webhooks/sumup` and send customers back to `/confirmation`.

## Things you'll want to edit

* **Event details, prices, capacities:** `src/lib/config.ts`
  (`EVENT.timings` – add confirmed timings and they appear on the page and in emails).
* **Organiser contact:** set `NEXT_PUBLIC_ORGANISER_NAME / _EMAIL / _PHONE`.
* **Hero image:** `public/images/satyanarayana.jpg`.
* **Colours / fonts:** `src/app/globals.css`, `src/app/layout.tsx`.
* **Email wording:** `src/lib/email.ts`.

## Admin

Open `/admin` and sign in with `ADMIN_USER` / `ADMIN_PASSWORD`. If `ADMIN_PASSWORD` is empty the admin
area is disabled. Use a long random password. "Needs refund" bookings (very rare: paid after seats were
released and the event filled up) are highlighted at the top.

## Tests

With the dev server running against a **throw-away** database:

```bash
npm run test:smoke   # validation, free booking, duplicates, concurrency, capacity
npm run test:paid    # fake SumUp server: checkout, callback, tampering, resume, expiry, donations, 50-seat limit
npm run test:admin   # admin area locked down
```

(`test:paid` needs `SUMUP_API_KEY="sup_sk_dummy_local"`, `SUMUP_MERCHANT_CODE="MCLOCAL1"` and `SUMUP_API_BASE="http://127.0.0.1:4010"` in `.env`.)

## Project layout

```
prisma/schema.prisma          Booking + Donation models
src/app/page.tsx              The single public page
src/app/confirmation/         Confirmation screen (booking / donation reference)
src/app/admin/                Protected dashboard
src/app/api/                  bookings, donations, availability, SumUp callback, CSV export
src/lib/bookings.ts           Capacity, duplicate rules, SumUp checkouts, payment verification
src/lib/sumup.ts              SumUp Checkouts API client
src/lib/email.ts              Brevo sender + email templates
src/proxy.ts                  Basic-auth protection for /admin
```
