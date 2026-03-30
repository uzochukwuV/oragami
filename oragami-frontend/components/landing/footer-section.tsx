"use client";

import { ArrowUpRight } from "lucide-react";
import { AnimatedWave } from "./animated-wave";

const footerLinks = {
  Products: [
    { name: "Yield Vault", href: "/app" },
    { name: "Custody Vaults", href: "/app/vaults" },
    { name: "Get Credentialed", href: "/onboard/connect" },
    { name: "How it works", href: "#how-it-works" },
  ],
  Compliance: [
    { name: "KYC / AML Credential", href: "#features" },
    { name: "Travel Rule (FATF)", href: "#features" },
    { name: "Transfer Hook", href: "#features" },
    { name: "Proof of Reserve", href: "#features" },
  ],
  Technology: [
    { name: "Solana", href: "https://solana.com" },
    { name: "Anchor 0.32", href: "https://anchor-lang.com" },
    { name: "SIX Exchange API", href: "https://www.six-group.com" },
    { name: "Solstice USX", href: "#features" },
  ],
  Hackathon: [
    { name: "StableHacks 2026", href: "#" },
    { name: "Track 4 — RWA Vaults", href: "#" },
    { name: "oragami-vault on Solscan", href: "https://explorer.solana.com/address/ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP?cluster=devnet" },
    { name: "multi-asset-vault on Solscan", href: "https://explorer.solana.com/address/6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D?cluster=devnet" },
  ],
};

const socialLinks = [
  { name: "oragami-vault", href: "https://explorer.solana.com/address/ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP?cluster=devnet" },
  { name: "multi-asset-vault", href: "https://explorer.solana.com/address/6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D?cluster=devnet" },
  { name: "transfer-hook", href: "https://explorer.solana.com/address/965gkqvNvYbUsSdqz4AB3YvBw9hqQuNeKMYzHxQBsP1N?cluster=devnet" },
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

              <p className="text-muted-foreground leading-relaxed mb-4 max-w-xs">
                Institutional RWA infrastructure on Solana. Two products, one compliance layer.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-8 max-w-xs text-sm">
                Yield Vault: deposit USDC, earn Gold NAV + USX carry. Custody Vault: deposit tokenized assets, transfer positions between credentialed institutions with zero counterparty risk.
              </p>

              <div className="flex flex-col gap-3">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group font-mono"
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
                        target={link.href.startsWith("http") ? "_blank" : undefined}
                        rel="noopener noreferrer"
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
              3 programs deployed
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
