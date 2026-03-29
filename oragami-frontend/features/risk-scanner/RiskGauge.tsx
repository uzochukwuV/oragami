'use client';

import { getRiskColor } from '@/types/risk-check';

interface RiskGaugeProps {
  score: number;
  maxScore?: number;
}

export function RiskGauge({ score, maxScore = 10 }: RiskGaugeProps) {
  const riskColor = getRiskColor(score);
  const label = riskColor === 'green' ? 'Low' : riskColor === 'yellow' ? 'Medium' : 'High';

  return (
    <div className="space-y-3">
      {/* Score */}
      <div className="flex items-baseline justify-center gap-1">
        <span className="font-display text-4xl tracking-tight">{score}</span>
        <span className="font-mono text-xs text-muted-foreground">/{maxScore}</span>
      </div>

      {/* Segment bar — filled segments use foreground, empty use foreground/10 */}
      <div className="flex items-center gap-px">
        {Array.from({ length: maxScore }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 transition-all duration-300 ${
              i < score ? 'bg-foreground' : 'bg-foreground/10'
            }`}
          />
        ))}
      </div>

      {/* Label */}
      <p className="font-mono text-xs text-muted-foreground text-center uppercase tracking-widest">
        {label} risk
      </p>
    </div>
  );
}
