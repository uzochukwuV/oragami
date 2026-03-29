'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PublicKey } from '@solana/web3.js';
import { Loader2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, ExternalLink, ShieldCheck, ShieldX, AlertTriangle } from 'lucide-react';
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
import { preflightDeposit, indexDeposit, type PreflightResponse } from '@/shared/api';
import { USDC_DEVNET_MINT, API_BASE_URL } from '@/lib/constants';
import type { VaultStats } from './useVaultState';

type Tab = 'deposit' | 'redeem' | 'convert';
interface TxResult { success: boolean; signature?: string; error?: string; }

// ─── Shared primitives ────────────────────────────────────────────────────────

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-mono tracking-wide transition-colors border-b-2 ${
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function AmountInput({ label, value, onChange, hint, disabled }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{label}</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="0.00"
        className="w-full px-0 py-3 bg-transparent border-0 border-b border-foreground/20 focus:border-foreground text-2xl font-display outline-none placeholder:text-foreground/20 disabled:opacity-40 transition-colors"
      />
      {hint && <p className="font-mono text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ComplianceLine({ status }: { status: 'idle' | 'checking' | 'pass' | 'fail' }) {
  if (status === 'idle') return null;
  return (
    <div className={`flex items-center gap-2 font-mono text-xs ${
      status === 'checking' ? 'text-muted-foreground' :
      status === 'pass' ? 'text-green-600' : 'text-destructive-foreground'
    }`}>
      {status === 'checking' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'pass' && <ShieldCheck className="h-3 w-3" />}
      {status === 'fail' && <ShieldX className="h-3 w-3" />}
      {status === 'checking' ? 'Running compliance check...' :
       status === 'pass' ? 'Compliance check passed' : 'Compliance check failed'}
    </div>
  );
}

function TxBanner({ result, onDismiss }: { result: TxResult; onDismiss: () => void }) {
  return (
    <div className={`border p-4 ${result.success ? 'border-green-600/30 bg-green-50' : 'border-destructive/30 bg-destructive/5'}`}>
      {result.success ? (
        <div className="space-y-1">
          <p className="font-mono text-xs text-green-700 uppercase tracking-widest">Transaction confirmed</p>
          {result.signature && (
            <a
              href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-mono text-xs text-foreground/60 hover:text-foreground transition-colors"
            >
              {result.signature.slice(0, 16)}...{result.signature.slice(-8)}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ) : (
        <p className="font-mono text-xs text-destructive-foreground">{result.error}</p>
      )}
      <button onClick={onDismiss} className="font-mono text-xs text-muted-foreground hover:text-foreground mt-2 underline underline-offset-2">
        Dismiss
      </button>
    </div>
  );
}

function NotConnected() {
  return (
    <div className="py-4 font-mono text-xs text-muted-foreground border border-foreground/10 text-center">
      Connect your Phantom wallet to continue
    </div>
  );
}

// ─── Deposit ─────────────────────────────────────────────────────────────────

function DepositTab({ stats, onSuccess }: { stats: VaultStats; onSuccess: () => void }) {
  const { connected, publicKey } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [compliance, setCompliance] = useState<'idle' | 'checking' | 'pass' | 'fail'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TxResult | null>(null);
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);

  const rawUsdc = Math.floor((parseFloat(amount) || 0) * 1_000_000);

  // Debounced preflight on amount change
  useEffect(() => {
    if (!publicKey || !rawUsdc || rawUsdc <= 0) {
      setPreflight(null);
      return;
    }
    const timer = setTimeout(async () => {
      setPreflightLoading(true);
      try {
        const res = await preflightDeposit({
          wallet: publicKey,
          usdcAmount: rawUsdc.toString(),
        });
        setPreflight(res);
      } catch {
        setPreflight(null);
      } finally {
        setPreflightLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [amount, publicKey]);

  // Use preflight estimate when available, fall back to local calc
  const cvaultOut = preflight?.estimatedCvault
    ? parseInt(preflight.estimatedCvault, 10)
    : rawUsdc > 0 ? calcCvaultFromUsdc(rawUsdc, stats.navPriceBps) : 0;

  const handleDeposit = useCallback(async () => {
    if (!connected || !publicKey || rawUsdc <= 0) return;
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
    if (!phantom) { setResult({ success: false, error: 'Phantom not found' }); setIsSubmitting(false); return; }

    const wallet = { publicKey: new PublicKey(publicKey), signTransaction: phantom.signTransaction.bind(phantom), signAllTransactions: phantom.signAllTransactions.bind(phantom) };
    const res = await depositToVault(wallet, rawUsdc, USDC_DEVNET_MINT);

    if (res.success && res.signature) {
      // Index the deposit in the backend so it appears in history
      try {
        await indexDeposit({
          txSignature: res.signature,
          wallet: publicKey,
          usdcAmount: rawUsdc.toString(),
          cvaultAmount: cvaultOut.toString(),
          nonce: crypto.randomUUID(),
        });
      } catch {
        // Non-critical — deposit succeeded on-chain, indexing is for display
      }
      setResult({ success: true, signature: res.signature });
      setAmount('');
      setCompliance('idle');
      setPreflight(null);
      onSuccess();
    } else {
      setResult({ success: false, error: res.error });
    }
    setIsSubmitting(false);
  }, [connected, publicKey, rawUsdc, cvaultOut, onSuccess]);

  const depositBlocked = preflight && !preflight.canDeposit;

  return (
    <div className="space-y-6">
      <AmountInput label="USDC amount" value={amount} onChange={setAmount} hint="Devnet USDC — get from faucet.solana.com" disabled={isSubmitting} />

      {/* Preflight estimate */}
      {rawUsdc > 0 && (
        <div className="flex items-baseline justify-between py-3 border-b border-foreground/10">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">You receive</span>
          <div className="text-right">
            {preflightLoading ? (
              <span className="font-mono text-xs text-muted-foreground">Estimating...</span>
            ) : (
              <>
                <span className="font-display text-2xl">{(cvaultOut / 1_000_000).toFixed(6)} cVAULT</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  at NAV {preflight?.currentNav ? `$${(preflight.currentNav / 10_000).toFixed(4)}` : stats.navDisplay}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Preflight warnings */}
      {preflight?.requiresTravelRule && (
        <div className="flex items-start gap-2 p-3 border border-yellow-500/20 bg-yellow-500/5 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-yellow-500 font-mono text-xs uppercase tracking-wider">Travel Rule Required</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Deposits ≥ 1,000 USDC require FATF Travel Rule data. Submit via the compliance tab after deposit.
            </p>
          </div>
        </div>
      )}

      {depositBlocked && (
        <div className="flex items-start gap-2 p-3 border border-destructive/20 bg-destructive/5 text-sm">
          <ShieldX className="h-4 w-4 text-destructive-foreground mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-destructive-foreground font-mono text-xs uppercase tracking-wider">Deposit Blocked</p>
            <p className="text-muted-foreground text-xs mt-0.5">{preflight.reason}</p>
          </div>
        </div>
      )}

      {preflight?.credentialStatus && preflight.credentialStatus !== 'active' && (
        <div className="flex items-center gap-2 font-mono text-xs text-yellow-500">
          <ShieldX className="h-3 w-3" />
          Credential: {preflight.credentialStatus}
        </div>
      )}

      <ComplianceLine status={compliance} />

      {!connected ? <NotConnected /> : (
        <button
          onClick={handleDeposit}
          disabled={isSubmitting || rawUsdc <= 0 || stats.paused || !stats.initialized || !!depositBlocked}
          className="w-full py-4 bg-foreground text-background font-mono text-sm tracking-widest uppercase hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
          {isSubmitting ? 'Processing...' : stats.paused ? 'Vault Paused' : !stats.initialized ? 'Not Initialized' : depositBlocked ? 'Cannot Deposit' : 'Deposit USDC'}
        </button>
      )}

      {result && <TxBanner result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}

// ─── Redeem ───────────────────────────────────────────────────────────────────

function RedeemTab({ stats, onSuccess }: { stats: VaultStats; onSuccess: () => void }) {
  const { connected, publicKey } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [compliance, setCompliance] = useState<'idle' | 'checking' | 'pass' | 'fail'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TxResult | null>(null);

  const rawCvault = Math.floor((parseFloat(amount) || 0) * 1_000_000);
  const usdcOut = rawCvault > 0 ? calcUsdcFromCvault(rawCvault, stats.navPriceBps) : 0;

  const handleRedeem = useCallback(async () => {
    if (!connected || !publicKey || rawCvault <= 0) return;
    setIsSubmitting(true);
    setResult(null);
    setCompliance('checking');

    const check = await checkVaultCompliance(publicKey);
    if (!check.compliant) { setCompliance('fail'); setIsSubmitting(false); return; }
    setCompliance('pass');

    const phantom = (window as any).solana;
    if (!phantom) { setResult({ success: false, error: 'Phantom not found' }); setIsSubmitting(false); return; }

    const wallet = { publicKey: new PublicKey(publicKey), signTransaction: phantom.signTransaction.bind(phantom), signAllTransactions: phantom.signAllTransactions.bind(phantom) };
    const res = await redeemFromVault(wallet, rawCvault, USDC_DEVNET_MINT);
    setResult(res.success ? { success: true, signature: res.signature } : { success: false, error: res.error });
    if (res.success) { setAmount(''); setCompliance('idle'); onSuccess(); }
    setIsSubmitting(false);
  }, [connected, publicKey, rawCvault, onSuccess]);

  return (
    <div className="space-y-6">
      <AmountInput label="cVAULT amount" value={amount} onChange={setAmount} hint="Burns cVAULT and returns USDC at current NAV" disabled={isSubmitting} />

      {rawCvault > 0 && (
        <div className="flex items-baseline justify-between py-3 border-b border-foreground/10">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">You receive</span>
          <div className="text-right">
            <span className="font-display text-2xl">{(usdcOut / 1_000_000).toFixed(6)} USDC</span>
            <span className="block font-mono text-xs text-muted-foreground">at NAV {stats.navDisplay}</span>
          </div>
        </div>
      )}

      <ComplianceLine status={compliance} />

      {!connected ? <NotConnected /> : (
        <button
          onClick={handleRedeem}
          disabled={isSubmitting || rawCvault <= 0 || stats.paused || !stats.initialized}
          className="w-full py-4 border border-foreground font-mono text-sm tracking-widest uppercase hover:bg-foreground hover:text-background transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
          {isSubmitting ? 'Processing...' : 'Redeem cVAULT'}
        </button>
      )}

      {result && <TxBanner result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}

// ─── Convert ──────────────────────────────────────────────────────────────────

function ConvertTab({ stats, onSuccess }: { stats: VaultStats; onSuccess: () => void }) {
  const { connected, publicKey } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TxResult | null>(null);

  const rawCvault = Math.floor((parseFloat(amount) || 0) * 1_000_000);

  const handleConvert = useCallback(async () => {
    if (!connected || !publicKey || rawCvault <= 0) return;
    setIsSubmitting(true);
    setResult(null);

    const phantom = (window as any).solana;
    if (!phantom) { setResult({ success: false, error: 'Phantom not found' }); setIsSubmitting(false); return; }

    const wallet = { publicKey: new PublicKey(publicKey), signTransaction: phantom.signTransaction.bind(phantom), signAllTransactions: phantom.signAllTransactions.bind(phantom) };
    const res = await convertToTradeable(wallet, rawCvault);
    setResult(res.success ? { success: true, signature: res.signature } : { success: false, error: res.error });
    if (res.success) { setAmount(''); onSuccess(); }
    setIsSubmitting(false);
  }, [connected, publicKey, rawCvault, onSuccess]);

  return (
    <div className="space-y-6">
      <p className="font-mono text-xs text-muted-foreground leading-relaxed border-l-2 border-foreground/20 pl-3">
        cVAULT-TRADE is the tradeable version. Every transfer is enforced on-chain by the compliance hook — non-whitelisted wallets are blocked automatically.
      </p>

      <AmountInput label="cVAULT to convert" value={amount} onChange={setAmount} hint="1:1 conversion — same NAV, now tradeable" disabled={isSubmitting} />

      {!connected ? <NotConnected /> : !stats.initialized ? (
        <div className="py-4 font-mono text-xs text-muted-foreground border border-foreground/10 text-center">Vault not initialized</div>
      ) : (
        <button
          onClick={handleConvert}
          disabled={isSubmitting || rawCvault <= 0 || stats.paused}
          className="w-full py-4 border border-foreground/30 font-mono text-sm tracking-widest uppercase hover:border-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
          {isSubmitting ? 'Converting...' : 'Convert to cVAULT-TRADE'}
        </button>
      )}

      {result && <TxBanner result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}

// ─── Main VaultPanel ──────────────────────────────────────────────────────────

export function VaultPanel({ stats, onVaultUpdate }: { stats: VaultStats; onVaultUpdate: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('deposit');

  return (
    <div className="border border-foreground/10 p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl tracking-tight">Vault Operations</h2>
        <p className="font-mono text-xs text-muted-foreground mt-1">
          Deposit USDC · Earn {stats.apy.toFixed(1)}% APY · Redeem at NAV
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-foreground/10">
        <TabBtn active={activeTab === 'deposit'} onClick={() => setActiveTab('deposit')} label="Deposit" />
        <TabBtn active={activeTab === 'redeem'} onClick={() => setActiveTab('redeem')} label="Redeem" />
        <TabBtn active={activeTab === 'convert'} onClick={() => setActiveTab('convert')} label="Convert" />
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
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
