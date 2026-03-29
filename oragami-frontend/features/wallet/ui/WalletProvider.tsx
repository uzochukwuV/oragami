'use client';

import { useEffect, useRef } from 'react';
import { useWalletStore } from '@/features/wallet/model/store';

const WALLET_COOKIE_NAME = 'wallet';
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

function setWalletCookie(publicKey: string) {
  document.cookie = `${WALLET_COOKIE_NAME}=${publicKey}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function clearWalletCookie() {
  document.cookie = `${WALLET_COOKIE_NAME}=; path=/; max-age=0`;
}

/**
 * Syncs the Zustand wallet store with a cookie that the Next.js middleware
 * can read to enforce credential-based route protection.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const publicKey = useWalletStore((s) => s.publicKey);
  const connected = useWalletStore((s) => s.connected);
  const prevConnected = useRef(false);

  useEffect(() => {
    if (connected && publicKey) {
      setWalletCookie(publicKey);
    } else if (prevConnected.current && !connected) {
      clearWalletCookie();
    }
    prevConnected.current = connected;
  }, [connected, publicKey]);

  return <>{children}</>;
}
