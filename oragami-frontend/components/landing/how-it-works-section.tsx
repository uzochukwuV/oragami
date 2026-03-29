"use client";

import { useEffect, useRef, useState } from "react";

const steps = [
  {
    number: "I",
    title: "Get your compliance credential",
    description:
      "The vault authority issues a soulbound ComplianceCredential PDA to your wallet. KYC level, AML score, jurisdiction, and expiry are stored on-chain. No credential — no deposit. This is enforced at the smart contract level.",
    code: `// Issue on-chain credential
await program.methods
  .issueCredential({
    wallet: institution.publicKey,
    institutionName: toBytes64(
      "AMINA Bank AG"
    ),
    jurisdiction: toBytes4("CH"),
    tier: 3,          // institutional
    kycLevel: 3,      // full KYC
    amlCoverage: 95,  // 0-100 score
    attestationHash,  // SHA-256 of docs
    issuedAt: now,
    expiresAt: now + 365days,
  })
  .rpc();`,
  },
  {
    number: "II",
    title: "Deposit USDC, receive cVAULT",
    description:
      "Deposit USDC into the vault. The contract checks your credential on-chain, then mints cVAULT at the current NAV price — driven by live Gold and CHF/USD data from SIX Exchange. Large deposits require Travel Rule data.",
    code: `// NAV-priced deposit
// Current NAV: $1.0430 per cVAULT
// Deposit: 100 USDC
// Receive: 95.78 cVAULT

await program.methods
  .deposit({
    amount: new BN(100_000_000), // 100 USDC
    nonce: uuidv7(),
  })
  .accounts({
    investorCredential: credentialPda,
    travelRuleData: null, // < 1000 USDC
    ...vaultAccounts,
  })
  .rpc();

// On-chain: credential verified ✓
// On-chain: cVAULT minted at NAV ✓`,
  },
  {
    number: "III",
    title: "Earn yield, trade on secondary market",
    description:
      "Yield accrues daily on-chain via process_yield. Convert cVAULT to cVAULT-TRADE to access the permissioned secondary market. Every transfer triggers the compliance hook — only whitelisted institutions can trade.",
    code: `// Daily yield accrual (backend crank)
await program.methods
  .processYield()
  .rpc();
// pending_yield += deposits
//   * usx_alloc_bps/10000
//   * apy_bps/10000 / 365

// Convert to tradeable
await program.methods
  .convertToTradeable({ amount })
  .rpc();

// Transfer hook fires on every trade:
// ✓ KYC verified
// ✓ AML clear
// ✓ Travel Rule satisfied
// ✓ Credential not expired`,
  },
];

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);
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

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-foreground text-background overflow-hidden"
    >
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 40px, currentColor 40px, currentColor 41px)`
        }} />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-background/50 mb-6">
            <span className="w-8 h-px bg-background/30" />
            Process
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Three steps.
            <br />
            <span className="text-background/50">Fully compliant on-chain.</span>
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
          <div className="space-y-0">
            {steps.map((step, index) => (
              <button
                key={step.number}
                type="button"
                onClick={() => setActiveStep(index)}
                className={`w-full text-left py-8 border-b border-background/10 transition-all duration-500 group ${
                  activeStep === index ? "opacity-100" : "opacity-40 hover:opacity-70"
                }`}
              >
                <div className="flex items-start gap-6">
                  <span className="font-display text-3xl text-background/30">{step.number}</span>
                  <div className="flex-1">
                    <h3 className="text-2xl lg:text-3xl font-display mb-3 group-hover:translate-x-2 transition-transform duration-300">
                      {step.title}
                    </h3>
                    <p className="text-background/60 leading-relaxed">{step.description}</p>
                    {activeStep === index && (
                      <div className="mt-4 h-px bg-background/20 overflow-hidden">
                        <div className="h-full bg-background w-0" style={{ animation: "progress 5s linear forwards" }} />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:sticky lg:top-32 self-start">
            <div className="border border-background/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-background/10 flex items-center justify-between">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-background/20" />
                  <div className="w-3 h-3 rounded-full bg-background/20" />
                  <div className="w-3 h-3 rounded-full bg-background/20" />
                </div>
                <span className="text-xs font-mono text-background/40">oragami-vault.ts</span>
              </div>
              <div className="p-8 font-mono text-sm min-h-[320px]">
                <pre className="text-background/70">
                  {steps[activeStep].code.split("\n").map((line, lineIndex) => (
                    <div
                      key={`${activeStep}-${lineIndex}`}
                      className="leading-loose code-line-reveal"
                      style={{ animationDelay: `${lineIndex * 80}ms` }}
                    >
                      <span className="text-background/20 select-none w-8 inline-block">{lineIndex + 1}</span>
                      <span className="inline-flex">
                        {line.split("").map((char, charIndex) => (
                          <span
                            key={`${activeStep}-${lineIndex}-${charIndex}`}
                            className="code-char-reveal"
                            style={{ animationDelay: `${lineIndex * 80 + charIndex * 15}ms` }}
                          >
                            {char === " " ? "\u00A0" : char}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </pre>
              </div>
              <div className="px-6 py-4 border-t border-background/10 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-mono text-background/40">Devnet · {`ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP`.slice(0, 8)}...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes progress { from { width: 0%; } to { width: 100%; } }
        .code-line-reveal { opacity: 0; transform: translateX(-8px); animation: lineReveal 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @keyframes lineReveal { to { opacity: 1; transform: translateX(0); } }
        .code-char-reveal { opacity: 0; filter: blur(8px); animation: charReveal 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @keyframes charReveal { to { opacity: 1; filter: blur(0); } }
      `}</style>
    </section>
  );
}
