"use client";

import { useEffect, useRef, useState } from "react";

// ─── Product 1: Yield Vault ───────────────────────────────────────────────────

function YieldVaultDiagram() {
  return (
    <div className="border border-foreground/10 p-6 space-y-4 font-mono text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">You deposit</span>
        <span className="text-foreground">10,000 USDC</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground/40">
        <div className="flex-1 h-px bg-foreground/10" />
        <span>NAV = $1.043</span>
        <div className="flex-1 h-px bg-foreground/10" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">You receive</span>
        <span className="text-foreground">9,587.73 cVAULT</span>
      </div>
      <div className="border-t border-foreground/10 pt-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">7,000 USDC</span>
          <span className="text-green-500">→ Solstice USX (~5% APY)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">3,000 USDC</span>
          <span className="text-foreground/60">→ liquidity buffer</span>
        </div>
      </div>
      <div className="border-t border-foreground/10 pt-4 space-y-1">
        <p className="text-muted-foreground/60">cVAULT NAV basket</p>
        <div className="flex gap-1 h-3">
          <div className="bg-foreground/80 rounded-sm" style={{ width: "50%" }} title="Gold 50%" />
          <div className="bg-foreground/40 rounded-sm" style={{ width: "30%" }} title="CHF 30%" />
          <div className="bg-foreground/20 rounded-sm" style={{ width: "20%" }} title="eUSX 20%" />
        </div>
        <div className="flex justify-between text-muted-foreground/50">
          <span>50% Gold (XAU)</span>
          <span>30% CHF</span>
          <span>20% eUSX</span>
        </div>
      </div>
    </div>
  );
}

// ─── Product 2: Custody Vault ─────────────────────────────────────────────────

function CustodyDiagram() {
  return (
    <div className="border border-foreground/10 p-6 space-y-4 font-mono text-xs">
      <div className="grid grid-cols-3 gap-2 items-center text-center">
        <div className="border border-foreground/10 p-3 space-y-1">
          <p className="text-muted-foreground/60">Institution A</p>
          <p className="text-foreground">1,000 GOLD</p>
        </div>
        <div className="text-muted-foreground/40 text-center">→</div>
        <div className="border border-foreground/20 p-3 space-y-1 bg-foreground/[0.03]">
          <p className="text-muted-foreground/60">Vault PDA</p>
          <p className="text-foreground">custody</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground/40">
        <div className="flex-1 h-px bg-foreground/10" />
        <span>mints at NAV</span>
        <div className="flex-1 h-px bg-foreground/10" />
      </div>
      <div className="grid grid-cols-3 gap-2 items-center text-center">
        <div className="border border-foreground/10 p-3 space-y-1">
          <p className="text-muted-foreground/60">Institution A</p>
          <p className="text-green-500">1,000 VAULT-GOLD</p>
        </div>
        <div className="text-muted-foreground/40 text-center">→ transfer →</div>
        <div className="border border-foreground/10 p-3 space-y-1">
          <p className="text-muted-foreground/60">Institution B</p>
          <p className="text-green-500">500 VAULT-GOLD</p>
        </div>
      </div>
      <div className="border-t border-foreground/10 pt-3 text-muted-foreground/50 text-center">
        Both KYC credentials verified on-chain before transfer executes
      </div>
    </div>
  );
}

// ─── Compliance ───────────────────────────────────────────────────────────────

