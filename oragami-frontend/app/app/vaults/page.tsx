'use client';

import { useCallback, useEffect, useState } from 'react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Loader2, ArrowDownToLine, ArrowLeftRight, ExternalLink, ShieldCheck, ShieldX, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import {
  getMultiVaults,
  preflightMultiVaultDeposit,
  verifyMultiVaultCredential,
  issueCredential,
  multiVaultFaucet,
  type AssetVaultInfo,
  type MultiVaultCredential,
} from '@/shared/api';
import { useWalletStore } from '@/features/wallet/model/store';
import idl from '@/lib/idl/multi_asset_vault.json';

const PROGRAM_ID = new PublicKey('6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D');
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

const ASSET_VAULT_SEED = Buffer.from('vault');
const SHARE_MINT_SEED = Buffer.from('share_mint');
const VAULT_TOKEN_SEED = Buffer.from('vault_token');
// Credential seed — same program as the vault
const CREDENTIAL_SEED = Buffer.from('credential');

function deriveVaultPda(assetMint: PublicKey) {
  return PublicKey.findProgramAddressSync([ASSET_VAULT_SEED, assetMint.toBuffer()], PROGRAM_ID)[0];
}
function deriveShareMintPda(assetMint: PublicKey) {
  return PublicKey.findProgramAddressSync([SHARE_MINT_SEED, assetMint.toBuffer()], PROGRAM_ID)[0];
}
function deriveVaultTokenPda(assetMint: PublicKey) {
  return PublicKey.findProgramAddressSync([VAULT_TOKEN_SEED, assetMint.toBuffer()], PROGRAM_ID)[0];
}
// Credential PDA is derived from the SAME program (multi-asset vault)
function deriveCredentialPda(wallet: PublicKey) {
  return PublicKey.findProgramAddressSync([CREDENTIAL_SEED, wallet.toBuffer()], PROGRAM_ID)[0];
}

function getProgram(phantom: any) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = {
    publicKey: phantom.publicKey,
    signTransaction: (tx: Transaction) => phantom.signTransaction(tx),
    signAllTransactions: (txs: Transaction[]) => phantom.signAllTransactions(txs),
  };
  const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
  return new Program(idl as Idl, provider);
}

// ─── Deposit Modal ────────────────────────────────────────────────────────────

