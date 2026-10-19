"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PER_BOOKING, TICKETS, formatGBP } from "@/lib/config";
import { bookingSchema, fieldErrors } from "@/lib/validation";
import type { Availability } from "@/lib/bookings";
import { Field, SectionHeading, Spinner, inputClass } from "./ui";
import { PrivacyNotice } from "./PrivacyNotice";

type TicketKey = "yajamani" | "general";
type Errors = Record<string, string>;

function useAvailability() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/availability", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      setAvailability(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    void refresh();
  }, [refresh]);

  return { availability, failed, refresh, setAvailability };
}

function Stepper({
  id,
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(max, Number.isFinite(n) ? n : 0));
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= 0}
        aria-label={`Decrease ${label}`}
        className="h-11 w-11 rounded-full border-2 border-maroon text-2xl font-bold leading-none text-maroon transition hover:bg-maroon hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-maroon"
      >
        −
      </button>
      <input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        disabled={disabled}
        aria-label={`${label} quantity`}
        onChange={(e) => onChange(clamp(Number.parseInt(e.target.value.replace(/\D/g, ""), 10)))}
        onFocus={(e) => e.target.select()}
        className="h-11 w-14 rounded-lg border border-gold/50 bg-white text-center text-lg font-bold text-ink disabled:bg-stone-100"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label}`}
        className="h-11 w-11 rounded-full border-2 border-maroon text-2xl font-bold leading-none text-maroon transition hover:bg-maroon hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-maroon"
      >
        +
      </button>
    </div>
  );
}

function TicketCard({
  type,
  qty,
  max,
  remaining,
  onChange,
  error,
}: {
  type: TicketKey;
  qty: number;
  max: number;
  remaining: number | null;
  onChange: (n: number) => void;
  error?: string;
}) {
  const t = TICKETS[type];
  const featured = type === "yajamani";
  const soldOut = remaining === 0;
  const low = remaining !== null && remaining > 0 && remaining <= (featured ? 10 : 30);

  return (
    <div
      className={`relative rounded-2xl p-4 shadow-sm transition sm:p-5 ${
        featured ? "border-2 border-gold bg-gradient-to-br from-white to-cream-dark" : "border border-gold/40 bg-white"
      } ${qty > 0 ? "ring-4 ring-saffron/40" : ""}`}
    >
      {featured && (
        <span className="absolute -top-3 left-5 rounded-full bg-maroon px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-gold-light">
          Paid registration
        </span>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl font-bold text-maroon">{t.name}</h3>
          <p className="mt-1 text-sm text-ink/75">{t.description}</p>
          <p className="mt-2 text-sm font-semibold">
            {remaining === null ? (
              <span className="text-ink/40">Checking availability…</span>
            ) : soldOut ? (
              <span className="text-red-700">Fully booked</span>
            ) : low ? (
              <span className="text-saffron-dark">Only {remaining} left</span>
            ) : (
              <span className="text-green-800">Places available</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className={`font-display font-bold text-maroon ${featured ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}>
            {featured ? formatGBP(t.pricePence) : "£0"}
          </div>
          <div className="text-xs text-ink/60">{featured ? "per ticket" : "free"}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gold/30 pt-4">
        <label htmlFor={`qty-${type}`} className="text-sm font-bold">
          Quantity
        </label>
        <Stepper
          id={`qty-${type}`}
          label={t.name}
          value={qty}
          max={max}
          disabled={soldOut}
          onChange={onChange}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function Booking() {
  const { availability, failed, refresh } = useAvailability();
  const [yajamaniQty, setYajamaniQty] = useState(0);
  const [generalQty, setGeneralQty] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", phone: "", gothram: "", notes: "", website: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "cancelled") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once on mount
      setCancelled(true);
    }
  }, []);

  const yRemaining = availability ? availability.yajamani.remaining : null;
  const gRemaining = availability ? availability.general.remaining : null;
  const yMax = Math.min(MAX_PER_BOOKING, yRemaining ?? MAX_PER_BOOKING);
  const gMax = Math.min(MAX_PER_BOOKING, gRemaining ?? MAX_PER_BOOKING);

  // Keep selections within what's still available if the numbers change.
  const yQty = Math.min(yajamaniQty, yMax);
  const gQty = Math.min(generalQty, gMax);

  const total = yQty * TICKETS.yajamani.pricePence;
  const hasTickets = yQty + gQty > 0;
  const buttonLabel = submitting
    ? "Please wait…"
    : !hasTickets
      ? "Select a ticket to continue"
      : total > 0
        ? `Pay ${formatGBP(total)} securely`
        : "Confirm free registration";

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: "" }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const payload = { ...form, yajamaniQty: yQty, generalQty: gQty };
    const parsed = bookingSchema.safeParse(payload);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      const first = Object.keys(errs)[0];
      const el = formRef.current?.querySelector<HTMLElement>(`#${first === "yajamaniQty" ? "qty-yajamani" : first}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok && data.url) {
        window.location.assign(data.url); // SumUp Checkout (paid) or confirmation screen (free)
        return; // keep the button disabled while navigating
      }
      if (data.code === "VALIDATION") setErrors(data.errors ?? {});
      else if (data.code === "SOLD_OUT") {
        setErrors({ [data.field]: data.message });
        void refresh();
      } else setFormError(data.message ?? "Something went wrong. Please try again.");
    } catch {
      setFormError("We couldn't reach the server. Please check your connection and try again.");
    }
    setSubmitting(false);
  }

  const invalid = (k: string) => (errors[k] ? true : undefined);

  return (
    <section id="tickets" className="px-4 py-12 sm:py-20">
      <SectionHeading eyebrow="Registration" title="Tickets &amp; Registration">
        Choose your tickets, enter your details and review your booking. You will only be taken to a secure
        payment page if payment is required.
      </SectionHeading>

      {cancelled && (
        <div role="status" className="mx-auto mt-6 max-w-3xl rounded-xl border border-saffron/50 bg-saffron/10 p-4 text-center text-ink">
          Payment was cancelled – no money was taken. Your seats are held for a short while, so you can
          submit the form again to resume.
        </div>
      )}
      {failed && (
        <div role="alert" className="mx-auto mt-6 max-w-3xl rounded-xl border border-red-300 bg-red-50 p-4 text-center text-red-900">
          We couldn&apos;t load live availability. You can still try to register below.
        </div>
      )}

      <form ref={formRef} onSubmit={onSubmit} noValidate className="mx-auto mt-10 grid max-w-6xl gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-8">
          {/* Step 1 */}
          <div>
            <h3 className="mb-4 flex items-center gap-3 font-display text-2xl font-bold text-maroon">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-maroon text-base text-gold-light">1</span>
              Choose your tickets
            </h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
              <TicketCard type="yajamani" qty={yQty} max={yMax} remaining={yRemaining} onChange={setYajamaniQty} error={errors.yajamaniQty} />
              <TicketCard type="general" qty={gQty} max={gMax} remaining={gRemaining} onChange={setGeneralQty} error={errors.generalQty} />
            </div>
          </div>

          {/* Step 2 */}
          <div>
            <h3 className="mb-4 flex items-center gap-3 font-display text-2xl font-bold text-maroon">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-maroon text-base text-gold-light">2</span>
              Your details
            </h3>
            <div className="grid gap-4 rounded-2xl border border-gold/40 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5">
              <div className="sm:col-span-2">
                <Field id="name" label="Full name" required error={errors.name}>
                  <input id="name" name="name" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={invalid("name")} aria-describedby={errors.name ? "name-error" : undefined} className={inputClass} placeholder="e.g. Lakshmi Devi" />
                </Field>
              </div>
              <Field id="email" label="Email" required error={errors.email} hint="Your confirmation will be sent here">
                <input id="email" name="email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} aria-invalid={invalid("email")} aria-describedby={errors.email ? "email-error" : "email-hint"} className={inputClass} placeholder="you@example.com" />
              </Field>
              <Field id="phone" label="Phone" required error={errors.phone}>
                <input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set("phone")} aria-invalid={invalid("phone")} aria-describedby={errors.phone ? "phone-error" : undefined} className={inputClass} placeholder="07700 900123" />
              </Field>
              {yQty > 0 && (
                <div className="sm:col-span-2">
                  <Field id="gothram" label="Gothram" error={errors.gothram} hint="Used for the sankalpam of Yajamani families">
                    <input id="gothram" name="gothram" value={form.gothram} onChange={set("gothram")} className={inputClass} />
                  </Field>
                </div>
              )}
              <div className="sm:col-span-2">
                <Field id="notes" label="Notes" error={errors.notes} hint="Names for sankalpam, accessibility needs, or anything else we should know">
                  <textarea id="notes" name="notes" rows={3} value={form.notes} onChange={set("notes")} aria-invalid={invalid("notes")} className={inputClass} />
                </Field>
              </div>
              {/* Honeypot – hidden from people, bots fill it in */}
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="website">Website</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
              </div>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <h3 className="mb-4 flex items-center gap-3 font-display text-2xl font-bold text-maroon">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-maroon text-base text-gold-light">3</span>
            Review &amp; confirm
          </h3>
          <div className="rounded-2xl border-2 border-gold bg-white p-4 shadow-md sm:p-5">
            {hasTickets ? (
              <ul className="space-y-3">
                {yQty > 0 && (
                  <li className="flex justify-between gap-3">
                    <span>
                      {yQty} × {TICKETS.yajamani.name}
                      <span className="block text-xs text-ink/60">{formatGBP(TICKETS.yajamani.pricePence)} each</span>
                    </span>
                    <span className="font-bold">{formatGBP(total)}</span>
                  </li>
                )}
                {gQty > 0 && (
                  <li className="flex justify-between gap-3">
                    <span>
                      {gQty} × {TICKETS.general.name}
                      <span className="block text-xs text-ink/60">Free</span>
                    </span>
                    <span className="font-bold">£0</span>
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-ink/60">No tickets selected yet.</p>
            )}

            <div className="mt-4 flex items-baseline justify-between border-t border-gold/40 pt-4">
              <span className="font-bold">Total</span>
              <span className="font-display text-3xl font-bold text-maroon">{formatGBP(total)}</span>
            </div>

            {formError && (
              <div role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !hasTickets}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-saffron px-6 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-saffron-dark disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
            >
              {submitting && <Spinner />}
              {buttonLabel}
            </button>

            <p className="mt-3 text-center text-xs text-ink/60">
              {total > 0
                ? "You'll be redirected to SumUp's secure checkout. We never see your card details."
                : "No payment needed. Your confirmation is shown instantly and emailed to you."}
            </p>
            <p className="mt-2 text-center text-xs text-ink/60">
              One booking per email address / phone number. Need more places? Add them to the same booking.
            </p>
            <PrivacyNotice className="mt-3 text-center text-ink/50" />
          </div>
        </aside>
      </form>
    </section>
  );
}
