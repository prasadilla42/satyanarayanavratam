import { SectionHeading } from "./ui";

const points = [
  { icon: "🪔", title: "Community Vratam", text: "Devotees gather as one family to perform the Vratam together." },
  { icon: "🌸", title: "Families welcome", text: "Bring your parents, children and loved ones to take part." },
  { icon: "🙏", title: "Everyone is invited", text: "General attendance is free – all are welcome to join in." },
];

export function About() {
  return (
    <section id="about" className="pattern-cream px-4 py-12 sm:py-20">
      <SectionHeading eyebrow="Om Namo Narayanaya" title="About the Vratam">
        Sri Satyanarayana Swamy Vratam is a cherished devotional observance dedicated to Lord Vishnu as
        Satyanarayana, the embodiment of truth. Performed together with family and community, it is observed
        to seek blessings for peace, harmony and well-being.
      </SectionHeading>
      <p className="mx-auto mt-4 max-w-2xl text-center text-lg leading-relaxed text-ink/80">
        We warmly invite families from Rugby and beyond to join this Samuhika Vratam on 15 November 2026.
      </p>

      <div className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-3">
        {points.map((p) => (
          <div key={p.title} className="rounded-2xl border border-gold/40 bg-white/80 p-6 text-center shadow-sm">
            <div className="text-4xl" aria-hidden>{p.icon}</div>
            <h3 className="mt-3 font-display text-xl font-bold text-maroon">{p.title}</h3>
            <p className="mt-2 text-ink/75">{p.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
