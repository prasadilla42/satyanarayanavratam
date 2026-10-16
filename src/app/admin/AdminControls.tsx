"use client";

import { useActionState } from "react";
import { updateCapacityAction } from "./actions";

/** A submit button that asks "Are you sure?" first. Use inside a <form action={serverAction}>. */
export function ConfirmButton({
  children,
  message,
  className,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Edit the Yajamani / General ticket limits. */
export function CapacityForm({ yajamani, general }: { yajamani: number; general: number }) {
  const [state, action, pending] = useActionState(updateCapacityAction, null);
  const input =
    "mt-1 w-28 rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 focus:border-saffron";

  return (
    <form action={action} className="mt-6 rounded-xl border border-gold/40 bg-white p-4 shadow-sm">
      <h2 className="font-display text-xl font-bold text-maroon">Ticket limits</h2>
      <p className="mt-1 text-sm text-stone-600">
        Change how many tickets can be booked in total. A limit can&apos;t go below the seats already booked or held.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="text-sm font-semibold">
          Yajamani tickets (paid)
          <input
            key={`y${yajamani}`}
            name="yajamani"
            type="number"
            inputMode="numeric"
            min={0}
            max={5000}
            step={1}
            required
            defaultValue={yajamani}
            className={`${input} block`}
          />
        </label>
        <label className="text-sm font-semibold">
          General tickets (free)
          <input
            key={`g${general}`}
            name="general"
            type="number"
            inputMode="numeric"
            min={0}
            max={5000}
            step={1}
            required
            defaultValue={general}
            className={`${input} block`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-maroon px-5 py-2.5 text-sm font-semibold text-white hover:bg-maroon-dark disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save limits"}
        </button>
      </div>
      {state && (
        <p role="status" className={`mt-3 text-sm font-semibold ${state.ok ? "text-green-800" : "text-red-700"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
