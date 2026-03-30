"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative py-24 lg:py-32">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className={`border border-foreground p-10 lg:p-20 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>

          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

            {/* Left */}
            <div className="space-y-8">
              <h2 className="text-4xl lg:text-6xl font-display tracking-tight leading-[0.95]">
                Start earning on your gold exposure today.
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Connect your institution wallet, get credentialed in under a minute, and deposit into the yield vault or custody vault on Solana devnet.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="/onboard/connect"
                  className="inline-flex items-center justify-center gap-2 px-8 h-14 bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-foreground/90 transition-colors group"
                >
                  Get Credentialed
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
                <a
                  href="/app"
                  className="inline-flex items-center justify-center gap-2 px-8 h-14 border border-foreground/30 font-mono text-xs tracking-widest uppercase hover:border-foreground transition-colors"
                >
                  Open Vault
                </a>
              </div>
            </div>

            {/* Right — what you get */}
            <div className="space-y-4">
              {[
                {
                  label: "Yield Vault",
                  items: ["Deposit USDC", "Receive cVAULT at live gold NAV", "Earn ~5% APY from Solstice USX", "Redeem any time at current NAV"],
                },
                {
                  label: "Custody Vault",
                  items: ["Deposit tokenized Gold or Silver", "Vault holds on-chain custody", "Transfer positions to other institutions", "Both sides KYC-verified before transfer"],
                },
              ].map((product) => (
                <div key={product.label} className="border border-foreground/10 p-5 space-y-3">
                  <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{product.label}</p>
                  <ul className="space-y-1.5">
                    {product.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="w-1 h-1 rounded-full bg-foreground/40 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="font-mono text-xs text-muted-foreground/50 pt-2">
                Solana devnet · ihUcHpWk... · 6Mbzwuw8...
              </p>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