function DepositModal({
  vault,
  onClose,
  onSuccess,
}: {
  vault: AssetVaultInfo;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { publicKey } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [preflight, setPreflight] = useState<{ estimatedShares: string; canDeposit: boolean; reason?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issuingCred, setIssuingCred] = useState(false);
  const [credIssued, setCredIssued] = useState(false);
  const [fauceting, setFauceting] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rawAmount = Math.floor((parseFloat(amount) || 0) * 1_000_000).toString();

  const runPreflight = useCallback(async () => {
    if (!publicKey || !amount || parseFloat(amount) <= 0) { setPreflight(null); return; }
    setChecking(true);
    try {
      const res = await preflightMultiVaultDeposit(vault.assetMint, publicKey, rawAmount);
      setPreflight(res);
    } catch {
      setPreflight(null);
    } finally {
      setChecking(false);
    }
  }, [publicKey, amount, vault.assetMint, rawAmount]);

  useEffect(() => {
    const t = setTimeout(runPreflight, 500);
    return () => clearTimeout(t);
  }, [runPreflight]);

  const handleIssueCredential = async () => {
    if (!publicKey) return;
    const adminKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY;
    if (!adminKey) { setError('NEXT_PUBLIC_ADMIN_API_KEY not set'); return; }
    setIssuingCred(true);
    setError(null);
    try {
      // Issue credential on the multi-asset vault program
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3210'}/api/multi-vault/credentials`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-api-key': adminKey,
          },
          body: JSON.stringify({
            wallet: publicKey,
            institutionName: 'Demo Institution',
            jurisdiction: 'CH',
            tier: 3,
            kycLevel: 3,
            amlScore: 95,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setCredIssued(true);
      await runPreflight();
    } catch (err: any) {
      setError(err?.message || 'Failed to issue credential');
    } finally {
      setIssuingCred(false);
    }
  };

  const handleFaucet = async () => {
    if (!publicKey) return;
    setFauceting(true);
    setError(null);
    try {
      await multiVaultFaucet(vault.assetMint, publicKey);
      await runPreflight();
    } catch (err: any) {
      setError(err?.message || 'Faucet failed');
    } finally {
      setFauceting(false);
    }
  };

  const handleDeposit = async () => {
    if (!publicKey || !preflight?.canDeposit) return;
    const phantom = (window as any).solana;
    if (!phantom) { setError('Phantom not found'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const program = getProgram(phantom);
      const connection = new Connection(RPC_URL, 'confirmed');
      const depositorPk = new PublicKey(publicKey);
      const assetMint = new PublicKey(vault.assetMint);
      const shareMint = deriveShareMintPda(assetMint);
      const vaultPda = deriveVaultPda(assetMint);
      const vaultToken = deriveVaultTokenPda(assetMint);
      const credentialPda = deriveCredentialPda(depositorPk);

      const depositorAssetAta = getAssociatedTokenAddressSync(assetMint, depositorPk);
      const depositorShareAta = getAssociatedTokenAddressSync(shareMint, depositorPk);

      // Create share ATA if needed
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const setupTx = new Transaction({ feePayer: depositorPk, recentBlockhash: blockhash });
      setupTx.add(
        createAssociatedTokenAccountIdempotentInstruction(depositorPk, depositorShareAta, depositorPk, shareMint),
      );
      const signedSetup = await phantom.signTransaction(setupTx);
      await connection.sendRawTransaction(signedSetup.serialize());

      const tx = await (program.methods as any)
        .deposit(new BN(rawAmount))
        .accounts({
          assetVault: vaultPda,
          shareMint,
          vaultTokenAccount: vaultToken,
          depositorAssetAccount: depositorAssetAta,
          depositorShareAccount: depositorShareAta,
          credential: credentialPda,
          depositor: depositorPk,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setTxSig(tx);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Deposit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-background border border-foreground/10 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Deposit {vault.ticker}-mock</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
        </div>

        {txSig ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600 font-mono text-sm">
              <ShieldCheck className="size-4" /> Deposit confirmed
            </div>
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {txSig.slice(0, 20)}... <ExternalLink className="size-3" />
            </a>
            <button onClick={onClose} className="w-full py-3 bg-foreground text-background font-mono text-xs tracking-widest uppercase">
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Amount ({vault.ticker}-mock)
              </label>
              <input
                type="number" min="0" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-0 py-3 bg-transparent border-0 border-b border-foreground/20 focus:border-foreground text-2xl font-display outline-none placeholder:text-foreground/20"
              />
            </div>

            {checking && <p className="font-mono text-xs text-muted-foreground">Checking...</p>}

            {preflight && (
              <div className="border border-foreground/10 p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NAV</span>
                  <span className="font-mono">{vault.navDisplay}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">You receive</span>
                  <span className="font-mono">{(Number(preflight.estimatedShares) / 1_000_000).toFixed(6)} VAULT-{vault.ticker}</span>
                </div>
                {!preflight.canDeposit && (
                  <div className="space-y-2 pt-1 border-t border-foreground/10">
                    <div className="flex items-center gap-1 text-destructive-foreground font-mono text-xs">
                      <ShieldX className="size-3" />
                      {preflight.credentialStatus === 'not_found'
                        ? 'No credential found for this wallet'
                        : preflight.reason}
                    </div>
                    {preflight.credentialStatus === 'not_found' && (
                      <button
                        onClick={handleIssueCredential}
                        disabled={issuingCred || credIssued}
                        className="w-full flex items-center justify-center gap-2 py-2 border border-foreground/30 font-mono text-xs tracking-widest uppercase hover:border-foreground transition-colors disabled:opacity-40"
                      >
                        {issuingCred ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck className="size-3" />}
                        {issuingCred ? 'Issuing...' : credIssued ? 'Credential Issued ✓' : 'Issue Demo Credential'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {error && <p className="font-mono text-xs text-destructive-foreground">{error}</p>}

            <button
              onClick={handleFaucet}
              disabled={fauceting}
              className="w-full flex items-center justify-center gap-2 py-2 border border-foreground/20 font-mono text-xs tracking-widest uppercase hover:border-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {fauceting && <Loader2 className="size-3 animate-spin" />}
              {fauceting ? 'Minting...' : `Get 1,000 ${vault.ticker}-mock (devnet faucet)`}
            </button>

            <button
              onClick={handleDeposit}
              disabled={submitting || !preflight?.canDeposit || !amount}
              className="w-full flex items-center justify-center gap-2 py-3 bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="size-3 animate-spin" /> : <ArrowDownToLine className="size-3" />}
              {submitting ? 'Depositing...' : 'Deposit'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Transfer Modal ───────────────────────────────────────────────────────────

function TransferModal({
  vault,
  onClose,
  onSuccess,
}: {
  vault: AssetVaultInfo;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { publicKey } = useWalletStore();
  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [receiverCred, setReceiverCred] = useState<MultiVaultCredential | null>(null);
  const [checkingReceiver, setCheckingReceiver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!receiver || receiver.length < 32) { setReceiverCred(null); return; }
    const t = setTimeout(async () => {
      setCheckingReceiver(true);
      try {
        const res = await verifyMultiVaultCredential(receiver);
        setReceiverCred(res);
      } catch {
        setReceiverCred(null);
      } finally {
        setCheckingReceiver(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [receiver]);

  const handleTransfer = async () => {
    if (!publicKey || !receiver || !amount) return;
    const phantom = (window as any).solana;
    if (!phantom) { setError('Phantom not found'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const program = getProgram(phantom);
      const senderPk = new PublicKey(publicKey);
      const receiverPk = new PublicKey(receiver);
      const assetMint = new PublicKey(vault.assetMint);
      const shareMint = deriveShareMintPda(assetMint);
      const vaultPda = deriveVaultPda(assetMint);
      const senderCredPda = deriveCredentialPda(senderPk);
      const receiverCredPda = deriveCredentialPda(receiverPk);

      const senderShareAta = getAssociatedTokenAddressSync(shareMint, senderPk);
      const receiverShareAta = getAssociatedTokenAddressSync(shareMint, receiverPk);

      // Create receiver share ATA if needed
      const connection = new Connection(RPC_URL, 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const setupTx = new Transaction({ feePayer: senderPk, recentBlockhash: blockhash });
      setupTx.add(
        createAssociatedTokenAccountIdempotentInstruction(senderPk, receiverShareAta, receiverPk, shareMint),
      );
      const signedSetup = await phantom.signTransaction(setupTx);
      await connection.sendRawTransaction(signedSetup.serialize());

      const rawAmount = Math.floor((parseFloat(amount) || 0) * 1_000_000);

      const tx = await (program.methods as any)
        .transferShares(new BN(rawAmount))
        .accounts({
          assetVault: vaultPda,
          senderShareAccount: senderShareAta,
          receiverShareAccount: receiverShareAta,
          senderCredential: senderCredPda,
          receiverCredential: receiverCredPda,
          sender: senderPk,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setTxSig(tx);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Transfer failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-background border border-foreground/10 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Transfer VAULT-{vault.ticker}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
        </div>

        {txSig ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600 font-mono text-sm">
              <ShieldCheck className="size-4" /> Transfer confirmed — both credentials verified
            </div>
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {txSig.slice(0, 20)}... <ExternalLink className="size-3" />
            </a>
            <button onClick={onClose} className="w-full py-3 bg-foreground text-background font-mono text-xs tracking-widest uppercase">
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Receiver Wallet</label>
              <input
                type="text" value={receiver} onChange={(e) => setReceiver(e.target.value)}
                placeholder="Base58 public key"
                className="w-full px-3 py-2 bg-transparent border border-foreground/20 focus:border-foreground font-mono text-sm outline-none"
              />
              {checkingReceiver && <p className="font-mono text-xs text-muted-foreground">Verifying receiver credential...</p>}
              {receiverCred && (
                <div className={`flex items-center gap-1.5 font-mono text-xs ${receiverCred.canDeposit ? 'text-green-600' : 'text-destructive-foreground'}`}>
                  {receiverCred.canDeposit
                    ? <><ShieldCheck className="size-3" /> Credential active · Tier {receiverCred.tier}</>
                    : <><ShieldX className="size-3" /> Credential {receiverCred.status} — transfer will be rejected</>
                  }
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Amount (VAULT-{vault.ticker})
              </label>
              <input
                type="number" min="0" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-0 py-3 bg-transparent border-0 border-b border-foreground/20 focus:border-foreground text-2xl font-display outline-none placeholder:text-foreground/20"
              />
            </div>

            <div className="border border-foreground/10 p-3 text-xs font-mono text-muted-foreground space-y-1">
              <p>The underlying {vault.ticker}-mock stays in vault custody.</p>
              <p>Both sender and receiver credentials are verified on-chain.</p>
              <p>Current NAV: {vault.navDisplay}</p>
            </div>

            {error && <p className="font-mono text-xs text-destructive-foreground">{error}</p>}

            <button
              onClick={handleTransfer}
              disabled={submitting || !receiver || !amount || receiverCred?.canDeposit === false}
              className="w-full flex items-center justify-center gap-2 py-3 bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="size-3 animate-spin" /> : <ArrowLeftRight className="size-3" />}
              {submitting ? 'Transferring...' : 'Transfer Shares'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Vault Card ───────────────────────────────────────────────────────────────

function VaultCard({
  vault,
  onRefresh,
}: {
  vault: AssetVaultInfo;
  onRefresh: () => void;
}) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const { connected } = useWalletStore();

  const totalDepositsDisplay = (Number(vault.totalDeposits) / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const totalSupplyDisplay = (Number(vault.totalSupply) / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });

  return (
    <>
      <div className="border border-foreground/10 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-2xl">VAULT-{vault.ticker}</h3>
              {vault.paused && (
                <span className="px-2 py-0.5 text-xs font-mono bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                  PAUSED
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">
              Backed by {vault.ticker}-mock · Custody held on-chain
            </p>
          </div>
          <span className="font-display text-3xl">{vault.navDisplay}</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 border-t border-foreground/10 pt-4">
          <div>
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Total Deposits</p>
            <p className="font-mono text-sm mt-1">{totalDepositsDisplay} {vault.ticker}-mock</p>
          </div>
          <div>
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Shares Issued</p>
            <p className="font-mono text-sm mt-1">{totalSupplyDisplay} VAULT-{vault.ticker}</p>
          </div>
        </div>

        {/* Addresses */}
        <div className="space-y-1 text-xs font-mono text-muted-foreground border-t border-foreground/10 pt-4">
          <div className="flex justify-between">
            <span>Asset mint</span>
            <a href={`https://explorer.solana.com/address/${vault.assetMint}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground flex items-center gap-1">
              {vault.assetMint.slice(0, 8)}... <ExternalLink className="size-2.5" />
            </a>
          </div>
          <div className="flex justify-between">
            <span>Share mint</span>
            <a href={`https://explorer.solana.com/address/${vault.shareMint}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground flex items-center gap-1">
              {vault.shareMint.slice(0, 8)}... <ExternalLink className="size-2.5" />
            </a>
          </div>
        </div>

        {/* Actions */}
        {connected ? (
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setDepositOpen(true)}
              disabled={vault.paused}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowDownToLine className="size-3" /> Deposit
            </button>
            <button
              onClick={() => setTransferOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-foreground font-mono text-xs tracking-widest uppercase hover:bg-foreground hover:text-background transition-colors"
            >
              <ArrowLeftRight className="size-3" /> Transfer
            </button>
          </div>
        ) : (
          <p className="font-mono text-xs text-muted-foreground text-center border border-foreground/10 py-3">
            Connect wallet to deposit or transfer
          </p>
        )}
      </div>

      {depositOpen && (
        <DepositModal
          vault={vault}
          onClose={() => setDepositOpen(false)}
          onSuccess={() => { setDepositOpen(false); onRefresh(); }}
        />
      )}
      {transferOpen && (
        <TransferModal
          vault={vault}
          onClose={() => setTransferOpen(false)}
          onSuccess={() => { setTransferOpen(false); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VaultsPage() {
  const [vaults, setVaults] = useState<AssetVaultInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMultiVaults();
      setVaults(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load vaults');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur-sm border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/app" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Dashboard
            </Link>
            <div className="h-4 w-px bg-foreground/10" />
            <span className="font-display text-lg">Asset Vaults</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
              DEVNET
            </span>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 hover:bg-foreground/5 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 lg:px-12 py-8 space-y-6">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl tracking-tight">
            Tokenized Asset Vaults
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Deposit tokenized assets · Vault holds custody · Transfer positions between credentialed institutions
          </p>
        </div>

        {/* Escrow explanation */}
        <div className="border border-foreground/10 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            { step: '01', label: 'Deposit', desc: 'Asset tokens move into vault custody. You receive share tokens at current NAV.' },
            { step: '02', label: 'Transfer', desc: 'Transfer shares to another credentialed institution. Both sides verified on-chain. Asset stays in vault.' },
            { step: '03', label: 'Redeem', desc: 'Burn shares, receive asset tokens back at current NAV. No credential check on exit.' },
          ].map((item) => (
            <div key={item.step} className="flex gap-3">
              <span className="font-mono text-xs text-muted-foreground shrink-0 mt-0.5">{item.step}</span>
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground font-mono text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading vaults...
          </div>
        )}

        {error && (
          <div className="border border-destructive/20 bg-destructive/5 p-4 font-mono text-sm text-destructive-foreground">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {vaults.map((vault) => (
              <VaultCard key={vault.assetMint} vault={vault} onRefresh={load} />
            ))}
            {vaults.length === 0 && (
              <p className="text-muted-foreground font-mono text-sm col-span-2">
                No vaults registered. Run the setup script first.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Program: 6Mbzwuw8...</span>
          <span className="text-foreground/20">·</span>
          <a
            href="https://explorer.solana.com/address/6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D?cluster=devnet"
            target="_blank" rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            View on Solscan ↗
          </a>
        </div>
      </main>
    </div>
  );
}
