'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Scan, Shield, TrendingUp, ArrowLeftRight } from 'lucide-react';

import { SystemHealthBar } from '@/components/shared/SystemHealthBar';
import { Footer } from '@/components/shared/Footer';
import { AdminOverlay } from '@/components/dashboard/AdminOverlay';
import { AnalyticsOverview } from '@/widgets/AnalyticsOverview';
import { MetricsRow } from '@/widgets/MetricsRow';
import { Monitor } from '@/features/monitor';
import { RiskScanner } from '@/features/risk-scanner';
import { VaultStatsBar } from '@/features/vault/VaultStatsBar';
import { VaultPanel } from '@/features/vault/VaultPanel';
import { useVaultState } from '@/features/vault/useVaultState';
import { useDashboardAnalytics } from '@/hooks';

// ============================================================================
// Hero Strip — explains the product in 3 bullets
// ============================================================================

function HeroStrip() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full rounded-xl border border-primary/20 bg-primary/5 px-6 py-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground leading-tight">
            Institutional RWA Vault on Solana
          </h1>
          <p className="text-sm text-muted mt-1">
            Deposit USDC. Mint cVAULT backed by Gold + CHF + Solstice USX yield.
            Every transfer enforced on-chain by KYC/AML compliance hooks.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 shrink-0">
          <Bullet icon={<Shield className="h-4 w-4 text-primary" />} label="KYC / AML / Travel Rule" />
          <Bullet icon={<TrendingUp className="h-4 w-4 text-status-confirmed" />} label="5% APY via Solstice USX" />
          <Bullet icon={<ArrowLeftRight className="h-4 w-4 text-status-pending" />} label="Permissioned Secondary Market" />
        </div>
      </div>
    </motion.div>
  );
}

function Bullet({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs font-medium text-muted">{label}</span>
    </div>
  );
}

// ============================================================================
// Risk Scanner Overlay
// ============================================================================

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
            className="fixed right-0 top-0 bottom-0 w-full max-w-xl z-50 overflow-y-auto"
          >
            <div className="min-h-full p-4 pt-14">
              <div className="relative">
                <button
                  onClick={onClose}
                  className="absolute -top-10 right-0 p-2 rounded-lg bg-panel border border-border hover:bg-panel-hover transition-colors"
                >
                  <X className="h-4 w-4 text-muted" />
                </button>
                <RiskScanner />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function HomePage() {
  const [isRiskScannerOpen, setIsRiskScannerOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // Vault state — polls every 15s
  const { stats, basket, isLoading: vaultLoading, refresh: refreshVault } = useVaultState();

  // Analytics — polls every 10s
  const {
    volumeTimeSeries,
    dailyTransactionCounts,
    successRate,
    recentFlags,
    totalTransfers,
    avgLatencySeconds,
    complianceBreakdown,
    isLoading: analyticsLoading,
  } = useDashboardAnalytics();

  const openAdmin = useCallback(() => setIsAdminOpen(true), []);
  const closeAdmin = useCallback(() => setIsAdminOpen(false), []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SystemHealthBar onAdminClick={openAdmin} />

      <main className="flex-1 container mx-auto px-4 py-6 space-y-5">

        {/* 1. Hero — what is Oragami */}
        <HeroStrip />

        {/* 2. Live vault stats — NAV, TVL, basket */}
        <VaultStatsBar
          stats={stats}
          basket={basket}
          isLoading={vaultLoading}
          onRefresh={refreshVault}
        />

        {/* 3. Vault operations + transaction monitor */}
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-5">
          <VaultPanel stats={stats} onVaultUpdate={refreshVault} />
          <Monitor />
        </div>

        {/* 4. Risk scanner button */}
        <div className="flex justify-end">
          <button
            onClick={() => setIsRiskScannerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
          >
            <Scan className="h-4 w-4" />
            Wallet Risk Scanner
          </button>
        </div>

        {/* 5. Analytics — below the fold */}
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest">
              Compliance Analytics
            </h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          <AnalyticsOverview
            volumeTimeSeries={volumeTimeSeries}
            dailyTransactionCounts={dailyTransactionCounts}
            successRate={successRate}
            recentFlags={recentFlags}
            compact
          />
          <MetricsRow
            totalTransfers={totalTransfers}
            successRate={successRate}
            avgLatencySeconds={avgLatencySeconds}
            complianceBreakdown={complianceBreakdown}
            isLoading={analyticsLoading}
          />
        </section>
      </main>

      <Footer />

      <RiskScannerOverlay isOpen={isRiskScannerOpen} onClose={() => setIsRiskScannerOpen(false)} />
      <AdminOverlay isOpen={isAdminOpen} onClose={closeAdmin} />
    </div>
  );
}
