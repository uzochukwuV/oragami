'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWalletStore } from '@/features/wallet/model/store';
import { verifyCredential } from '@/shared/api';

export default function PendingPage() {
  const router = useRouter();
  const publicKey = useWalletStore((s) => s.publicKey);
  const [elapsed, setElapsed] = useState(0);
  const [timeoutReached, setTimeoutReached] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      router.replace('/onboard/connect');
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await verifyCredential(publicKey);
        if (res.status === 'active') {
          clearInterval(interval);
          router.replace('/onboard/complete');
        }
      } catch {
        // backend unreachable — keep polling
      }
    }, 3000);

    const timer = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= 60) {
          setTimeoutReached(true);
          clearInterval(interval);
          clearInterval(timer);
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [publicKey, router]);

  return (
    <Card className="border-foreground/10">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 size-12 rounded-full bg-foreground/5 flex items-center justify-center">
          <Loader2 className="size-6 text-foreground/60 animate-spin" />
        </div>
        <CardTitle className="font-display text-2xl">Verifying Credential</CardTitle>
        <CardDescription>
          Your credential is being issued on-chain...
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        {timeoutReached ? (
          <div className="p-3 border border-destructive/20 bg-destructive/5 text-sm text-destructive-foreground">
            Taking longer than expected — please contact support or try again.
          </div>
        ) : (
          <p className="text-xs text-muted-foreground font-mono">
            Polling credential status... {elapsed}s
          </p>
        )}
      </CardContent>
    </Card>
  );
}
