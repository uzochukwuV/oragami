'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PublicKey, Connection } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { Loader2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, ExternalLink, ShieldCheck, ShieldX } from 'lucide-react';
import { useWalletStore } from '@/features/wallet/model/store';
import {
  depositToVault,
  redeemFromVault,
  convertToTradeable,
  checkVaultCompliance,
  calcCvaultFromUsdc,
  calcUsdcFromCvault,
  navBpsToPrice,
} from '@/services/vault-operations';
import { USDC_DEVNET_MINT, SOLANA_RPC_URL, NAV_BPS_DENOMINATOR } from '@/lib/constants';
import type { VaultStats } from './useVaultState';

type Tab = 'deposit' | 'redeem' | 'convert';

interface TxResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// ============================================================================
// Tab Button
// ============================================================================

function TabBtn({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-primary text-white'
          : 'text-muted hover:text-foreground hover:bg-panel-hover'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================================
// Amount Input
// ============================================================================

function AmountInput({
  label,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs text-muted uppercase tracking-widest">{label}</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="0.00"
        className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground text-lg font-mono placeholder:text-muted-dark focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
      />
      {hint && <p className="text-xs text-muted-dark">{hint}</p>}
    </div>
  );
}

// ============================================================================
// Compliance Badge
// ============================================================================

function ComplianceBadge({ status }: { status: 'idle' | 'checking' | 'pass' | 'fail'; reason?: string }) {
  if (status === 'idle') return null;
  if (status === 'checking') return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <Loader2 className="h-3 w-3 animate-spin" />
      Running compliance check...
    </div>
  );
  if (status === 'pass') return (
    <div className="flex items-center gap-2 text-xs text-status-confirmed">
      <ShieldCheck className="h-3 w-3" />
      Compliance check passed
    </div>
  );
  return (
    <div className="flex items-center gap-2 text-xs text-status-failed">
      <ShieldX className="h-3 w-3" />
      Compliance check failed
    </div>
  );
}

// ============================================================================
// Transaction Result
// ============================================================================

function TxResultBanner({ result, onDismiss }: { result: TxResult; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className={`rounded-lg p-4 border ${
            result.success
              ? 'bg-status-confirmed/10 border-status-confirmed/30'
              : 'bg-status-failed/10 border-status-failed/30'
          }`}
        >
          {result.success ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-status-confirmed">Transaction confirmed</p>
              {result.signature && (
                <a
                  href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline font-mono"
                >
                  {result.signature.slice(0, 20)}...{result.signature.slice(-8)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-status-failed">{result.error}</p>
          )}
          <button onClick={onDismiss} className="text-xs text-muted hover:text-foreground mt-2 underline">
            Dismiss
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// Deposit Tab
// ============================================================================

function DepositTab({ stats, onSuccess }: { stats: VaultStats; onSuccess: () => void }) {
  const { connected, publicKey } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [compliance, setCompliance] = useState<'idle' | 'checking' | 'pass' | 'fail'>('idle');
  const [complianceReason, setComplianceReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TxResult | null>(null);

  const usdcAmount = parseFloat(amount) || 0;
  const rawUsdc = Math.floor(usdcAmount * 1_000_000);
  const cvaultOut = rawUsdc > 0 ? calcCvaultFromUsdc(rawUsdc, stats.navPriceBps) : 0;
  const cvaultOutDisplay = (cvaultOut / 1_000_000).toFixed(6);

  const handleDeposit = useCallback(async () => {
    if (!connected || !publicKey || rawUsdc <= 0) return;

    setIsSubmitting(true);
    setResult(null);

    // Step 1: compliance check
    setCompliance('checking');
    const check = await checkVaultCompliance(publicKey);
    if (!check.compliant) {
      setCompliance('fail');
      setComplianceReason(check.reason || 'Compliance check failed');
      setIsSubmitting(false);
      return;
    }
    setCompliance('pass');

    // Step 2: build phantom wallet adapter
    const phantom = (window as any).solana;
    if (!phantom) {
      setResult({ success: false, error: 'Phantom wallet not found' });
      setIsSubmitting(false);
      return;
    }

    const wallet = {
      publicKey: new PublicKey(publicKey),
      signTransaction: phantom.signTransaction.bind(phantom),
      signAllTransactions: phantom.signAllTransactions.bind(phantom),
    };

    // Step 3: execute deposit
    const res = await depositToVault(wallet, rawUsdc, USDC_DEVNET_MINT);
    setResult(res.success
      ? { success: true, signature: res.signature }
      : { success: false, error: res.error }
    );

    if (res.success) {
      setAmount('');
      setCompliance('idle');
      onSuccess();
    }

    setIsSubmitting(false);
  }, [connected, publicKey, rawUsdc, onSuccess]);

  return (
    <div className="space-y-5">
      <AmountInput
        label="USDC to deposit"
        value={amount}
        onChange={setAmount}
        hint="Devnet USDC — get from faucet.solana.com"
        disabled={isSubmitting}
      />

      {/* NAV preview */}
      {rawUsdc > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-background border border-border">
          <div className="text-sm text-muted">You receive</div>
          <div className="text-right">
            <div className="text-lg font-bold text-primary font-mono">{cvaultOutDisplay} cVAULT</div>
            <div className="text-xs text-muted-dark">at NAV {stats.navDisplay}</div>
          </div>
        </div>
      )}

      <ComplianceBadge status={compliance} reason={complianceReason} />

      {!connected ? (
        <div className="text-center py-3 text-sm text-muted border border-border rounded-lg">
          Connect your Phantom wallet to deposit
        </div>
      ) : (
        <button
          onClick={handleDeposit}
          disabled={isSubmitting || rawUsdc <= 0 || stats.paused || !stats.initialized}
          className="w-full py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
          {isSubmitting ? 'Processing...' : stats.paused ? 'Vault Paused' : !stats.initialized ? 'Vault Not Initialized' : 'Deposit USDC'}
        </button>
      )}

      {result && <TxResultBanner result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}

// ============================================================================
// Redeem Tab
// ============================================================================

function RedeemTab({ stats, onSuccess }: { stats: VaultStats; onSuccess: () => void }) {
  const { connected, publicKey } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [compliance, setCompliance] = useState<'idle' | 'checking' | 'pass' | 'fail'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TxResult | null>(null);

  const cvaultAmount = parseFloat(amount) || 0;
  const rawCvault = Math.floor(cvaultAmount * 1_000_000);
  const usdcOut = rawCvault > 0 ? calcUsdcFromCvault(rawCvault, stats.navPriceBps) : 0;
  const usdcOutDisplay = (usdcOut / 1_000_000).toFixed(6);

  const handleRedeem = useCallback(async () => {
    if (!connected || !publicKey || rawCvault <= 0) return;

    setIsSubmitting(true);
    setResult(null);
    setCompliance('checking');

    const check = await checkVaultCompliance(publicKey);
    if (!check.compliant) {
      setCompliance('fail');
      setIsSubmitting(false);
      return;
    }
    setCompliance('pass');

    const phantom = (window as any).solana;
    if (!phantom) {
      setResult({ success: false, error: 'Phantom wallet not found' });
      setIsSubmitting(false);
      return;
    }

    const wallet = {
      publicKey: new PublicKey(publicKey),
      signTransaction: phantom.signTransaction.bind(phantom),
      signAllTransactions: phantom.signAllTransactions.bind(phantom),
    };

    const res = await redeemFromVault(wallet, rawCvault, USDC_DEVNET_MINT);
    setResult(res.success
      ? { success: true, signature: res.signature }
      : { success: false, error: res.error }
    );

    if (res.success) {
      setAmount('');
      setCompliance('idle');
      onSuccess();
    }

    setIsSubmitting(false);
  }, [connected, publicKey, rawCvault, onSuccess]);

  return (
    <div className="space-y-5">
      <AmountInput
        label="cVAULT to redeem"
        value={amount}
        onChange={setAmount}
        hint="Burns cVAULT and returns USDC at current NAV"
        disabled={isSubmitting}
      />

      {rawCvault > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-background border border-border">
          <div className="text-sm text-muted">You receive</div>
          <div className="text-right">
            <div className="text-lg font-bold text-status-confirmed font-mono">{usdcOutDisplay} USDC</div>
            <div className="text-xs text-muted-dark">at NAV {stats.navDisplay}</div>
          </div>
        </div>
      )}

      <ComplianceBadge status={compliance} />

      {!connected ? (
        <div className="text-center py-3 text-sm text-muted border border-border rounded-lg">
          Connect your Phantom wallet to redeem
        </div>
      ) : (
        <button
          onClick={handleRedeem}
          disabled={isSubmitting || rawCvault <= 0 || stats.paused || !stats.initialized}
          className="w-full py-3 rounded-lg bg-status-confirmed/20 hover:bg-status-confirmed/30 border border-status-confirmed/40 text-status-confirmed font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
          {isSubmitting ? 'Processing...' : 'Redeem cVAULT'}
        </button>
      )}

      {result && <TxResultBanner result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}

// ============================================================================
// Convert Tab
// ============================================================================

function ConvertTab({ stats, onSuccess }: { stats: VaultStats; onSuccess: () => void }) {
  const { connected, publicKey } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TxResult | null>(null);

  const cvaultAmount = parseFloat(amount) || 0;
  const rawCvault = Math.floor(cvaultAmount * 1_000_000);

  const handleConvert = useCallback(async () => {
    if (!connected || !publicKey || rawCvault <= 0) return;

    setIsSubmitting(true);
    setResult(null);

    const phantom = (window as any).solana;
    if (!phantom) {
      setResult({ success: false, error: 'Phantom wallet not found' });
      setIsSubmitting(false);
      return;
    }

    const wallet = {
      publicKey: new PublicKey(publicKey),
      signTransaction: phantom.signTransaction.bind(phantom),
      signAllTransactions: phantom.signAllTransactions.bind(phantom),
    };

    const res = await convertToTradeable(wallet, rawCvault);
    setResult(res.success
      ? { success: true, signature: res.signature }
      : { success: false, error: res.error }
    );

    if (res.success) {
      setAmount('');
      onSuccess();
    }

    setIsSubmitting(false);
  }, [connected, publicKey, rawCvault, onSuccess]);

  return (
    <div className="space-y-5">
      {/* Explanation */}
      <div className="px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted leading-relaxed">
        <span className="text-primary font-semibold">cVAULT-TRADE</span> is the tradeable version of cVAULT.
        It can be transferred between whitelisted institutions on the secondary market.
        Every transfer is enforced on-chain by the compliance hook — non-whitelisted wallets are blocked automatically.
      </div>

      <AmountInput
        label="cVAULT to convert"
        value={amount}
        onChange={setAmount}
        hint="1:1 conversion — same NAV, now tradeable"
        disabled={isSubmitting}
      />

      {!stats.initialized || !stats.paused === false ? null : null}

      {!connected ? (
        <div className="text-center py-3 text-sm text-muted border border-border rounded-lg">
          Connect your Phantom wallet to convert
        </div>
      ) : !stats.initialized ? (
        <div className="text-center py-3 text-sm text-muted border border-border rounded-lg">
          Vault not initialized
        </div>
      ) : (
        <button
          onClick={handleConvert}
          disabled={isSubmitting || rawCvault <= 0 || stats.paused}
          className="w-full py-3 rounded-lg bg-panel hover:bg-panel-hover border border-border text-foreground font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
          {isSubmitting ? 'Converting...' : 'Convert to cVAULT-TRADE'}
        </button>
      )}

      {result && <TxResultBanner result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}

// ============================================================================
// Main VaultPanel
// ============================================================================

interface VaultPanelProps {
  stats: VaultStats;
  onVaultUpdate: () => void;
}

export function VaultPanel({ stats, onVaultUpdate }: VaultPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('deposit');

  return (
    <div className="rounded-xl border border-border bg-panel p-6 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground tracking-tight">Vault Operations</h2>
        <p className="text-xs text-muted mt-0.5">
          Deposit USDC → mint cVAULT at live NAV · Earn {stats.apy}% APY via Solstice USX
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-background border border-border w-fit">
        <TabBtn
          active={activeTab === 'deposit'}
          onClick={() => setActiveTab('deposit')}
          icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
          label="Deposit"
        />
        <TabBtn
          active={activeTab === 'redeem'}
          onClick={() => setActiveTab('redeem')}
          icon={<ArrowUpFromLine className="h-3.5 w-3.5" />}
          label="Redeem"
        />
        <TabBtn
          active={activeTab === 'convert'}
          onClick={() => setActiveTab('convert')}
          icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
          label="Convert"
        />
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'deposit' && <DepositTab stats={stats} onSuccess={onVaultUpdate} />}
          {activeTab === 'redeem' && <RedeemTab stats={stats} onSuccess={onVaultUpdate} />}
          {activeTab === 'convert' && <ConvertTab stats={stats} onSuccess={onVaultUpdate} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
