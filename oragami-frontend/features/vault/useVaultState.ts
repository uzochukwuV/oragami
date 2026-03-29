'use client';

import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import {
  SOLANA_RPC_URL,
  VAULT_PROGRAM_ID,
  VAULT_STATE_SEED,
  NAV_BPS_DENOMINATOR,
} from '@/lib/constants';
import oragamiVaultIdl from '@/lib/idl/oragami_vault.json';
import { navBpsToPrice } from '@/services/vault-operations';
import { getNavCurrent } from '@/shared/api';

export interface VaultStats {
  navPriceBps: number;
  navDisplay: string;
  tvlUsdc: number;
  tvlDisplay: string;
  totalSupply: number;
  supplyDisplay: string;
  usxAllocationBps: number;
  usxAllocationPct: string;
  apy: number;
  paused: boolean;
  initialized: boolean;
  goldPrice: number | null;
  chfUsd: number | null;
  lastUpdated: Date | null;
}

export interface BasketAsset {
  symbol: string;
  name: string;
  weight: number;
  price: number | null;
  currency: string;
}

export const BASKET_WEIGHTS: BasketAsset[] = [
  { symbol: 'XAU', name: 'Gold', weight: 50, price: null, currency: 'USD/oz' },
  { symbol: 'CHF', name: 'CHF/USD', weight: 30, price: null, currency: 'USD' },
  { symbol: 'USX', name: 'Solstice USX', weight: 20, price: 1.0, currency: 'USD' },
];

const EMPTY_STATS: VaultStats = {
  navPriceBps: NAV_BPS_DENOMINATOR,
  navDisplay: '$1.0000',
  tvlUsdc: 0,
  tvlDisplay: '$0.00',
  totalSupply: 0,
  supplyDisplay: '0 cVAULT',
  usxAllocationBps: 7000,
  usxAllocationPct: '70%',
  apy: 5.0,
  paused: false,
  initialized: false,
  goldPrice: null,
  chfUsd: null,
  lastUpdated: null,
};

function formatUsdc(raw: number): string {
  const usd = raw / 1_000_000;
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCvault(raw: number): string {
  const amount = raw / 1_000_000;
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cVAULT`;
}

// Read-only provider — no wallet needed for fetching state
function getReadonlyProvider() {
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any) => txs,
  };
  return new AnchorProvider(connection, dummyWallet as any, { commitment: 'confirmed' });
}

export function useVaultState(refreshInterval = 15_000) {
  const [stats, setStats] = useState<VaultStats>(EMPTY_STATS);
  const [basket, setBasket] = useState<BasketAsset[]>(BASKET_WEIGHTS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      // 1. Fetch on-chain vault state
      const provider = getReadonlyProvider();
      const program = new Program(oragamiVaultIdl as Idl, provider);
      const [vaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from(VAULT_STATE_SEED)],
        VAULT_PROGRAM_ID
      );

      let onChain: any = null;
      try {
        onChain = await (program.account as any).vaultState.fetch(vaultStatePda);
      } catch {
        // Not initialized yet — show empty state
      }

      // 2. Fetch NAV from backend API (NavSnapshot from SIX crank)
      let navBps: number | null = null;
      let goldPrice: number | null = null;
      let chfUsd: number | null = null;
      let navTimestamp: Date | null = null;
      try {
        const nav = await getNavCurrent();
        if (nav.navBps != null) navBps = parseInt(nav.navBps, 10);
        goldPrice = nav.goldPrice;
        chfUsd = nav.chfUsd;
        if (nav.timestamp) navTimestamp = new Date(nav.timestamp);
      } catch {
        // Backend unavailable — fall through to on-chain / empty
      }

      // 3. Build stats (API NAV takes priority, on-chain fallback for TVL/supply)
      const effectiveNav = navBps
        ?? onChain?.navPriceBps?.toNumber?.()
        ?? NAV_BPS_DENOMINATOR;
      const tvl: number = onChain?.totalDeposits?.toNumber?.() ?? 0;
      const supply: number = onChain?.totalSupply?.toNumber?.() ?? 0;
      const usxBps: number = onChain?.usxAllocationBps ?? 7000;

      setStats({
        navPriceBps: effectiveNav,
        navDisplay: `$${navBpsToPrice(effectiveNav)}`,
        tvlUsdc: tvl,
        tvlDisplay: formatUsdc(tvl),
        totalSupply: supply,
        supplyDisplay: formatCvault(supply),
        usxAllocationBps: usxBps,
        usxAllocationPct: `${(usxBps / 100).toFixed(0)}%`,
        apy: 5.0,
        paused: onChain?.paused ?? false,
        initialized: !!onChain || navBps != null,
        goldPrice,
        chfUsd,
        lastUpdated: navTimestamp ?? new Date(),
      });

      // 4. Update basket with live prices from NAV snapshot
      setBasket([
        { symbol: 'XAU', name: 'Gold', weight: 50, price: goldPrice, currency: 'USD/oz' },
        { symbol: 'CHF', name: 'CHF/USD', weight: 30, price: chfUsd, currency: 'USD' },
        { symbol: 'USX', name: 'Solstice USX', weight: 20, price: 1.0, currency: 'USD' },
      ]);

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch vault state');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAll, refreshInterval]);

  return { stats, basket, isLoading, error, refresh: fetchAll };
}
