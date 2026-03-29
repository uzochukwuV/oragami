'use client';

import { useState, useCallback } from 'react';
import { ShieldX, Copy, Check, ArrowLeft } from 'lucide-react';
import type { BlockedResponse } from '@/types/risk-check';

export function BlockedResult({ result, onReset }: { result: BlockedResponse; onReset: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(result.address); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }, [result.address]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border border-foreground/20 bg-foreground/5">
        <ShieldX className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-mono text-xs tracking-widest uppercase">Blocked</p>
          <p className="text-sm text-muted-foreground mt-0.5">Flagged in internal blocklist</p>
        </div>
      </div>

      {/* Address */}
      <div className="space-y-1">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Address</p>
        <div className="flex items-center justify-between py-2 border-b border-foreground/10">
          <code className="font-mono text-sm">
            {result.address.slice(0, 12)}...{result.address.slice(-8)}
          </code>
          <button onClick={handleCopy} className="p-1 hover:bg-foreground/5 transition-colors">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Reason */}
      <div className="space-y-1">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Reason</p>
        <p className="text-sm py-2 border-b border-foreground/10">{result.reason}</p>
      </div>

      {/* Warning */}
      <p className="font-mono text-xs text-muted-foreground border-l-2 border-foreground/20 pl-3">
        Deposits from this wallet will be rejected by the compliance gate.
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
