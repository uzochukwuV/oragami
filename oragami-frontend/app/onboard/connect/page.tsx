'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, ShieldAlert, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWalletStore } from '@/features/wallet/model/store';
import { verifyCredential, type CredentialStatus } from '@/shared/api';

const WALLET_COOKIE_NAME = 'wallet';
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

function setWalletCookie(publicKey: string) {
  document.cookie = `${WALLET_COOKIE_NAME}=${publicKey}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export default function ConnectPage() {
  const router = useRouter();
  const { connected, publicKey, connecting, setConnecting, connect } = useWalletStore();
  const [checking, setChecking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkCredential = useCallback(
    async (wallet: string) => {
      setChecking(true);
      setError(null);
      try {
        const res = await verifyCredential(wallet);
        switch (res.status) {
          case 'active':
            router.replace('/app');
            break;
          case 'pending':
            router.replace('/onboard/pending');
            break;
          case 'revoked':
          case 'expired':
            setRevoked(true);
            setChecking(false);
            break;
          case 'not_found':
            router.replace('/onboard/register');
            break;
          default:
            router.replace('/onboard/register');
        }
      } catch {
        // Backend unreachable or wallet not found — send to register
        router.replace('/onboard/register');
      }
    },
    [router],
  );

  // If already connected, verify and redirect
  useEffect(() => {
    if (connected && publicKey) {
      checkCredential(publicKey);
    }
  }, [connected, publicKey, checkCredential]);

  const handleConnect = async () => {
    setConnecting(true);
    setRevoked(false);
    setError(null);

    const phantom = (window as any).solana;
    if (!phantom?.isPhantom) {
      window.open('https://phantom.app/', '_blank');
      setConnecting(false);
      return;
    }

    try {
      const response = await phantom.connect();
      const pk = response.publicKey.toBase58();
      const signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
        const result = await phantom.signMessage(message);
        return result.signature;
      };
      connect(pk, signMessage);
      setWalletCookie(pk);
    } catch (err: any) {
      console.error('Failed to connect wallet:', err);
      setError(err?.message || 'Failed to connect wallet');
      setConnecting(false);
    }
  };

  return (
    <Card className="border-foreground/10">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 size-12 rounded-full bg-foreground/5 flex items-center justify-center">
          <Wallet className="size-6 text-foreground/60" />
        </div>
        <CardTitle className="font-display text-2xl">Institutional Access</CardTitle>
        <CardDescription>
          Connect your wallet to begin the onboarding process
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Connect button */}
        <button
          onClick={handleConnect}
          disabled={connecting || checking}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(connecting || checking) && (
            <span className="animate-spin h-3 w-3 border border-background border-t-transparent rounded-full" />
          )}
          {checking
            ? 'Verifying credential...'
            : connecting
              ? 'Connecting...'
              : connected
                ? 'Connected — checking...'
                : 'Connect Phantom'}
          {!connecting && !checking && !connected && <ArrowRight className="size-3" />}
        </button>

        {/* Revoked error */}
        {revoked && (
          <div className="flex items-start gap-2 p-3 border border-destructive/20 bg-destructive/5 text-sm">
            <ShieldAlert className="size-4 text-destructive-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-destructive-foreground">Credential Revoked</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Your institutional credential has been revoked or expired. Please contact
                support for re-issuance.
              </p>
            </div>
          </div>
        )}

        {/* Generic error */}
        {error && (
          <div className="p-3 border border-destructive/20 bg-destructive/5 text-sm text-destructive-foreground">
            {error}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          By connecting, you agree to the Oragami Vault Terms of Service. Your wallet
          address will be used for on-chain credential verification.
        </p>
      </CardContent>
    </Card>
  );
}
