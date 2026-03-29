'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, ArrowLeft, Settings } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { VaultStatsBar } from '@/features/vault/VaultStatsBar';
import { VaultPanel } from '@/features/vault/VaultPanel';
import { RiskScanner } from '@/features/risk-scanner';
import { WalletButton } from '@/features/wallet/ui/WalletButton';
import { useVaultState } from '@/features/vault/useVaultState';

// ─── Risk Scanner Overlay ────────────────────────────────────────────────────

function RiskScannerOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-xl z-50 overflow-y-auto bg-background border-l border-foreground/10"
          >
            <div className="p-6 pt-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-2xl">Wallet Risk Scanner</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-foreground/5 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <RiskScanner />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Main App Page ────────────────────────────────────────────────────────────

export default function AppPage() {
  const [isRiskScannerOpen, setIsRiskScannerOpen] = useState(false);
  const { stats, basket, isLoading, refresh } = useVaultState();

  const handleVaultUpdate = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-background">
      {/* App Header — matches landing nav style */}
      <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur-sm border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="flex items-center justify-between h-14">
            {/* Left — back to landing + brand */}
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                <span className="hidden sm:inline">Back</span>
              </Link>
              <div className="h-4 w-px bg-foreground/10" />
              <div className="flex items-center gap-2">
                <span className="font-display text-lg">Oragami</span>
                <span className="text-xs text-muted-foreground font-mono">Vault</span>
              </div>
              {/* Devnet badge */}
              <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                DEVNET
              </span>
            </div>

            {/* Right — asset vaults + risk scanner + wallet */}
            <div className="flex items-center gap-3">
              <Link
                href="/app/vaults"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors border border-foreground/10"
              >
                <span className="hidden sm:inline">Asset Vaults</span>
                <span className="px-1.5 py-0.5 text-xs font-mono bg-green-500/10 text-green-500 rounded-full">NEW</span>
              </Link>
              <button
                onClick={() => setIsRiskScannerOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors border border-foreground/10"
              >
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">Risk Scanner</span>
              </button>
              <WalletButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1400px] mx-auto px-6 lg:px-12 py-8 space-y-6">

        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="font-display text-3xl lg:text-4xl tracking-tight">
            Vault Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Deposit USDC · Mint cVAULT at live NAV · Earn yield via Solstice USX
          </p>
        </motion.div>

        {/* Live vault stats — NAV, TVL, basket */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <VaultStatsBar
            stats={stats}
            basket={basket}
            isLoading={isLoading}
            onRefresh={refresh}
          />
        </motion.div>

        {/* Vault operations + info */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6"
        >
          {/* Left — Vault Panel (Deposit / Redeem / Convert) */}
          <VaultPanel stats={stats} onVaultUpdate={handleVaultUpdate} />

          {/* Right — Vault info cards using oragami-frontend design */}
          <div className="space-y-4">
            {/* Basket composition */}
            <div className="border border-foreground/10 p-6">
              <h3 className="font-display text-xl mb-4">RWA Basket Composition</h3>
              <div className="space-y-3">
                {basket.map((asset) => (
                  <div key={asset.symbol} className="flex items-center justify-between py-3 border-b border-foreground/5 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground w-8">{asset.weight}%</span>
                      <div>
                        <p className="text-sm font-medium">{asset.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{asset.symbol}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {asset.price != null ? (
                        <p className="text-sm font-mono">
                          {asset.symbol === 'XAU'
                            ? `$${asset.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz`
                            : `$${asset.price.toFixed(4)}`}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Loading...</p>
                      )}
                      <p className="text-xs text-muted-foreground">via SIX Exchange</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance info */}
            <div className="border border-foreground/10 p-6">
              <h3 className="font-display text-xl mb-4">Compliance Requirements</h3>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'KYC Credential', value: 'Required on-chain before deposit', status: 'required' },
                  { label: 'AML Coverage', value: 'Minimum score 80/100', status: 'required' },
                  { label: 'Travel Rule', value: 'Required for deposits ≥ 1,000 USDC', status: 'conditional' },
                  { label: 'Credential Expiry', value: 'Auto-checked on every deposit', status: 'auto' },
                ].map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-4 py-2 border-b border-foreground/5 last:border-0">
                    <span className="text-muted-foreground">{item.label}</span>
                    <div className="text-right">
                      <span className="text-xs">{item.value}</span>
                      <span className={`block text-xs font-mono mt-0.5 ${
                        item.status === 'required' ? 'text-yellow-500' :
                        item.status === 'conditional' ? 'text-blue-400' : 'text-green-500'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Yield info */}
            <div className="border border-foreground/10 p-6">
              <h3 className="font-display text-xl mb-4">Yield Strategy</h3>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Target APY', value: `${stats.apy.toFixed(1)}%` },
                  { label: 'USX Allocation', value: stats.usxAllocationPct },
                  { label: 'Yield Token', value: 'Solstice eUSX' },
                  { label: 'Distribution', value: 'Daily on-chain accrual' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-foreground/5 last:border-0">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-mono text-xs">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Solscan link */}
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground font-mono">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Devnet</span>
          <span className="text-foreground/20">·</span>
          <a
            href="https://explorer.solana.com/address/ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP?cluster=devnet"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            ihUcHpWk... ↗
          </a>
        </div>
      </main>

      {/* Risk Scanner Overlay */}
      <RiskScannerOverlay
        isOpen={isRiskScannerOpen}
        onClose={() => setIsRiskScannerOpen(false)}
      />
    </div>
  );
}
