"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the server component every few seconds (used while a payment is being verified). */
export function AutoRefresh({ everyMs = 3000, maxTries = 20 }: { everyMs?: number; maxTries?: number }) {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (tries > maxTries) clearInterval(id);
      else router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, maxTries]);
  return null;
}
