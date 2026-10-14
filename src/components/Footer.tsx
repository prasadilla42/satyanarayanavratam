import { EVENT } from "@/lib/config";

export function Footer() {
  return (
    <footer className="bg-maroon-dark px-4 pb-24 pt-10 text-center text-cream/80 md:pb-10">
      <p className="font-display text-2xl text-gold-light">ॐ Om Namo Narayanaya ॐ</p>
      <p className="mt-3 text-sm">
        {EVENT.name} · {EVENT.dateLong}
      </p>
      <p className="text-sm">
        {EVENT.venueName}, {EVENT.address}
      </p>
    </footer>
  );
}
