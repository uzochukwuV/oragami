/**
 * Risk Check API service.
 * Connects to the /risk-check endpoint for wallet compliance analysis.
 */

import { API_BASE_URL } from '@/lib/constants';
import type { RiskCheckRequest, RiskCheckResponse } from '@/types/risk-check';

interface ApiError {
  error: {
    type: string;
    message: string;
  };
}

/**
 * Check a wallet address for compliance risks.
 * Returns either a blocked or analyzed response.
 *
 * @param address - Solana wallet address (Base58)
 * @throws Error if the request fails
 */
export async function checkWalletRisk(
  address: string
): Promise<RiskCheckResponse> {
  const request: RiskCheckRequest = { address };

  const response = await fetch(`${API_BASE_URL}/risk-check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      error: { type: 'unknown', message: 'Risk check failed' },
    }));
    throw new Error(error.error.message);
  }

  return response.json();
}
