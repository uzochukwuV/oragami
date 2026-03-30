"use client";

import { useEffect, useRef, useState } from "react";

const steps = [
  {
    number: "01",
    tag: "Onboarding",
    title: "Get your institution credentialed",
    description: "Connect your Phantom wallet and submit your institution details. The vault authority issues a soulbound credential to your wallet on-chain — KYC level, AML score, jurisdiction, expiry. One credential unlocks both products. No credential, no access.",
    detail: "Takes about 30 seconds. The credential PDA is derived from your wallet key — it cannot be faked or transferred.",
  },
  {
    number: "02",
    tag: "Yield Vault",
    title: "Deposit USDC, receive cVAULT",
    description: "Deposit any amount of USDC. You receive cVAULT tokens priced at the current NAV — which reflects live Gold and CHF prices from SIX Exchange. 70% of your USDC is deployed to Solstice USX to earn carry yield. Your cVAULT appreciates as gold rises and accrues yield daily.",
    detail: "NAV updates every 2 minutes. Redeem at any time — no lock-up, no credential check on exit.",
  },
  {
    number: "03",
    tag: "Custody Vault",
    title: "Deposit tokenized assets, vault takes custody",
    description: "Deposit tokenized Gold or Silver into the custody vault. The vault PDA takes on-chain custody of your asset tokens. You receive VAULT-GOLD shares at the current NAV. The underlying gold never moves until you redeem — the vault is the custodian throughout.",
    detail: "GOLD and SILVER vaults are live on devnet. T-bill vault coming next.",
  },
  {
    number: "04",
    tag: "Custody Vault",
    title: "Transfer positions between institutions",
    description: "Transfer VAULT-GOLD to another credentialed institution. The vault verifies both your credential and the receiver's credential on-chain before the transfer executes. The underlying gold stays in vault custody — only the share token changes hands. Zero counterparty risk.",
    detail: "If either credential is expired or revoked, the transfer is rejected at the contract level. No off-chain override.",
  },
];

export function HowItWorksSection() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setActive((p) => (p + 1) % steps.length), 5000);
    return () => clearInterval(t);
  }, []);

  const step = steps[active];

  return (
    <section id="how-it-works" ref={ref} className="relative py-24 lg:py-32 bg-foreground text-background overflow-hidden">
      <div className="absolute inset-0 opacity-[0.025] pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 40px, currentColor 40px, currentColor 41px)" }} />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-20">
          <span className="inline-flex items-center gap-3 text-xs font-mono tracking-widest text-background/40 uppercase mb-6">
            <span className="w-8 h-px bg-background/30" />
            How it works
          </span>
          <h2 className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            From wallet to yield
            <br />
            <span className="text-background/40">in four steps.</span>
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">

          {/* Step list */}
          <div>
            {steps.map((s, i) => (
              <button
                key={s.number}
                type="button"
                onClick={() => setActive(i)}
                className={`w-full text-left py-7 border-b border-background/10 transition-all duration-300 group ${active === i ? "opacity-100" : "opacity-35 hover:opacity-60"}`}
              >
                <div className="flex items-start gap-5">
                  <span className="font-mono text-xs text-background/30 mt-1 shrink-0">{s.number}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 ${s.tag === "Yield Vault" ? "bg-background/10 text-background/60" : s.tag === "Custody Vault" ? "bg-background/10 text-background/60" : "bg-background/5 text-background/40"}`}>
                        {s.tag}
                      </span>
                    </div>
                    <h3 className="text-xl lg:text-2xl font-display mb-2">{s.title}</h3>
                    <p className="text-background/50 text-sm leading-relaxed">{s.description}</p>
                    {active === i && (
                      <div className="mt-4 h-px bg-background/10 overflow-hidden">
                        <div className="h-full bg-background/40" style={{ animation: "progress 5s linear forwards", width: "0%" }} />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          <div className="lg:sticky lg:top-32 self-start">
            <div className="border border-background/10 overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-background/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-background/30">{step.number}</span>
                  <span className="font-mono text-xs tracking-widest text-background/50 uppercase">{step.tag}</span>
                </div>
                <div className="flex gap-1.5">
                  {steps.map((_, i) => (
                    <button key={i} onClick={() => setActive(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === active ? "bg-background/60" : "bg-background/20"}`} />
                  ))}
                </div>
              </div>

              {/* Content */}
              <div className="p-8 min-h-[280px] flex flex-col justify-between gap-8">
                <div key={active} className="space-y-4" style={{ animation: "fadeIn 0.4s ease forwards" }}>
                  <h4 className="text-2xl font-display">{step.title}</h4>
                  <p className="text-background/60 leading-relaxed">{step.description}</p>
                </div>
                <div className="border-t border-background/10 pt-6">
                  <p className="text-xs font-mono text-background/40 leading-relaxed">{step.detail}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-background/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-mono text-background/30">Solana devnet</span>
                </div>
                <a href="/onboard/connect" className="text-xs font-mono text-background/40 hover:text-background/70 transition-colors">
                  Start onboarding →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes progress { from { width: 0%; } to { width: 100%; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </section>
  );
}
