'use client';

import { useState, useCallback } from 'react';
import { Search, AlertCircle } from 'lucide-react';

const DEMO_ADDRESSES = {
  blocked: '4oS78GPe66RqBduuAeiMFANf27FpmgXNwokZ3ocN4z1B',
  clean: 'HvwC9QSAzwEXkUkwqNNGhfNHoVqXJYfPvPZfQvJmHWcF',
} as const;

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface ScanInputProps {
  onScan: (address: string) => void;
  error?: string | null;
}

export function ScanInput({ onScan, error }: ScanInputProps) {
  const [address, setAddress] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const isValid = BASE58_REGEX.test(address);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { setValidationError('Invalid Solana address format'); return; }
    setValidationError(null);
    onScan(address);
  }, [address, isValid, onScan]);

  const handleDemo = useCallback((demo: string) => {
    setAddress(demo);
    setValidationError(null);
    onScan(demo);
  }, [onScan]);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          Wallet Address
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Enter Solana wallet address..."
            value={address}
            onChange={(e) => { setAddress(e.target.value); setValidationError(null); }}
            className="w-full px-0 py-3 bg-transparent border-0 border-b border-foreground/20 focus:border-foreground outline-none font-mono text-sm placeholder:text-foreground/30 transition-colors pr-8"
          />
          <Search className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
        {(validationError || error) && (
          <div className="flex items-center gap-2 font-mono text-xs text-destructive-foreground">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {validationError || error}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!address.trim()}
        className="w-full py-3 bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Search className="h-3 w-3" />
        Scan Wallet
      </button>

      <div className="space-y-2">
        <p className="font-mono text-xs text-muted-foreground text-center">Quick demo</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleDemo(DEMO_ADDRESSES.clean)}
            className="py-2 border border-foreground/10 hover:border-foreground/30 font-mono text-xs transition-colors"
          >
            Clean wallet
          </button>
          <button
            type="button"
            onClick={() => handleDemo(DEMO_ADDRESSES.blocked)}
            className="py-2 border border-foreground/10 hover:border-foreground/30 font-mono text-xs transition-colors"
          >
            Blocked wallet
          </button>
        </div>
      </div>
    </form>
  );
}