function ComplianceDiagram() {
  return (
    <div className="border border-foreground/10 p-6 space-y-3 font-mono text-xs">
      {[
        { step: "1", label: "Connect wallet", status: "done" },
        { step: "2", label: "Submit institution details", status: "done" },
        { step: "3", label: "KYC/AML credential issued on-chain", status: "done" },
        { step: "4", label: "Credential PDA: [\"credential\", wallet]", status: "active" },
        { step: "5", label: "Access both vaults", status: "pending" },
      ].map((item) => (
        <div key={item.step} className="flex items-center gap-3">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
            item.status === "done" ? "bg-green-500/20 text-green-500" :
            item.status === "active" ? "bg-foreground/10 text-foreground" :
            "bg-foreground/5 text-muted-foreground/40"
          }`}>{item.step}</span>
          <span className={item.status === "pending" ? "text-muted-foreground/40" : "text-muted-foreground"}>{item.label}</span>
        </div>
      ))}
      <div className="border-t border-foreground/10 pt-3 space-y-1 text-muted-foreground/50">
        <p>Deposits ≥ 1,000 USDC: Travel Rule PDA required</p>
        <p>Secondary market: Token-2022 transfer hook enforces KYC</p>
      </div>
    </div>
  );
}

// ─── Reserve Attestation ──────────────────────────────────────────────────────

function ReserveDiagram() {
  return (
    <div className="border border-foreground/10 p-6 space-y-3 font-mono text-xs">
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground/60">ReserveAttestation PDA</span>
        <span className="text-green-500 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          fresh
        </span>
      </div>
      {[
        ["attestation_hash", "matches RWA registry"],
        ["gold_units_held", "3,312,500 μg equiv."],
        ["usdc_value_bps", "10,430"],
        ["attested_at", "< 24h ago"],
        ["attested_by", "vault operator"],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between">
          <span className="text-muted-foreground/50">{k}</span>
          <span className="text-foreground/80">{v}</span>
        </div>
      ))}
      <div className="border-t border-foreground/10 pt-3 text-muted-foreground/50">
        verify_proof_of_reserve checks all three: financial solvency + attestation freshness + hash integrity
      </div>
    </div>
  );
}

const sections = [
  {
    tag: "Product 01",
    headline: "Deposit USDC. Earn gold appreciation and yield.",
    body: "cVAULT is a NAV-priced token. Its price tracks a basket of Gold (50%), CHF (30%), and Solstice eUSX (20%) — sourced from SIX Exchange via authenticated mTLS every 2 minutes. At the same time, 70% of your USDC is deployed to Solstice USX, earning carry yield. You hold one token and capture both.",
    diagram: <YieldVaultDiagram />,
    badge: null,
  },
  {
    tag: "Product 02",
    headline: "Deposit tokenized assets. Vault holds custody.",
    body: "The custody vault accepts tokenized Gold, Silver, or T-bills directly. The vault PDA takes on-chain custody of the asset — it never moves until you redeem. You receive VAULT-GOLD shares priced at live NAV. Transfer your position to another institution through the vault as central counterparty. Zero bilateral counterparty risk.",
    diagram: <CustodyDiagram />,
    badge: "GOLD · SILVER live on devnet",
  },
  {
    tag: "Compliance",
    headline: "One credential. Both products. No off-chain bypass.",
    body: "Every institution wallet holds a soulbound on-chain credential — KYC level, AML score, jurisdiction, expiry. The deposit instruction derives it from your wallet key, so you cannot pass a fake. Deposits above 1,000 USDC require a Travel Rule PDA. Secondary market transfers are blocked at the token level by a Token-2022 transfer hook.",
    diagram: <ComplianceDiagram />,
    badge: null,
  },
  {
    tag: "Proof of Reserve",
    headline: "Gold backing verified on-chain every 2 minutes.",
    body: "cVAULT is not just liquid-asset-backed — it is gold-attested. After every NAV update, the crank posts a ReserveAttestation PDA with the custodian's attestation hash, gold quantity, and timestamp. verify_proof_of_reserve checks financial solvency, attestation freshness (< 24h), and hash integrity against the RWA registry. Any institution or auditor can call it.",
    diagram: <ReserveDiagram />,
    badge: null,
  },
];

function Section({ s, index }: { s: typeof sections[0]; index: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`grid lg:grid-cols-2 gap-12 lg:gap-20 py-16 lg:py-24 border-b border-foreground/10 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
      style={{ transitionDelay: `${index * 50}ms` }}
    >
      {/* Text */}
      <div className="flex flex-col justify-center space-y-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{s.tag}</span>
          {s.badge && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-mono bg-green-500/10 text-green-500 border border-green-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {s.badge}
            </span>
          )}
        </div>
        <h3 className="text-3xl lg:text-4xl font-display leading-tight">{s.headline}</h3>
        <p className="text-lg text-muted-foreground leading-relaxed">{s.body}</p>
      </div>

      {/* Diagram */}
      <div className="flex items-center">
        {s.diagram}
      </div>
    </div>
  );
}

export function FeaturesSection() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section id="features" ref={ref} className="relative py-24 lg:py-32">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-20">
          <span className="inline-flex items-center gap-3 text-xs font-mono tracking-widest text-muted-foreground uppercase mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            What we built
          </span>
          <h2 className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            Institutional RWA infrastructure.
            <br />
            <span className="text-muted-foreground">Built on Solana.</span>
          </h2>
        </div>
        {sections.map((s, i) => <Section key={s.tag} s={s} index={i} />)}
      </div>
    </section>
  );
}
