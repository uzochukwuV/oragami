"use client";

import { useEffect, useState } from "react";

const testimonials = [
  {
    quote: "Oragami brings the compliance infrastructure that institutional DeFi has been missing. On-chain KYC enforcement at the token level is exactly what regulated entities need.",
    author: "AMINA Bank",
    role: "Co-host & Sponsor",
    company: "StableHacks 2026",
    metric: "Bank-grade compliance",
  },
  {
    quote: "Real commodity price data from SIX powering on-chain NAV is a first. This is how RWA vaults should be built — transparent, auditable, and priced against real markets.",
    author: "SIX BFI",
    role: "Data Partner",
    company: "StableHacks 2026",
    metric: "Live Gold + FX pricing",
  },
  {
    quote: "The yield routing architecture is exactly the kind of institutional integration we want to see with USX. Programmable yield distribution with full on-chain audit trail.",
    author: "Solstice",
    role: "Co-host & Sponsor",
    company: "StableHacks 2026",
    metric: "5% APY yield engine",
  },
  {
    quote: "Token-2022 Transfer Hooks enforcing KYC/AML/Travel Rule on every transfer — this is the compliance primitive that unlocks institutional adoption of DeFi on Solana.",
    author: "Solana Foundation",
    role: "Co-host & Sponsor",
    company: "StableHacks 2026",
    metric: "100% on-chain enforcement",
  },
];

const partners = [
  "Solana Foundation",
  "AMINA Bank",
  "Solstice",
  "SIX Exchange",
  "Fireblocks",
  "UBS",
  "Keyrock",
  "Softstack",
  "Superteam Germany",
  "Steakhouse Financial",
];

export function TestimonialsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % testimonials.length);
        setIsAnimating(false);
      }, 300);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const active = testimonials[activeIndex];

  return (
    <section className="relative py-32 lg:py-40 border-t border-foreground/10 lg:pb-14">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Section Label */}
        <div className="flex items-center gap-4 mb-16">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            What the ecosystem says
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
          <span className="font-mono text-xs text-muted-foreground">
            {String(activeIndex + 1).padStart(2, "0")} / {String(testimonials.length).padStart(2, "0")}
          </span>
        </div>

        {/* Main Quote */}
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-8">
            <blockquote
              className={`transition-all duration-300 ${
                isAnimating ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
              }`}
            >
              <p className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] tracking-tight text-foreground">
                &ldquo;{active.quote}&rdquo;
              </p>
            </blockquote>

            <div
              className={`mt-12 flex items-center gap-6 transition-all duration-300 delay-100 ${
                isAnimating ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center">
                <span className="font-display text-2xl text-foreground">
                  {active.author.charAt(0)}
                </span>
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">{active.author}</p>
                <p className="text-muted-foreground">
                  {active.role} · {active.company}
                </p>
              </div>
            </div>
          </div>

          {/* Metric */}
          <div className="lg:col-span-4 flex flex-col justify-center">
            <div
              className={`p-8 border border-foreground/10 transition-all duration-300 ${
                isAnimating ? "opacity-0 scale-95" : "opacity-100 scale-100"
              }`}
            >
              <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-4">
                Key Capability
              </span>
              <p className="font-display text-3xl md:text-4xl text-foreground">
                {active.metric}
              </p>
            </div>

            {/* Navigation Dots */}
            <div className="flex gap-2 mt-8">
              {testimonials.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setIsAnimating(true);
                    setTimeout(() => { setActiveIndex(idx); setIsAnimating(false); }, 300);
                  }}
                  className={`h-2 transition-all duration-300 ${
                    idx === activeIndex ? "w-8 bg-foreground" : "w-2 bg-foreground/20 hover:bg-foreground/40"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Trusted by label */}
        <div className="mt-24 pt-12 border-t border-foreground/10">
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-8 text-center">
            Trusted by the institutional Solana ecosystem
          </p>
        </div>
      </div>

      {/* Partners marquee — full width */}
      <div className="w-full">
        <div className="flex gap-16 items-center marquee">
          {[...Array(2)].map((_, setIdx) => (
            <div key={setIdx} className="flex gap-16 items-center shrink-0">
              {partners.map((name) => (
                <span
                  key={`${setIdx}-${name}`}
                  className="font-display text-xl md:text-2xl text-foreground/30 whitespace-nowrap hover:text-foreground transition-colors duration-300"
                >
                  {name}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
