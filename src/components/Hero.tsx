import Image from "next/image";
import { EVENT, TICKETS, formatGBP } from "@/lib/config";
import { CalendarIcon, PinIcon } from "./ui";

export function Hero() {
  return (
    <section id="top" className="pattern-maroon relative overflow-hidden text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:py-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:py-16">
        <div className="fade-up text-center lg:text-left">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-gold-light">
            ॐ Sri Satyanarayana Swamy Vratam ॐ
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-6xl">
            Samuhika <br className="hidden lg:block" />
            Satyanarayana Vratam{" "}
            <span className="text-gold-light">2026</span>
          </h1>

          <ul className="mt-6 space-y-3 text-lg">
            <li className="flex items-start justify-center gap-3 lg:justify-start">
              <CalendarIcon className="mt-1 h-5 w-5 shrink-0 text-gold-light" />
              <span className="font-semibold">{EVENT.dateLong}</span>
            </li>
            <li className="flex items-start justify-center gap-3 text-left lg:justify-start">
              <PinIcon className="mt-1 h-5 w-5 shrink-0 text-gold-light" />
              <span>
                <span className="font-semibold">{EVENT.venueName}</span>, {EVENT.address}
              </span>
            </li>
          </ul>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a
              href="#tickets"
              className="rounded-full bg-saffron px-8 py-3.5 text-center text-lg font-bold text-white shadow-lg shadow-black/30 transition hover:bg-saffron-dark"
            >
              Register Now
            </a>
            <a
              href="#donate"
              className="rounded-full border-2 border-gold-light px-8 py-3.5 text-center text-lg font-bold text-gold-light transition hover:bg-gold-light hover:text-maroon-dark"
            >
              Donate
            </a>
          </div>

          <p className="mt-5 text-sm text-cream/80">
            Yajamani {formatGBP(TICKETS.yajamani.pricePence)} &nbsp;·&nbsp; General attendance free
          </p>
        </div>

        <div className="fade-up mx-auto w-full max-w-sm [animation-delay:150ms] lg:max-w-md">
          <div className="rounded-[1.75rem] bg-gradient-to-b from-gold-light via-gold to-saffron p-1.5 shadow-2xl shadow-black/50">
            {/*
              The poster file has a ~41px white/grey frame baked in (artwork spans x 39-680, y 41-982
              of 723×1024). The image is oversized and offset so only the artwork shows.
            */}
            <div className="relative aspect-[641/941] overflow-hidden rounded-[1.4rem] bg-maroon-dark">
              <Image
                src="/images/satyanarayana.jpg"
                alt="Sri Satyanarayana Swamy blessing devotees during the Satyanarayana Vratam"
                width={723}
                height={1024}
                priority
                sizes="(min-width: 1024px) 520px, (min-width: 640px) 440px, 100vw"
                className="absolute h-auto max-w-none"
                style={{ width: "113.4%", left: "-6.4%", top: "-4.7%" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
