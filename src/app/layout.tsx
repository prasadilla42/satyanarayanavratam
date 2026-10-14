import type { Metadata, Viewport } from "next";
import { Playfair_Display, Nunito_Sans } from "next/font/google";
import { EVENT, siteUrl } from "@/lib/config";
import "./globals.css";

const heading = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const body = Nunito_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const description = `Join us for ${EVENT.name} on ${EVENT.dateLong} at ${EVENT.venueName}, ${EVENT.address}. Register as a Yajamani (£51) or attend free, and donate to support the Vratam.`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: `${EVENT.name} | ${EVENT.venueName}, Rugby`,
  description,
  openGraph: {
    title: EVENT.name,
    description,
    type: "website",
    images: [{ url: "/images/satyanarayana.jpg", width: 723, height: 1024, alt: "Sri Satyanarayana Swamy" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#6b1220",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
