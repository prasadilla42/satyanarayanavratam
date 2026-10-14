import { About } from "@/components/About";
import { Booking } from "@/components/Booking";
import { Donate } from "@/components/Donate";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { StickyRegister } from "@/components/StickyRegister";
import { Venue } from "@/components/Venue";
import { EVENT, TICKETS, siteUrl } from "@/lib/config";

const eventJsonLd = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: EVENT.name,
  startDate: EVENT.isoDate,
  eventStatus: "https://schema.org/EventScheduled",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  location: {
    "@type": "Place",
    name: EVENT.venueName,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Edward St",
      addressLocality: "Rugby",
      postalCode: "CV21 2EZ",
      addressCountry: "GB",
    },
  },
  image: [`${siteUrl()}/images/satyanarayana.jpg`],
  offers: [
    {
      "@type": "Offer",
      name: TICKETS.yajamani.name,
      price: (TICKETS.yajamani.pricePence / 100).toFixed(2),
      priceCurrency: "GBP",
      url: `${siteUrl()}/#tickets`,
    },
    {
      "@type": "Offer",
      name: TICKETS.general.name,
      price: "0",
      priceCurrency: "GBP",
      url: `${siteUrl()}/#tickets`,
    },
  ],
};

// A single, fast, statically rendered page. Live seat counts load in the browser.
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
      />
      <Header />
      <main>
        <Hero />
        <About />
        <Booking />
        <Donate />
        <Venue />
      </main>
      <Footer />
      <StickyRegister />
    </>
  );
}
