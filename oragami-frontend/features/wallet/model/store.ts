/**
 * Wallet Store - Zustand store for wallet connection state
 * 
 * Provides wallet connection, message signing, and compliance tier management
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type ComplianceTier = 'basic' | 'enterprise';

interface WalletState {
  // Connection state
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  
  // Compliance tier
  complianceTier: ComplianceTier;
  
  // Sign message function (set when connected)
  signMessageFn: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  
  // Actions
  connect: (
    publicKey: string,
    signMessage: (message: Uint8Array) => Promise<Uint8Array>
  ) => void;
  disconnect: () => void;
  setConnecting: (connecting: boolean) => void;
  setComplianceTier: (tier: ComplianceTier) => void;
  signMessage: (message: string) => Promise<string>;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      // Initial state
      publicKey: null,
      connected: false,
      connecting: false,
      complianceTier: 'basic',
      signMessageFn: null,
      
      // Connect wallet
      connect: (publicKey, signMessage) => {
        set({
          publicKey,
          connected: true,
          connecting: false,
          signMessageFn: signMessage,
        });
      },
      
      // Disconnect wallet
      disconnect: () => {
        set({
          publicKey: null,
          connected: false,
          signMessageFn: null,
        });
      },
      
      // Set connecting state
      setConnecting: (connecting) => set({ connecting }),
      
      // Set compliance tier
      setComplianceTier: (tier) => set({ complianceTier: tier }),
      
      // Sign a message (returns base58 encoded signature)
      signMessage: async (message) => {
        const { signMessageFn, connected } = get();
        
        if (!connected || !signMessageFn) {
          throw new Error('Wallet not connected');
        }
        
        const messageBytes = new TextEncoder().encode(message);
        const signature = await signMessageFn(messageBytes);
        
        // Convert to base58
        const bs58 = await import('bs58');
        return bs58.default.encode(signature);
      },
    }),
    {
      name: 'wallet-storage',
      // Only persist compliance tier, not connection state
      partialize: (state) => ({
        complianceTier: state.complianceTier,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

/**
 * Check if user can use confidential transfers
 */
export function useCanUseConfidential(): boolean {
  return useWalletStore((state) => 
    state.connected && state.complianceTier === 'enterprise'
  );
}

/**
 * Get truncated public key for display
 */
export function useTruncatedPublicKey(chars: number = 4): string | null {
  return useWalletStore((state) => {
    if (!state.publicKey) return null;
    return `${state.publicKey.slice(0, chars)}...${state.publicKey.slice(-chars)}`;
  });
}
