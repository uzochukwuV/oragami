'use client';

import { motion } from 'framer-motion';
import { TrendingUp, Layers, Percent, RefreshCw, AlertTriangle } from 'lucide-react';
import type { VaultStats, BasketAsset } from './useVaultState';

// ============================================================================
// Stat Card
// ============================================================================

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted uppercase tracking-widest">{label}</span>
      <span className={`text-2xl font-bold ${highlight ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted-dark">{sub}</span>}
    </div>
  );
}

// ============================================================================
// Basket Pill
// ============================================================================

function BasketPill({ asset }: { asset: BasketAsset }) {
  const priceStr = asset.price != null
    ? asset.symbol === 'XAU'
      ? `$${asset.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz`
      : `$${asset.price.toFixed(4)}`
    : 'Loading...';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-panel border border-border">
      <span className="text-xs font-semibold text-foreground">{asset.weight}%</span>
      <span className="text-xs text-muted">{asset.name}</span>
      <span className="text-xs text-primary font-mono">{priceStr}</span>
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function StatsSkeleton() {
  return (
    <div className="animate-pulse flex items-center gap-8">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-3 w-16 bg-panel rounded" />
          <div className="h-7 w-24 bg-panel rounded" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface VaultStatsBarProps {
  stats: VaultStats;
  basket: BasketAsset[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function VaultStatsBar({ stats, basket, isLoading, onRefresh }: VaultStatsBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full bg-panel border border-border rounded-xl px-6 py-4"
    >
      <div className="flex flex-col gap-4">
        {/* Top row: stats + refresh */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          {isLoading ? (
            <StatsSkeleton />
          ) : (
            <div className="flex items-center gap-8 flex-wrap">
              <StatCard
                label="cVAULT NAV"
                value={stats.navDisplay}
                sub="per cVAULT token"
                highlight
              />
              <div className="h-8 w-px bg-border hidden sm:block" />
              <StatCard
                label="Vault TVL"
                value={stats.tvlDisplay}
                sub="USDC deposited"
              />
              <div className="h-8 w-px bg-border hidden sm:block" />
              <StatCard
                label="cVAULT Supply"
                value={stats.supplyDisplay}
                sub="tokens in circulation"
              />
              <div className="h-8 w-px bg-border hidden sm:block" />
              <StatCard
                label="Yield APY"
                value={`${stats.apy.toFixed(1)}%`}
                sub={`via Solstice USX (${stats.usxAllocationPct} allocated)`}
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Paused warning */}
            {stats.paused && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-pending/10 border border-status-pending/30 text-status-pending text-xs font-medium">
                <AlertTriangle className="h-3 w-3" />
                Vault Paused
              </div>
            )}

            {/* Not initialized warning */}
            {!stats.initialized && !isLoading && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-pending/10 border border-status-pending/30 text-status-pending text-xs font-medium">
                <AlertTriangle className="h-3 w-3" />
                Vault not initialized
              </div>
            )}

            {/* Refresh */}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-md text-muted hover:text-foreground transition-colors disabled:opacity-50"
              title="Refresh vault state"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Bottom row: basket composition */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted uppercase tracking-widest mr-1">Basket</span>
          {basket.map((asset) => (
            <BasketPill key={asset.symbol} asset={asset} />
          ))}
          {stats.lastUpdated && (
            <span className="text-xs text-muted-dark ml-auto">
              Prices via SIX · {stats.lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
