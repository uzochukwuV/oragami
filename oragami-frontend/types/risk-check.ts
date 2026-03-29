/**
 * Risk Check API types.
 * Matches the backend /risk-check endpoint response schema.
 */

export interface RiskCheckRequest {
  address: string;
}

/** Blocked wallet response */
export interface BlockedResponse {
  status: 'blocked';
  address: string;
  reason: string;
}

/** Analyzed wallet response */
export interface AnalyzedResponse {
  status: 'analyzed';
  address: string;
  risk_score: number;
  risk_level: string;
  reasoning: string;
  has_sanctioned_assets: boolean;
  helius_assets_checked: boolean;
  from_cache: boolean;
  checked_at: string;
}

export type RiskCheckResponse = BlockedResponse | AnalyzedResponse;

/** Type guard for blocked response */
export function isBlockedResponse(
  response: RiskCheckResponse
): response is BlockedResponse {
  return response.status === 'blocked';
}

/** Type guard for analyzed response */
export function isAnalyzedResponse(
  response: RiskCheckResponse
): response is AnalyzedResponse {
  return response.status === 'analyzed';
}

/** Risk level thresholds for visual indicators */
export const RISK_THRESHOLDS = {
  LOW: 3,
  MEDIUM: 6,
  HIGH: 10,
} as const;

/** Get risk level color based on score */
export function getRiskColor(score: number): 'green' | 'yellow' | 'red' {
  if (score <= RISK_THRESHOLDS.LOW) return 'green';
  if (score <= RISK_THRESHOLDS.MEDIUM) return 'yellow';
  return 'red';
}
