const links = [
  { href: "#about", label: "About" },
  { href: "#tickets", label: "Tickets" },
  { href: "#donate", label: "Donate" },
  { href: "#venue", label: "Venue" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-gold/30 bg-maroon-dark/95 text-white backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <a href="#top" className="flex items-center gap-2 font-display text-base font-bold sm:text-lg">
          <span className="text-2xl text-gold-light" aria-hidden>ॐ</span>
          <span className="leading-tight">
            Satyanarayana Vratam <span className="text-gold-light">2026</span>
          </span>
        </a>
        <nav className="hidden items-center gap-6 text-sm font-semibold md:flex" aria-label="Main">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-cream/90 hover:text-gold-light">
              {l.label}
            </a>
          ))}
          <a href="#tickets" className="rounded-full bg-saffron px-5 py-2 text-white shadow hover:bg-saffron-dark">
            Register Now
          </a>
        </nav>
        <a href="#donate" className="rounded-full border border-gold-light/60 px-4 py-2 text-sm font-semibold text-gold-light md:hidden">
          Donate
        </a>
      </div>
    </header>
  );
}
