import { EVENT } from "@/lib/config";
import { CalendarIcon, ClockIcon, MailIcon, PhoneIcon, PinIcon, SectionHeading } from "./ui";

export function Venue() {
  const { contact, timings } = EVENT;
  const hasContact = Boolean(contact.name || contact.email || contact.phone);

  return (
    <section id="venue" className="bg-cream-dark/60 px-4 py-12 sm:py-20">
      <SectionHeading eyebrow="Find us" title="Venue &amp; Contact" />

      <div className="mx-auto mt-10 grid max-w-6xl gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="rounded-2xl border border-gold/40 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <PinIcon className="mt-1 h-6 w-6 shrink-0 text-saffron-dark" />
              <div>
                <h3 className="font-display text-xl font-bold text-maroon">{EVENT.venueName}</h3>
                <address className="mt-1 not-italic text-ink/80">{EVENT.address}</address>
                <a
                  href={EVENT.mapsDirectionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block rounded-full bg-maroon px-6 py-3 font-bold text-white hover:bg-maroon-dark"
                >
                  Get directions
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gold/40 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <CalendarIcon className="mt-1 h-6 w-6 shrink-0 text-saffron-dark" />
              <div className="w-full">
                <h3 className="font-display text-xl font-bold text-maroon">{EVENT.dateLong}</h3>
                <div className="mt-3 flex items-start gap-2 text-ink/80">
                  <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                  {timings.length > 0 ? (
                    <ul className="w-full space-y-1">
                      {timings.map((t) => (
                        <li key={t.time + t.label} className="flex flex-col gap-0 sm:flex-row sm:justify-between sm:gap-4">
                          <span className="whitespace-nowrap font-semibold">{t.time}</span>
                          <span>{t.label}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span>Timings to be confirmed – we will update this page and email registered guests.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gold/40 bg-white p-6 shadow-sm">
            <h3 className="font-display text-xl font-bold text-maroon">Organiser contact</h3>
            {hasContact ? (
              <ul className="mt-3 space-y-2 text-ink/85">
                {contact.name && <li className="font-semibold">{contact.name}</li>}
                {contact.phone && (
                  <li className="flex items-center gap-2">
                    <PhoneIcon className="h-5 w-5 text-saffron-dark" />
                    <a className="underline-offset-2 hover:underline" href={`tel:${contact.phone.replace(/\s+/g, "")}`}>
                      {contact.phone}
                    </a>
                  </li>
                )}
                {contact.email && (
                  <li className="flex items-center gap-2">
                    <MailIcon className="h-5 w-5 text-saffron-dark" />
                    <a className="underline-offset-2 hover:underline" href={`mailto:${contact.email}`}>
                      {contact.email}
                    </a>
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-2 text-ink/70">Organiser contact details will be shared here soon.</p>
            )}
          </div>
        </div>

        <div className="min-h-[300px] overflow-hidden rounded-2xl border border-gold/40 bg-white shadow-sm sm:min-h-[360px]">
          <iframe
            title={`Map showing ${EVENT.venueName}, ${EVENT.address}`}
            src={EVENT.mapsEmbedUrl}
            className="h-full min-h-[300px] w-full border-0 sm:min-h-[360px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}
