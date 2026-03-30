"use client";

import { useEffect, useRef, useState } from "react";

const steps = [
  {
    number: "I",
    title: "Get credentialed once",
    description:
      "The vault authority issues a soulbound ComplianceCredential PDA to your institution wallet. KYC level, AML score, jurisdiction, and expiry stored on-chain. One credential gates both the yield vault and the custody vault. No credential — no entry. Enforced at the contract level.",
    code: `// Soulbound on-chain credential
// Seeds: ["credential", wallet] — one per institution
await program.methods
  .issueCredential(
    toBytes64("AMINA Bank AG"),
    toBytes4("CH"),
    3,   // tier: institutional
    3,   // kyc_level: full
    95,  // aml_coverage: 95/100
    expiresAt
  )
  .accounts({
    vaultState: vaultStatePda,
    credential: credentialPda, // derived from wallet
    authority: vaultAuthority,
  })
  .rpc();

// Stored on-chain:
// ✓ KYC level 3 (full)
// ✓ AML score 95/100
// ✓ Jurisdiction: CH
// ✓ Expires: 2027-03-29
// ✓ Gates: yield vault + custody vault`,
  },
  {
    number: "II",
    title: "Deposit USDC, earn Gold + USX yield",
    description:
      "Deposit USDC into the yield vault. Receive cVAULT priced against a live basket: 50% Gold + 30% CHF/USD from SIX Exchange + 20% Solstice eUSX. 70% of USDC routes to Solstice USX for carry yield. NAV updates on-chain every 2 minutes from authenticated SIX mTLS feed.",
    code: `// Deposit 10,000 USDC into yield vault
// Current NAV: $1.043 (gold up 4.3%)
// cVAULT received = 10000 * 10000 / 10430
//                 = 9587.73 cVAULT

await program.methods
  .deposit({ amount: new BN(10_000_000_000), nonce })
  .accounts({
    vaultState,
    cvaultMint,
    vaultTokenAccount,      // ← USDC enters vault
    payerDepositAccount,    // ← USDC leaves here
    payerCvaultAccount,     // ← cVAULT arrives here
    investorCredential,     // ← verified on-chain
  })
  .rpc();

// On-chain:
// ✓ Credential: active, not expired
// ✓ 10,000 USDC in vault
// ✓ 7,000 USDC → Solstice USX (70% alloc)
// ✓ 9,587.73 cVAULT minted at NAV $1.043
// ✓ Earning: gold NAV + USX carry yield`,
  },
  {
    number: "III",
    title: "Deposit tokenized assets, vault holds custody",
    description:
      "Deposit tokenized Gold into the custody vault. The vault PDA takes on-chain custody of the asset tokens. VAULT-GOLD shares are minted at the current SIX Exchange NAV. The vault is now the custodian — the asset never leaves until redemption.",
    code: `// Deposit 1,000 GOLD-mock into custody vault
// Current NAV: $1.00 per share
// Vault receives: 1,000 GOLD-mock tokens
// Institution receives: 1,000 VAULT-GOLD

await program.methods
  .deposit(new BN(1_000_000_000))
  .accounts({
    assetVault: goldVaultPda,
    shareMint: vaultGoldMint,
    vaultTokenAccount,      // ← gold enters custody
    depositorAssetAccount,  // ← gold leaves here
    depositorShareAccount,  // ← VAULT-GOLD arrives
    credential: credentialPda,
  })
  .rpc();

// On-chain:
// ✓ Credential verified
// ✓ 1,000 GOLD-mock in vault custody
// ✓ 1,000 VAULT-GOLD minted to institution
// ✓ Vault is sole custodian`,
  },
  {
    number: "IV",
    title: "Transfer positions — both sides verified",
    description:
      "Institution A transfers VAULT-GOLD to Institution B. The vault verifies both credentials on-chain before any token moves — sender active, receiver active, neither expired. The underlying gold never moves. The vault remains custodian. Zero counterparty risk. Full audit trail on-chain.",
    code: `// Institution A transfers 500 VAULT-GOLD to B
// Both must hold active credentials
// Underlying gold stays in vault custody

await program.methods
  .transferShares(new BN(500_000_000))
  .accounts({
    assetVault: goldVaultPda,
    senderShareAccount,    // Institution A
    receiverShareAccount,  // Institution B
    senderCredential,      // ✓ A: KYC active
    receiverCredential,    // ✓ B: KYC active
    sender: institutionA,
  })
  .rpc();

// On-chain:
// ✓ Sender credential: active, not expired
// ✓ Receiver credential: active, not expired
// ✓ 500 VAULT-GOLD: A → B
// ✓ Gold stays in vault — vault is CCP
// ✓ TransferMade event emitted`,
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
            Four steps.
            <br />
            <span className="text-background/50">Vault as central counterparty.</span>
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
                <span className="text-xs font-mono text-background/40">
                  {activeStep <= 1 ? "ihUcHpWk... oragami-vault" : "6Mbzwuw8... multi-asset-vault"}
                </span>
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
