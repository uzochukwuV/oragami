'use client';

import { useState } from 'react';
import { ChevronDown, LogOut, Shield, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWalletStore, useTruncatedPublicKey, type ComplianceTier } from '../model/store';

export function WalletButton({ className = '' }: { className?: string }) {
  const { connected, connecting, setConnecting, disconnect, complianceTier, setComplianceTier } = useWalletStore();
  const truncatedKey = useTruncatedPublicKey();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    const phantom = (window as any).solana;
    if (!phantom?.isPhantom) {
      window.open('https://phantom.app/', '_blank');
      setConnecting(false);
      return;
    }
    try {
      const response = await phantom.connect();
      const publicKey = response.publicKey.toBase58();
      const signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
        const result = await phantom.signMessage(message);
        return result.signature;
      };
      useWalletStore.getState().connect(publicKey, signMessage);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setConnecting(false);
    }
  };

  if (!connected) {
    return (
      <button
        onClick={handleConnect}
        disabled={connecting}
        className={`flex items-center gap-2 px-4 py-2 bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {connecting ? (
          <span className="animate-spin h-3 w-3 border border-background border-t-transparent rounded-full" />
        ) : null}
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-2 px-4 py-2 border border-foreground/20 hover:border-foreground font-mono text-xs transition-colors ${className}`}
      >
        {complianceTier === 'enterprise'
          ? <ShieldCheck className="h-3 w-3" />
          : <Shield className="h-3 w-3 text-muted-foreground" />
        }
        <span>{truncatedKey}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 top-full mt-1 w-48 bg-background border border-foreground/10 shadow-lg z-50"
          >
            {/* Tier selection */}
            <div className="p-2 border-b border-foreground/10">
              <p className="font-mono text-xs text-muted-foreground px-2 pb-1 uppercase tracking-widest">Tier</p>
              {(['basic', 'enterprise'] as ComplianceTier[]).map((tier) => (
                <button
                  key={tier}
                  onClick={() => { setComplianceTier(tier); setShowDropdown(false); }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 font-mono text-xs transition-colors ${
                    complianceTier === tier ? 'bg-foreground/5' : 'hover:bg-foreground/5'
                  }`}
                >
                  {tier === 'enterprise' ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3 text-muted-foreground" />}
                  <span className="capitalize">{tier}</span>
                </button>
              ))}
            </div>
            {/* Disconnect */}
            <div className="p-2">
              <button
                onClick={() => { disconnect(); setShowDropdown(false); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 font-mono text-xs text-destructive-foreground hover:bg-foreground/5 transition-colors"
              >
                <LogOut className="h-3 w-3" />
                Disconnect
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
