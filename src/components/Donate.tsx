"use client";

import { useState } from "react";
import { DONATION_MAX_PENCE, DONATION_MIN_PENCE, DONATION_PRESETS_GBP, formatGBP } from "@/lib/config";
import { donationSchema, fieldErrors } from "@/lib/validation";
import { Field, SectionHeading, Spinner, inputClass } from "./ui";

type Errors = Record<string, string>;

/** "12.5" → 1250 pence. Returns null for invalid input. */
function poundsToPence(input: string): number | null {
  const clean = input.trim().replace(/^£/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number.parseFloat(clean) * 100);
}

export function Donate() {
  const [preset, setPreset] = useState<number | null>(21);
  const [custom, setCustom] = useState("");
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const customPence = custom ? poundsToPence(custom) : null;
  const amountPence = custom ? customPence : preset !== null ? preset * 100 : null;
  const label = submitting
    ? "Please wait…"
    : amountPence && amountPence >= DONATION_MIN_PENCE
      ? `Donate ${formatGBP(amountPence)}`
      : "Choose an amount";

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: "" }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    if (custom && customPence === null) {
      setErrors({ amountPence: "Enter an amount like 25 or 12.50" });
      return;
    }
    const parsed = donationSchema.safeParse({ ...form, amountPence: amountPence ?? 0 });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      if (data.code === "VALIDATION") setErrors(data.errors ?? {});
      else setFormError(data.message ?? "Something went wrong. Please try again.");
    } catch {
      setFormError("We couldn't reach the server. Please check your connection and try again.");
    }
    setSubmitting(false);
  }

  return (
    <section id="donate" className="pattern-maroon px-4 py-16 text-white sm:py-20">
      <SectionHeading eyebrow="Seva" title="Make a Donation" light>
        Support the Vratam with a donation of any amount. You don&apos;t need to register for a ticket to donate.
      </SectionHeading>

      <form onSubmit={onSubmit} noValidate className="mx-auto mt-10 max-w-2xl rounded-3xl bg-cream p-6 text-ink shadow-2xl sm:p-8">
        <fieldset>
          <legend className="mb-3 font-display text-xl font-bold text-maroon">Choose an amount</legend>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {DONATION_PRESETS_GBP.map((p) => {
              const selected = !custom && preset === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setPreset(p);
                    setCustom("");
                    setErrors((er) => ({ ...er, amountPence: "" }));
                  }}
                  className={`rounded-xl border-2 py-3 text-xl font-bold transition ${
                    selected
                      ? "border-saffron bg-saffron text-white shadow"
                      : "border-gold/60 bg-white text-maroon hover:border-saffron"
                  }`}
                >
                  £{p}
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <Field id="custom" label="Or enter a custom amount" error={errors.amountPence} required={false}>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-maroon">£</span>
                <input
                  id="custom"
                  inputMode="decimal"
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    if (e.target.value) setPreset(null);
                    setErrors((er) => ({ ...er, amountPence: "" }));
                  }}
                  aria-invalid={errors.amountPence ? true : undefined}
                  aria-describedby={errors.amountPence ? "custom-error" : undefined}
                  placeholder="Other amount"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </Field>
            {custom && customPence !== null && customPence > DONATION_MAX_PENCE && (
              <p className="mt-1 text-sm text-red-700">Please contact the organisers for larger donations.</p>
            )}
          </div>
        </fieldset>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field id="d-name" label="Your name" required error={errors.name}>
            <input id="d-name" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={errors.name ? true : undefined} className={inputClass} />
          </Field>
          <Field id="d-email" label="Email" required error={errors.email} hint="We'll email your receipt here">
            <input id="d-email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} aria-invalid={errors.email ? true : undefined} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="d-message" label="Message" error={errors.message}>
              <textarea id="d-message" rows={2} value={form.message} onChange={set("message")} className={inputClass} />
            </Field>
          </div>
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="d-website">Website</label>
            <input id="d-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
          </div>
        </div>

        {formError && (
          <div role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !amountPence}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-saffron px-6 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-saffron-dark disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
        >
          {submitting && <Spinner />}
          {label}
        </button>
        <p className="mt-3 text-center text-xs text-ink/60">Secure payment by Stripe. You can donate without buying a ticket.</p>
      </form>
    </section>
  );
}
