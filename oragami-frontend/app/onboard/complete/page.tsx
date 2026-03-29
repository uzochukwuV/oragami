'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWalletStore, useTruncatedPublicKey } from '@/features/wallet/model/store';
import { verifyCredential, type CredentialVerifyResponse } from '@/shared/api';

export default function CompletePage() {
  const router = useRouter();
  const publicKey = useWalletStore((s) => s.publicKey);
  const truncatedKey = useTruncatedPublicKey();
  const [credential, setCredential] = useState<CredentialVerifyResponse | null>(null);

  useEffect(() => {
    if (!publicKey) {
      router.replace('/onboard/connect');
      return;
    }
    verifyCredential(publicKey)
      .then(setCredential)
      .catch(() => {});
  }, [publicKey, router]);

  const tierLabels: Record<number, string> = { 1: 'Retail', 2: 'Professional', 3: 'Institutional' };

  return (
    <Card className="border-foreground/10">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 size-12 rounded-full bg-foreground/5 flex items-center justify-center">
          <Check className="size-6 text-foreground" />
        </div>
        <CardTitle className="font-display text-2xl">You're Verified</CardTitle>
        <CardDescription>Welcome to Oragami Vault</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {credential && (
          <div className="border border-foreground/10 rounded-lg divide-y divide-foreground/10 text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Wallet</span>
              <span className="font-mono">{truncatedKey}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Tier</span>
              <span>{tierLabels[credential.tier] || `Tier ${credential.tier}`}</span>
            </div>
            {credential.expiresAt && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Expires</span>
                <span>{new Date(credential.expiresAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => router.push('/app/dashboard')}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-foreground/90 transition-colors"
        >
          Enter Vault
        </button>
      </CardContent>
    </Card>
  );
}
