"use client";

import { useEffect, useRef, useState } from "react";

function Counter({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !animated.current) {
        animated.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / 1800, 1);
          setCount(Math.floor((1 - Math.pow(1 - p, 3)) * end));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [end]);

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

const metrics = [
  {
    value: 5, suffix: "%",
    headline: "Target APY",
    sub: "Earned via Solstice USX carry yield on 70% of deposits",
  },
  {
    value: 50, suffix: "%",
    headline: "Gold weight in NAV",
    sub: "50% XAU · 30% CHF/USD · 20% eUSX — priced by SIX Exchange every 2 min",
  },
  {
    value: 100, suffix: "%",
    headline: "On-chain compliance",
    sub: "KYC, AML, Travel Rule, and transfer hooks enforced at the contract level",
  },
  {
    value: 3, suffix: "",
    headline: "Programs on devnet",
    sub: "oragami-vault · multi-asset-vault · cvault-transfer-hook",
  },
];

export function MetricsSection() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section id="studio" ref={ref} className="relative py-24 lg:py-32 border-y border-foreground/10">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">

        <div className="mb-16">
          <span className="inline-flex items-center gap-3 text-xs font-mono tracking-widest text-muted-foreground uppercase mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            By the numbers
          </span>
          <h2 className={`text-4xl lg:text-5xl font-display tracking-tight transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            What institutions get.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-foreground/10">
          {metrics.map((m, i) => (
            <div
              key={m.headline}
              className={`bg-background p-8 lg:p-12 space-y-3 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="text-6xl lg:text-7xl font-display tracking-tight">
                <Counter end={m.value} suffix={m.suffix} />
              </div>
              <p className="text-lg font-medium">{m.headline}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
