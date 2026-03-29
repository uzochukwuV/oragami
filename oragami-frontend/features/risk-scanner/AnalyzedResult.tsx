'use client';

import { useState, useCallback } from 'react';
import { ShieldCheck, AlertTriangle, Copy, Check, ArrowLeft, ExternalLink } from 'lucide-react';
import type { AnalyzedResponse } from '@/types/risk-check';
import { getRiskColor } from '@/types/risk-check';

export function AnalyzedResult({ result, onReset }: { result: AnalyzedResponse; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const riskColor = getRiskColor(result.risk_score);
  const isHighRisk = result.risk_score >= 6;

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(result.address); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }, [result.address]);

  const riskLabel = riskColor === 'green' ? 'Low' : riskColor === 'yellow' ? 'Medium' : 'High';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border border-foreground/20 bg-foreground/5">
        {isHighRisk
          ? <AlertTriangle className="h-5 w-5 shrink-0" />
          : <ShieldCheck className="h-5 w-5 shrink-0" />
        }
        <div>
          <p className="font-mono text-xs tracking-widest uppercase">
            {isHighRisk ? 'Elevated Risk' : 'Analysis Complete'}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isHighRisk ? 'Review recommended before depositing' : 'Wallet passed compliance checks'}
          </p>
        </div>
        {result.from_cache && (
          <span className="ml-auto font-mono text-xs text-muted-foreground border border-foreground/10 px-2 py-0.5">cached</span>
        )}
      </div>

      {/* Address */}
      <div className="flex items-center justify-between py-2 border-b border-foreground/10">
        <code className="font-mono text-sm">{result.address.slice(0, 12)}...{result.address.slice(-8)}</code>
        <div className="flex items-center gap-2">
          <button onClick={handleCopy} className="p-1 hover:bg-foreground/5 transition-colors">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
          <a href={`https://explorer.solana.com/address/${result.address}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-foreground/5 transition-colors">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-px bg-foreground/10">
        {[
          { label: 'Risk Score', value: `${result.risk_score}/10` },
          { label: 'Risk Level', value: riskLabel },
          { label: 'Sanctioned', value: result.has_sanctioned_assets ? 'Detected' : result.helius_assets_checked ? 'None' : 'N/A' },
        ].map((m) => (
          <div key={m.label} className="bg-background p-4 text-center">
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-2">{m.label}</p>
            <p className="font-display text-2xl">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Breakdown */}
      <div className="space-y-2">
        {[
          { label: 'Internal Blocklist', value: 'Clean', ok: true },
          { label: 'Range Protocol', value: `Score ${result.risk_score} — ${result.risk_level}`, ok: result.risk_score < 6 },
          { label: 'Helius DAS', value: !result.helius_assets_checked ? 'Unavailable' : result.has_sanctioned_assets ? 'Sanctioned assets' : 'No sanctioned assets', ok: !result.has_sanctioned_assets },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between py-2 border-b border-foreground/5 last:border-0">
            <span className="font-mono text-xs text-muted-foreground">{item.label}</span>
            <span className={`font-mono text-xs ${item.ok ? 'text-green-600' : 'text-destructive-foreground'}`}>{item.value}</span>
          </div>
        ))}
      </div>

      <p className="font-mono text-xs text-muted-foreground text-center">
        Checked {new Date(result.checked_at).toLocaleString()}
      </p>

      <button
        onClick={onReset}
        className="w-full py-3 border border-foreground/20 hover:border-foreground font-mono text-xs tracking-widest uppercase transition-colors flex items-center justify-center gap-2"
      >
        <ArrowLeft className="h-3 w-3" />
        Scan another wallet
      </button>
    </div>
  );
}
