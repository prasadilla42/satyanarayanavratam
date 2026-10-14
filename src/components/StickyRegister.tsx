"use client";

import { useEffect, useState } from "react";

/** Mobile-only floating "Register Now" bar. Hides while the hero, ticket or donation sections are on screen. */
export function StickyRegister() {
  // Start hidden: the page opens on the hero, which has its own Register button.
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const targets = ["top", "tickets", "donate"]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        setHidden(visible.size > 0);
      },
      { threshold: 0.15 },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-gold/40 bg-maroon-dark/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(0,0,0,0.25)] backdrop-blur transition-transform duration-300 md:hidden ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
      aria-hidden={hidden}
    >
      <a
        href="#tickets"
        tabIndex={hidden ? -1 : 0}
        className="block rounded-full bg-saffron py-3 text-center text-lg font-bold text-white shadow hover:bg-saffron-dark"
      >
        Register Now
      </a>
    </div>
  );
}
