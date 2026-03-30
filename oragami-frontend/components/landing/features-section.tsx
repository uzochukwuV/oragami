"use client";

import { useEffect, useRef, useState } from "react";

const features = [
  {
    number: "01",
    title: "Gold + CHF NAV Yield Vault",
    description:
      "Institutions deposit USDC and receive cVAULT — a NAV-priced token backed by a live basket: 50% Gold (XAU/USD) + 30% CHF/USD from SIX Exchange via authenticated mTLS feed, + 20% Solstice eUSX. 70% of deposited USDC is allocated to Solstice USX to earn carry yield. The result: cVAULT holders capture gold price appreciation and USX yield simultaneously. NAV updates on-chain every 2 minutes. Hard guard: max ±10% change per crank run.",
    visual: "nav",
    badge: null,
  },
  {
    number: "02",
    title: "Soulbound Compliance Credential",
    description:
      "Every institution wallet must hold a ComplianceCredential PDA before touching either product. Seeds: [\"credential\", wallet] — one per institution, non-transferable. Stores KYC level (1–3), AML coverage score (0–100), jurisdiction (ISO 3166), tier, and expiry on-chain. The deposit instruction derives the credential from the payer's key — you cannot pass a fake. One onboarding flow gates both the yield vault and the custody vault.",
    visual: "credential",
    badge: null,
  },
  {
    number: "03",
    title: "FATF Travel Rule Enforcement",
    description:
      "Deposits ≥ 1,000 USDC require a TravelRuleData PDA to be initialised before the deposit call. The PDA stores originator name, originator account, beneficiary name, compliance hash, and amount. The deposit instruction verifies payer match, amount match, and a consumed flag — preventing replay of the same record across multiple deposits. This is FATF Travel Rule compliance enforced at the contract level, not off-chain.",
    visual: "travel",
    badge: null,
  },
  {
    number: "04",
    title: "Tokenized Asset Custody Vault",
    description:
      "The multi-asset vault factory accepts real tokenized assets — Gold, Silver, T-bills — directly. Each asset gets its own vault PDA and share token (VAULT-GOLD, VAULT-SILVER) priced at live NAV from SIX Exchange. The vault PDA holds custody of the underlying asset throughout the position lifecycle. Institutions receive share tokens at deposit NAV and redeem at current NAV — capturing asset appreciation on-chain.",
    visual: "custody",
    badge: "Live on Devnet",
  },
  {
    number: "05",
    title: "Dual-Credential Position Transfers",
    description:
      "Institutions transfer VAULT-GOLD positions to each other through the vault as central counterparty. The transfer_shares instruction verifies both sender and receiver credentials on-chain before any token moves — status active, not expired, wallet binding confirmed. The underlying asset never leaves vault custody. This is the on-chain equivalent of a CCP-settled institutional trade: zero counterparty risk, full audit trail via TransferMade event.",
    visual: "transfer",
    badge: null,
  },
];

function NavVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <line x1="20" y1="130" x2="180" y2="130" stroke="currentColor" strokeWidth="1" opacity="0.2" />
      {[0,1,2,3,4,5,6,7].map((i) => (
        <line key={i} x1={20 + i*23} y1="130" x2={20 + i*23} y2="125" stroke="currentColor" strokeWidth="1" opacity="0.2" />
      ))}
      <polyline
        points="20,110 43,105 66,95 89,88 112,75 135,70 158,60 180,52"
        fill="none" stroke="currentColor" strokeWidth="2" opacity="0.8"
      />
      <polyline
        points="20,110 43,105 66,95 89,88 112,75 135,70 158,60 180,52"
        fill="none" stroke="currentColor" strokeWidth="8" opacity="0.05"
      />
      {[
        [20,110],[66,95],[112,75],[158,60],[180,52]
      ].map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="currentColor" opacity="0.6">
          <animate attributeName="r" values="3;5;3" dur="2s" begin={`${i*0.4}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <text x="22" y="48" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.5">NAV</text>
      <text x="22" y="58" fontSize="9" fontFamily="monospace" fill="currentColor" opacity="0.8">$1.043</text>
      <text x="140" y="20" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.4">SIX Exchange</text>
      <text x="140" y="30" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.4">mTLS feed</text>
    </svg>
  );
}

function CredentialVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <rect x="50" y="30" width="100" height="100" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="50" y="30" width="100" height="28" rx="6" fill="currentColor" opacity="0.08" />
      <text x="100" y="49" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.6">CREDENTIAL PDA</text>
      {[
        ["wallet", "HHDs...Wg1"],
        ["kyc_level", "3 · full"],
        ["aml_score", "95 / 100"],
        ["jurisdiction", "CH"],
        ["expires_at", "2027-03-29"],
        ["status", "ACTIVE"],
      ].map(([k, v], i) => (
        <g key={k}>
          <text x="62" y={76 + i * 13} fontSize="6.5" fontFamily="monospace" fill="currentColor" opacity="0.4">{k}</text>
          <text x="138" y={76 + i * 13} textAnchor="end" fontSize="6.5" fontFamily="monospace" fill="currentColor" opacity="0.8">{v}</text>
        </g>
      ))}
      <circle cx="100" cy="155" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function TravelVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <rect x="20" y="20" width="75" height="55" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="57" y="38" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">TRAVEL RULE</text>
      <text x="57" y="50" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">PDA</text>
      <text x="57" y="64" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.8">≥ 1,000 USDC</text>
      <rect x="105" y="20" width="75" height="55" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="142" y="38" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">DEPOSIT</text>
      <text x="142" y="50" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">INSTRUCTION</text>
      <text x="142" y="64" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.8">verifies PDA</text>
      <line x1="95" y1="47" x2="105" y2="47" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <polygon points="103,44 107,47 103,50" fill="currentColor" opacity="0.4" />
      <rect x="60" y="100" width="80" height="40" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="100" y="116" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">consumed: true</text>
      <text x="100" y="130" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.7">replay blocked</text>
      <line x1="57" y1="75" x2="80" y2="100" stroke="currentColor" strokeWidth="1" opacity="0.3" strokeDasharray="3 2" />
      <line x1="142" y1="75" x2="120" y2="100" stroke="currentColor" strokeWidth="1" opacity="0.3" strokeDasharray="3 2" />
    </svg>
  );
}

function CustodyVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <rect x="70" y="55" width="60" height="60" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="100" y="80" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">VAULT PDA</text>
      <text x="100" y="92" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.8">GOLD-mock</text>
      <text x="100" y="104" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">in custody</text>
      <rect x="10" y="20" width="50" height="30" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="35" y="39" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.7">Institution A</text>
      <rect x="140" y="20" width="50" height="30" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="165" y="39" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.7">Institution B</text>
      <line x1="60" y1="35" x2="70" y2="70" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <polygon points="68,67 72,72 76,67" fill="currentColor" opacity="0.4" />
      <line x1="130" y1="70" x2="140" y2="35" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <polygon points="128,67 132,72 136,67" fill="currentColor" opacity="0.4" />
      <text x="35" y="58" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">VAULT-GOLD</text>
      <text x="165" y="58" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">VAULT-GOLD</text>
      <circle r="3" fill="currentColor" opacity="0.7">
        <animateMotion dur="2s" repeatCount="indefinite">
          <mpath href="#custodyPath" />
        </animateMotion>
      </circle>
      <path id="custodyPath" d="M 60 35 L 70 70 L 130 70 L 140 35" fill="none" />
    </svg>
  );
}

function TransferVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <rect x="10" y="55" width="55" height="50" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="37" y="75" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">SENDER</text>
      <text x="37" y="87" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.7">KYC ✓</text>
      <text x="37" y="99" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.7">AML ✓</text>
      <rect x="135" y="55" width="55" height="50" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="162" y="75" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.5">RECEIVER</text>
      <text x="162" y="87" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.7">KYC ✓</text>
      <text x="162" y="99" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.7">AML ✓</text>
      <rect x="75" y="65" width="50" height="30" rx="3" fill="currentColor" opacity="0.06" stroke="currentColor" strokeWidth="1.5" />
      <text x="100" y="83" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.7">VAULT</text>
      <line x1="65" y1="80" x2="75" y2="80" stroke="currentColor" strokeWidth="1.5" opacity="0.5" strokeDasharray="3 2">
        <animate attributeName="stroke-dashoffset" values="0;-6" dur="0.4s" repeatCount="indefinite" />
      </line>
      <line x1="125" y1="80" x2="135" y2="80" stroke="currentColor" strokeWidth="1.5" opacity="0.5" strokeDasharray="3 2">
        <animate attributeName="stroke-dashoffset" values="0;-6" dur="0.4s" repeatCount="indefinite" />
      </line>
      <circle r="3" fill="currentColor">
        <animateMotion dur="1.5s" repeatCount="indefinite">
          <mpath href="#transferPath" />
        </animateMotion>
      </circle>
      <path id="transferPath" d="M 65 80 L 135 80" fill="none" />
      <text x="100" y="140" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="currentColor" opacity="0.4">both verified on-chain</text>
    </svg>
  );
}

function AnimatedVisual({ type }: { type: string }) {
  switch (type) {
    case "nav": return <NavVisual />;
    case "credential": return <CredentialVisual />;
    case "travel": return <TravelVisual />;
    case "custody": return <CustodyVisual />;
    case "transfer": return <TransferVisual />;
    default: return <NavVisual />;
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

  return (
    <div
      ref={cardRef}
      className={`group relative transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      }`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className={`flex flex-col lg:flex-row gap-8 lg:gap-16 py-12 lg:py-20 border-b border-foreground/10 ${
        feature.badge ? "relative" : ""
      }`}>
        {feature.badge && (
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
            Two products.
            <br />
            <span className="text-muted-foreground">One compliance layer.</span>
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
