# Samuhika Satyanarayana Vratam 2026

Single-page event site: event info, ticket booking, donations and venue details on one page.
Stripe Checkout opens only when payment is needed; free registrations are confirmed instantly.

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · Stripe Checkout · PostgreSQL + Prisma · Gmail (Nodemailer) · Vercel

## How it works

| Item | Rule |
| --- | --- |
| Yajamani ticket | £51 each, any quantity per booking (max 20), **50 in total** |
| General ticket | Free, any quantity per booking (max 20), **300 in total** |
| Duplicates | One active booking per email address **or** phone number (see below) |
| Paid booking | Seats are held for ~35 min → Stripe Checkout → webhook verifies payment → confirmed + email |
| Free booking | Confirmed immediately → confirmation screen + email |
| Donations | £5 / £11 / £21 / £51 / £101 or custom amount → Stripe Checkout → receipt email |
| Admin | `/admin` (HTTP Basic Auth): bookings, donations, seat counts, CSV export, resend email |

**Limits can't be oversold.** Every seat change runs under a Postgres advisory lock, so two people
clicking at the same moment can't take the last seat. Unpaid seats are held while the visitor is on the
Stripe page and released automatically if checkout is abandoned or expires.

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

Create a free database at [Neon](https://neon.tech) (or Supabase / Vercel Postgres) and put the
connection strings in `DATABASE_URL` and `DIRECT_URL`. Then create the tables:

```bash
npx prisma migrate deploy
```

### 3. Stripe

1. Create a [Stripe](https://dashboard.stripe.com) account. Copy the **secret key** into `STRIPE_SECRET_KEY` (use test keys first).
2. Add a webhook endpoint: **Developers → Webhooks → Add endpoint**
   * URL: `https://YOUR-DOMAIN/api/webhooks/stripe`
   * Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`
   * Copy its **signing secret** into `STRIPE_WEBHOOK_SECRET`.
3. Local testing with the Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   Use the `whsec_...` it prints as `STRIPE_WEBHOOK_SECRET`. Test card: `4242 4242 4242 4242`.

### 4. Gmail confirmation emails

Emails are sent from your Gmail account over SMTP using an **App Password** (not your normal password):

1. Turn on **2-Step Verification** for the Gmail account.
2. Go to <https://myaccount.google.com/apppasswords>, create an app password, and copy the 16 characters.
3. Set `GMAIL_USER` (the Gmail address) and `GMAIL_APP_PASSWORD`.

Gmail allows ~500 emails/day for personal accounts, which is plenty for 350 bookings.
If Gmail isn't configured, emails are printed to the server log instead of being sent.
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
4. Add the Stripe webhook for the production URL (step 3.2) and switch to **live** Stripe keys when ready.

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
npm run test:paid    # signed fake Stripe webhooks: confirm, replay, tampering, expiry, 50-seat limit
npm run test:admin   # admin area locked down
```

(`test:paid` needs `STRIPE_SECRET_KEY=sk_test_dummy` and `STRIPE_WEBHOOK_SECRET=whsec_localtest` in `.env`.)

## Project layout

```
prisma/schema.prisma          Booking + Donation models
src/app/page.tsx              The single public page
src/app/confirmation/         Confirmation screen (booking / donation reference)
src/app/admin/                Protected dashboard
src/app/api/                  bookings, donations, availability, Stripe webhook, CSV export
src/lib/bookings.ts           Capacity, duplicate rules, Stripe sessions, payment verification
src/lib/email.ts              Gmail sender + email templates
src/proxy.ts                  Basic-auth protection for /admin
```
