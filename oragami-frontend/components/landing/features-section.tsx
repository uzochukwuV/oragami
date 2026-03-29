"use client";

import { useEffect, useRef, useState } from "react";

const features = [
  {
    number: "01",
    title: "RWA-Backed NAV Pricing",
    description:
      "cVAULT is priced against a real basket: 50% Gold (XAU/USD) + 30% CHF/USD from SIX Exchange. NAV updates on-chain after every price feed. Deposit 100 USDC at NAV $1.043 and receive 95.78 cVAULT — not a stablecoin, a real asset-backed instrument.",
    visual: "deploy",
    badge: null,
  },
  {
    number: "02",
    title: "On-Chain Compliance Enforcement",
    description:
      "Every wallet must hold a soulbound ComplianceCredential PDA before depositing. KYC level, AML coverage score, jurisdiction, and expiry are stored on-chain. Deposits above 1000 USDC require Travel Rule data. The transfer hook blocks non-whitelisted wallets at the token level — no off-chain bypass possible.",
    visual: "security",
    badge: null,
  },
  {
    number: "03",
    title: "Programmable Yield Engine",
    description:
      "70% of deposits are allocated to the yield strategy. A backend crank calls process_yield daily, accruing yield on-chain into pending_yield. distribute_yield mints mock USX tokens to the vault — a transparent, auditable yield trail. In production: Solstice USX CPI replaces the mock.",
    visual: "ai",
    badge: null,
  },
  {
    number: "04",
    title: "Permissioned Secondary Market",
    description:
      "Convert cVAULT to cVAULT-TRADE for secondary market trading. Every transfer triggers the compliance hook — KYC expiry, AML status, and Travel Rule are validated on-chain automatically. Only whitelisted institutions can trade. Redeem cVAULT-TRADE back to USDC at current NAV at any time.",
    visual: "collab",
    badge: null,
  },
  {
    number: "05",
    title: "Multi-Asset Vault Factory",
    description:
      "The next evolution: institutions deposit actual tokenized assets — Gold, Silver, T-bills — directly into per-asset vaults. Each asset gets its own share token (VAULT-GOLD, VAULT-SILVER) priced at live NAV. One factory program, unlimited asset classes. The same compliance credential gates every vault. Built and deployed on devnet.",
    visual: "factory",
    badge: "Live on Devnet",
  },
];

function DeployVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <defs>
        <clipPath id="deployClip">
          <rect x="30" y="20" width="140" height="120" rx="4" />
        </clipPath>
      </defs>
      <rect x="30" y="20" width="140" height="120" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <g clipPath="url(#deployClip)">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x="40" y={35 + i * 16} width="120" height="10" rx="2" fill="currentColor" opacity="0.15">
            <animate attributeName="opacity" values="0.15;0.8;0.15" dur="2s" begin={`${i * 0.15}s`} repeatCount="indefinite" />
            <animate attributeName="width" values="20;120;20" dur="2s" begin={`${i * 0.15}s`} repeatCount="indefinite" />
          </rect>
        ))}
      </g>
      <circle cx="100" cy="155" r="3" fill="currentColor" opacity="0.3">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function AIVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <circle cx="100" cy="80" r="12" fill="currentColor">
        <animate attributeName="r" values="12;14;12" dur="2s" repeatCount="indefinite" />
      </circle>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i * 60) * (Math.PI / 180);
        const radius = 50;
        return (
          <g key={i}>
            <line x1="100" y1="80" x2={100 + Math.cos(angle) * radius} y2={80 + Math.sin(angle) * radius} stroke="currentColor" strokeWidth="1" opacity="0.3">
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
            </line>
            <circle cx={100 + Math.cos(angle) * radius} cy={80 + Math.sin(angle) * radius} r="6" fill="none" stroke="currentColor" strokeWidth="2">
              <animate attributeName="r" values="6;8;6" dur="2s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}
      <circle cx="100" cy="80" r="30" fill="none" stroke="currentColor" strokeWidth="1" opacity="0">
        <animate attributeName="r" values="20;60" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function CollabVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <g>
        <rect x="30" y="50" width="50" height="60" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="55" y="85" textAnchor="middle" fontSize="14" fontFamily="monospace" fill="currentColor">KYC</text>
        <circle cx="55" cy="35" r="12" fill="none" stroke="currentColor" strokeWidth="2" />
      </g>
      <g>
        <rect x="120" y="50" width="50" height="60" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="145" y="85" textAnchor="middle" fontSize="14" fontFamily="monospace" fill="currentColor">KYC</text>
        <circle cx="145" cy="35" r="12" fill="none" stroke="currentColor" strokeWidth="2" />
      </g>
      <line x1="80" y1="80" x2="120" y2="80" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4">
        <animate attributeName="stroke-dashoffset" values="0;-8" dur="0.5s" repeatCount="indefinite" />
      </line>
      <circle r="4" fill="currentColor">
        <animateMotion dur="1.5s" repeatCount="indefinite">
          <mpath href="#dataPath2" />
        </animateMotion>
      </circle>
      <path id="dataPath2" d="M 80 80 L 120 80" fill="none" />
      <g transform="translate(100, 130)">
        <circle r="6" fill="none" stroke="currentColor" strokeWidth="2">
          <animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}

function SecurityVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <path d="M 100 20 L 150 40 L 150 90 Q 150 130 100 145 Q 50 130 50 90 L 50 40 Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M 100 35 L 135 50 L 135 85 Q 135 115 100 128 Q 65 115 65 85 L 65 50 Z" fill="currentColor" opacity="0.1">
        <animate attributeName="opacity" values="0.1;0.2;0.1" dur="2s" repeatCount="indefinite" />
      </path>
      <rect x="85" y="70" width="30" height="25" rx="3" fill="currentColor" />
      <path d="M 90 70 L 90 60 Q 90 50 100 50 Q 110 50 110 60 L 110 70" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="80" r="4" fill="white" />
      <rect x="98" y="82" width="4" height="8" fill="white" />
      <line x1="60" y1="60" x2="140" y2="60" stroke="currentColor" strokeWidth="1" opacity="0">
        <animate attributeName="y1" values="40;120;40" dur="3s" repeatCount="indefinite" />
        <animate attributeName="y2" values="40;120;40" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.5;0" dur="3s" repeatCount="indefinite" />
      </line>
    </svg>
  );
}

function FactoryVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      {/* Central factory node */}
      <rect x="75" y="60" width="50" height="40" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="100" y="85" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="currentColor" opacity="0.8">FACTORY</text>
      {/* GOLD vault */}
      <rect x="10" y="20" width="44" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="32" y="32" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor">VAULT</text>
      <text x="32" y="42" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.7">GOLD</text>
      {/* SILVER vault */}
      <rect x="146" y="20" width="44" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="168" y="32" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor">VAULT</text>
      <text x="168" y="42" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.7">SILVER</text>
      {/* Future vault */}
      <rect x="78" y="118" width="44" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.4" />
      <text x="100" y="130" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.4">VAULT</text>
      <text x="100" y="140" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.4">T-BILL</text>
      {/* Connecting lines */}
      <line x1="54" y1="34" x2="75" y2="70" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="146" y1="34" x2="125" y2="70" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="100" y1="100" x2="100" y2="118" stroke="currentColor" strokeWidth="1" opacity="0.2" strokeDasharray="3 2" />
      {/* Animated share tokens flowing out */}
      <circle r="3" fill="currentColor" opacity="0.8">
        <animateMotion dur="2s" repeatCount="indefinite" begin="0s">
          <mpath href="#goldPath" />
        </animateMotion>
      </circle>
      <circle r="3" fill="currentColor" opacity="0.8">
        <animateMotion dur="2s" repeatCount="indefinite" begin="1s">
          <mpath href="#silverPath" />
        </animateMotion>
      </circle>
      <path id="goldPath" d="M 75 70 L 54 34" fill="none" />
      <path id="silverPath" d="M 125 70 L 146 34" fill="none" />
    </svg>
  );
}

function AnimatedVisual({ type }: { type: string }) {
  switch (type) {
    case "deploy": return <DeployVisual />;
    case "ai": return <AIVisual />;
    case "collab": return <CollabVisual />;
    case "security": return <SecurityVisual />;
    case "factory": return <FactoryVisual />;
    default: return <DeployVisual />;
  }
}

function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.2 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  const isUpcoming = feature.badge !== null;

  return (
    <div
      ref={cardRef}
      className={`group relative transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      }`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className={`flex flex-col lg:flex-row gap-8 lg:gap-16 py-12 lg:py-20 border-b border-foreground/10 ${
        isUpcoming ? "relative" : ""
      }`}>
        {/* Subtle highlight for the new feature */}
        {isUpcoming && (
          <div className="absolute inset-0 -mx-6 lg:-mx-12 bg-foreground/[0.02] border-l-2 border-foreground/20 pointer-events-none" />
        )}
        <div className="shrink-0 flex flex-col gap-2">
          <span className="font-mono text-sm text-muted-foreground">{feature.number}</span>
          {feature.badge && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono bg-green-500/10 text-green-500 border border-green-500/20 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {feature.badge}
            </span>
          )}
        </div>
        <div className="flex-1 grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-3xl lg:text-4xl font-display mb-4 group-hover:translate-x-2 transition-transform duration-500">
              {feature.title}
            </h3>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {feature.description}
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div className="w-48 h-40 text-foreground">
              <AnimatedVisual type={feature.visual} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeaturesSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" ref={sectionRef} className="relative py-24 lg:py-32">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Infrastructure
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Institutional-grade vault.
            <br />
            <span className="text-muted-foreground">Built on Solana.</span>
          </h2>
        </div>
        <div>
          {features.map((feature, index) => (
            <FeatureCard key={feature.number} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
