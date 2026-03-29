"use client";

import { ArrowUpRight } from "lucide-react";
import { AnimatedWave } from "./animated-wave";

const footerLinks = {
  Vault: [
    { name: "How it works", href: "#how-it-works" },
    { name: "Features", href: "#features" },
    { name: "Metrics", href: "#studio" },
    { name: "Launch App", href: "/app" },
  ],
  Compliance: [
    { name: "KYC / AML", href: "#features" },
    { name: "Travel Rule", href: "#features" },
    { name: "Transfer Hook", href: "#features" },
    { name: "Credentials", href: "#how-it-works" },
  ],
  Technology: [
    { name: "Solana", href: "https://solana.com" },
    { name: "Anchor", href: "https://anchor-lang.com" },
    { name: "SIX Exchange", href: "#features" },
    { name: "Token-2022", href: "#features" },
  ],
  Hackathon: [
    { name: "StableHacks 2026", href: "#" },
    { name: "Track 4 — RWA Vaults", href: "#" },
    { name: "GitHub", href: "#" },
    { name: "Demo Guide", href: "#" },
  ],
};

const socialLinks = [
  { name: "GitHub", href: "#" },
  { name: "Twitter", href: "#" },
  { name: "Solscan", href: `https://explorer.solana.com/address/ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP?cluster=devnet` },
];

export function FooterSection() {
  return (
    <footer className="relative border-t border-foreground/10">
      <div className="absolute inset-0 h-64 opacity-20 pointer-events-none overflow-hidden">
        <AnimatedWave />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="py-16 lg:py-24">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-12 lg:gap-8">
            {/* Brand Column */}
            <div className="col-span-2">
              <a href="#" className="inline-flex items-center gap-2 mb-6">
                <span className="text-2xl font-display">Oragami</span>
                <span className="text-xs text-muted-foreground font-mono">RWA</span>
              </a>

              <p className="text-muted-foreground leading-relaxed mb-8 max-w-xs">
                Institutional RWA vault on Solana. Deposit USDC, mint cVAULT backed
                by Gold + CHF via SIX Exchange. On-chain KYC/AML enforcement.
                Built for StableHacks 2026.
              </p>

              <div className="flex gap-6">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target={link.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </a>
                ))}
              </div>
            </div>

            {/* Link Columns */}
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium mb-6">{title}</h3>
                <ul className="space-y-4">
                  {links.map((link) => (
                    <li key={link.name}>
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-8 border-t border-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2026 Oragami. Built for StableHacks 2026 — Track 4: RWA-Backed Stablecoin & Commodity Vaults.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Devnet operational
            </span>
            <span className="font-mono text-xs text-foreground/30">
              ihUcHpWk...
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
