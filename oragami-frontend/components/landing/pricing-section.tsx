"use client";

import { Check, ArrowRight } from "lucide-react";

const tiers = [
  {
    name: "Retail",
    description: "Basic institutional access",
    tier: "Tier 1",
    features: [
      "KYC Level 1 — basic verification",
      "Deposit up to 10,000 USDC",
      "Earn yield on RWA basket",
      "cVAULT minted at live NAV",
      "Redeem at any time",
    ],
    cta: "Request credential",
    highlight: false,
  },
  {
    name: "Professional",
    description: "Enhanced compliance clearance",
    tier: "Tier 2",
    features: [
      "KYC Level 2 — enhanced due diligence",
      "AML coverage score ≥ 80",
      "Deposit up to 500,000 USDC",
      "Access to low + medium risk strategies",
      "cVAULT-TRADE secondary market",
      "Travel Rule auto-filing",
    ],
    cta: "Apply for access",
    highlight: true,
  },
  {
    name: "Institutional",
    description: "Full institutional mandate",
    tier: "Tier 3",
    features: [
      "KYC Level 3 — full institutional KYC",
      "AML coverage score ≥ 90",
      "Unlimited deposit capacity",
      "All strategy risk tiers",
      "Cross-border settlement access",
      "Custom investment mandate on-chain",
      "Dedicated compliance support",
    ],
    cta: "Contact us",
    highlight: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-32 lg:py-40 border-t border-foreground/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="max-w-3xl mb-20">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
            Access Tiers
          </span>
          <h2 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight text-foreground mb-6">
            Compliance-gated
            <br />
            <span className="text-muted-foreground">institutional access.</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl">
            Every tier is enforced on-chain via soulbound ComplianceCredential PDAs.
            No credential — no deposit. No exceptions.
          </p>
        </div>

        {/* Tier Cards */}
        <div className="grid md:grid-cols-3 gap-px bg-foreground/10">
          {tiers.map((tier, idx) => (
            <div
              key={tier.name}
              className={`relative p-8 lg:p-12 bg-background ${
                tier.highlight ? "md:-my-4 md:py-12 lg:py-16 border-2 border-foreground" : ""
              }`}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-8 px-3 py-1 bg-foreground text-background text-xs font-mono uppercase tracking-widest">
                  Most Common
                </span>
              )}

              <div className="mb-8">
                <span className="font-mono text-xs text-muted-foreground">{tier.tier}</span>
                <h3 className="font-display text-3xl text-foreground mt-2">{tier.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">{tier.description}</p>
              </div>

              {/* On-chain badge */}
              <div className="mb-8 pb-8 border-b border-foreground/10">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Enforced on-chain · Solana devnet
                  </span>
                </div>
              </div>

              <ul className="space-y-4 mb-10">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-foreground mt-0.5 shrink-0" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all group ${
                  tier.highlight
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "border border-foreground/20 text-foreground hover:border-foreground hover:bg-foreground/5"
                }`}
              >
                {tier.cta}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-muted-foreground">
          All tiers include on-chain credential issuance, NAV-priced minting, and yield accrual.{" "}
          <a href="#how-it-works" className="underline underline-offset-4 hover:text-foreground transition-colors">
            See how credentials work
          </a>
        </p>
      </div>
    </section>
  );
}
