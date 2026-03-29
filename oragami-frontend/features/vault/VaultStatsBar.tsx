'use client';

import { motion } from 'framer-motion';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import type { VaultStats, BasketAsset } from './useVaultState';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 border-b border-foreground/10 last:border-0 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:pr-0 lg:last:border-r-0">
      <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{label}</span>
      <span className="font-display text-3xl lg:text-4xl tracking-tight">{value}</span>
      {sub && <span className="font-mono text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function BasketPill({ asset }: { asset: BasketAsset }) {
  const priceStr = asset.price != null
    ? asset.symbol === 'XAU'
      ? `$${asset.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz`
      : `$${asset.price.toFixed(4)}`
    : '—';

  return (
    <div className="flex items-center gap-3 px-4 py-2 border border-foreground/10 hover:border-foreground/30 transition-colors">
      <span className="font-mono text-xs text-muted-foreground">{asset.weight}%</span>
      <span className="text-sm">{asset.name}</span>
      <span className="font-mono text-xs ml-auto">{priceStr}</span>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="flex gap-8 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col gap-2 flex-1">
          <div className="h-3 w-20 bg-foreground/10 rounded" />
          <div className="h-9 w-28 bg-foreground/10 rounded" />
        </div>
      ))}
    </div>
  );
}

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
      transition={{ duration: 0.4 }}
      className="border border-foreground/10 p-6"
    >
      {/* Warnings */}
      {(stats.paused || (!stats.initialized && !isLoading)) && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 border border-foreground/20 text-sm font-mono">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {stats.paused ? 'Vault is paused — deposits disabled' : 'Vault not initialized'}
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-0 mb-6">
        {isLoading ? (
          <StatsSkeleton />
        ) : (
          <>
            <StatCard label="cVAULT NAV" value={stats.navDisplay} sub="per token" />
            <StatCard label="Vault TVL" value={stats.tvlDisplay} sub="USDC deposited" />
            <StatCard label="cVAULT Supply" value={stats.supplyDisplay} />
            <StatCard label="Yield APY" value={`${stats.apy.toFixed(1)}%`} sub={`${stats.usxAllocationPct} to Solstice USX`} />
          </>
        )}
      </div>

      {/* Basket + refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase shrink-0">
          Basket
        </span>
        <div className="flex flex-wrap gap-2 flex-1">
          {basket.map((asset) => (
            <BasketPill key={asset.symbol} asset={asset} />
          ))}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {stats.lastUpdated && (
            <span className="font-mono text-xs text-muted-foreground hidden sm:block">
              via SIX · {stats.lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 hover:bg-foreground/5 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
