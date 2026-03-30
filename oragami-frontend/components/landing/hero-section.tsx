"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AnimatedSphere } from "./animated-sphere";

export function HeroSection() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => { setIsVisible(true); }, []);

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] lg:w-[900px] lg:h-[900px] opacity-30 pointer-events-none">
        <AnimatedSphere />
      </div>

      {/* Grid */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        {[...Array(8)].map((_, i) => (
          <div key={`h-${i}`} className="absolute h-px bg-foreground/10" style={{ top: `${12.5 * (i + 1)}%`, left: 0, right: 0 }} />
        ))}
        {[...Array(12)].map((_, i) => (
          <div key={`v-${i}`} className="absolute w-px bg-foreground/10" style={{ left: `${8.33 * (i + 1)}%`, top: 0, bottom: 0 }} />
        ))}
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12 py-32 lg:py-40">

        {/* Eyebrow */}
        <div className={`mb-10 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <span className="inline-flex items-center gap-3 text-xs font-mono tracking-widest text-muted-foreground uppercase">
            <span className="w-8 h-px bg-foreground/30" />
            Solana Devnet · StableHacks 2026 · Track 4
          </span>
        </div>

        {/* Headline */}
        <h1 className={`text-[clamp(2.8rem,10vw,8.5rem)] font-display leading-[0.92] tracking-tight mb-10 transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <span className="block">Gold-backed</span>
          <span className="block">yield for</span>
          <span className="block text-muted-foreground">institutions.</span>
        </h1>

        {/* One-liner */}
        <div className={`mb-14 transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-xl lg:text-2xl text-muted-foreground leading-relaxed max-w-2xl">
            Deposit USDC. Receive a token that tracks live gold prices and earns yield from Solstice USX — simultaneously. Every operation gated by on-chain KYC. No off-chain compliance bypass possible.
          </p>
        </div>

        {/* Two product cards */}
        <div className={`grid sm:grid-cols-2 gap-4 max-w-2xl mb-14 transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="border border-foreground/10 p-5 space-y-2 hover:border-foreground/30 transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Yield Vault</span>
              <span className="font-mono text-xs text-green-500">~5% APY</span>
            </div>
            <p className="font-display text-lg">USDC → cVAULT</p>
            <p className="text-sm text-muted-foreground">NAV tracks Gold + CHF via SIX Exchange. 70% of deposits earn USX carry yield.</p>
          </div>
          <div className="border border-foreground/10 p-5 space-y-2 hover:border-foreground/30 transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Custody Vault</span>
              <span className="font-mono text-xs text-green-500">Live</span>
            </div>
            <p className="font-display text-lg">Gold → VAULT-GOLD</p>
            <p className="text-sm text-muted-foreground">Vault holds custody on-chain. Transfer positions between credentialed institutions.</p>
          </div>
        </div>

        {/* CTAs */}
        <div className={`flex flex-col sm:flex-row items-start gap-4 transition-all duration-700 delay-400 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <a
            href="/onboard/connect"
            className="inline-flex items-center gap-2 px-8 h-14 bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-foreground/90 transition-colors group"
          >
            Get Started
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 px-8 h-14 border border-foreground/20 font-mono text-xs tracking-widest uppercase hover:border-foreground/50 transition-colors"
          >
            How it works
          </a>
        </div>

        {/* Trust bar */}
        <div className={`mt-16 pt-8 border-t border-foreground/10 flex flex-wrap gap-8 transition-all duration-700 delay-500 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          {[
            { label: "Price feed", value: "SIX Exchange mTLS" },
            { label: "Compliance", value: "KYC · AML · FATF Travel Rule" },
            { label: "Proof of reserve", value: "On-chain · 24h freshness" },
            { label: "Network", value: "Solana devnet" },
          ].map((item) => (
            <div key={item.label} className="space-y-1">
              <p className="font-mono text-xs text-muted-foreground/60 uppercase tracking-widest">{item.label}</p>
              <p className="font-mono text-xs text-foreground/80">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
