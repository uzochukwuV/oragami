import { API_BASE_URL } from '@/lib/constants';

// ============================================================================
// Error type
// ============================================================================

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ============================================================================
// Internal fetch helper
// ============================================================================

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { adminKey?: string }
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };

  if (init?.adminKey) {
    headers['x-admin-api-key'] = init.adminKey;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      (body && (body.message || body.error)) || `API error ${res.status}`;
    throw new ApiError(
      res.status,
      Array.isArray(message) ? message.join('; ') : message,
      body
    );
  }

  return res.json() as Promise<T>;
}

// ============================================================================
// Types — Vault
// ============================================================================

export interface NavCurrentResponse {
  navBps: string | null;
  source: string | null;
  goldPrice: number | null;
  chfUsd: number | null;
  eusxNav: number | null;
  timestamp: string | null;
}

export interface NavSnapshot {
  id: string;
  navBps: string;
  source: string;
  goldPrice: number;
  chfUsd: number;
  eusxNav: number;
  timestamp: string;
  rawPayload?: unknown;
}

export interface YieldEvent {
  id: string;
  timestamp: string;
  totalDeposits: string;
  apyBps: number;
  yieldAccrued: string;
  navBefore: string;
  navAfter: string;
}

export interface VaultStatsResponse {
  totalInstitutions: number;
  activeCredentials: number;
  totalDepositsUsd: string;
  totalYieldDistributed: string;
  currentApy: number;
  navChange24h: number;
}

export interface VaultStateResponse {
  totalDeposits: string;
  totalSupply: string;
  navPriceBps: string;
  pendingYield: string;
  apyBps: number;
  usxAllocationBps: number;
  paused: boolean;
  lastYieldClaim: string;
  eusxPrice: number;
  sixStatus: {
    connected: boolean;
    lastSuccessAt: string | null;
    mtlsConfigured: boolean;
  };
  vaultUsxBalance: string;
  vaultEusxBalance: string;
}

// ============================================================================
// Types — Credentials
// ============================================================================

export type CredentialStatus = 'active' | 'pending' | 'revoked' | 'expired' | 'not_found';

export interface CredentialVerifyResponse {
  wallet: string;
  status: CredentialStatus;
  tier: number;
  expiresAt: string;
  requiresTravelRule: boolean;
}

export interface IssueCredentialDto {
  wallet: string;
  institutionName: string;
  jurisdiction: string;
  tier: 1 | 2 | 3;
  kycLevel: 1 | 2 | 3;
  amlScore: number;
  expiresAt: string;
}

export interface IssueCredentialResponse {
  success: boolean;
  credentialPda: string;
  txSignature: string;
}

export interface RevokeCredentialResponse {
  success: boolean;
  txSignature: string;
}

export interface Institution {
  id: string;
  wallet: string;
  institutionName: string;
  jurisdiction: string;
  tier: number;
  kycLevel: number;
  amlScore: number;
  status: string;
  credentialPda: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Types — Deposits
// ============================================================================

export interface PreflightDto {
  wallet: string;
  usdcAmount: string;
}

export interface PreflightResponse {
  canDeposit: boolean;
  reason?: string;
  requiresTravelRule: boolean;
  credentialStatus: string;
  currentNav: number;
  estimatedCvault: string;
}

export interface IndexDepositDto {
  txSignature: string;
  wallet: string;
  usdcAmount: string;
  cvaultAmount: string;
  nonce: string;
  travelRuleNonceHash?: string;
}

export interface IndexDepositResponse {
  success: boolean;
  depositId: string;
}

export interface DepositRecord {
  id: string;
  txSignature: string;
  wallet: string;
  usdcAmount: string;
  cvaultAmount: string;
  navAtDeposit: string;
  currentNavBps: string;
  pnlBps: number;
  timestamp: string;
  travelRule: TravelRuleRecord | null;
}

export interface TravelRuleRecord {
  nonceHash: string;
  originatorName: string;
  originatorAccount: string;
  beneficiaryName: string;
  onChain: string;
}

// ============================================================================
// Types — Travel Rule
// ============================================================================

export interface SubmitTravelRuleDto {
  wallet: string;
  usdcAmount: string;
  originatorName: string;
  originatorAccount: string;
  beneficiaryName: string;
}

export interface TravelRuleResponse {
  nonceHash: string;
  nonceBase58: string;
  travelRulePda: string;
  txSignature: string | null;
  unsignedTransactionBase64: string;
  lastValidBlockHeight: number;
}

export interface TravelRuleStatusResponse {
  nonceHash: string;
  pda: string;
  institutionWallet: string;
  usdcAmount: string;
  submittedAt: string;
  onChain: 'unknown' | 'initialized';
}

// ============================================================================
// Types — Health
// ============================================================================

export interface HealthResponse {
  status: 'ok' | 'degraded';
  solana_connected: boolean;
  six_connected: boolean;
  db_connected: boolean;
}

export interface CrankHealthResponse {
  nav_crank: {
    lastRun: string | null;
    lastSuccess: string | null;
  };
  yield_crank: {
    lastRun: string | null;
    lastSuccess: string | null;
  };
}

// ============================================================================
// Vault endpoints
// ============================================================================

export function getNavCurrent(): Promise<NavCurrentResponse> {
  return apiFetch<NavCurrentResponse>('/api/vault/nav/current');
}

export function getNavHistory(limit = 100): Promise<NavSnapshot[]> {
  return apiFetch<NavSnapshot[]>(`/api/vault/nav/history?limit=${limit}`);
}

export function getYieldHistory(limit = 100): Promise<YieldEvent[]> {
  return apiFetch<YieldEvent[]>(`/api/vault/yield/history?limit=${limit}`);
}

export function getVaultStats(): Promise<VaultStatsResponse> {
  return apiFetch<VaultStatsResponse>('/api/vault/stats');
}

export function getVaultState(): Promise<VaultStateResponse> {
  return apiFetch<VaultStateResponse>('/api/vault/state');
}

// ============================================================================
// Credential endpoints
// ============================================================================

export function verifyCredential(
  wallet: string
): Promise<CredentialVerifyResponse> {
  return apiFetch<CredentialVerifyResponse>(
    `/api/credentials/${wallet}/verify`
  );
}

export function issueCredential(
  dto: IssueCredentialDto,
  adminKey: string
): Promise<IssueCredentialResponse> {
  return apiFetch<IssueCredentialResponse>('/api/credentials', {
    method: 'POST',
    body: JSON.stringify(dto),
    adminKey,
  });
}

export function revokeCredential(
  wallet: string,
  adminKey: string
): Promise<RevokeCredentialResponse> {
  return apiFetch<RevokeCredentialResponse>(
    `/api/credentials/${wallet}/revoke`,
    { method: 'PUT', adminKey }
  );
}

export function getAllCredentials(adminKey: string): Promise<Institution[]> {
  return apiFetch<Institution[]>('/api/credentials', { adminKey });
}

// ============================================================================
// Deposit endpoints
// ============================================================================

export function preflightDeposit(
  dto: PreflightDto
): Promise<PreflightResponse> {
  return apiFetch<PreflightResponse>('/api/deposits/preflight', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export function indexDeposit(
  dto: IndexDepositDto
): Promise<IndexDepositResponse> {
  return apiFetch<IndexDepositResponse>('/api/deposits/index', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export function getDepositsForWallet(
  wallet: string
): Promise<DepositRecord[]> {
  return apiFetch<DepositRecord[]>(
    `/api/deposits/institution/${wallet}`
  );
}

export function getAllDeposits(adminKey: string): Promise<DepositRecord[]> {
  return apiFetch<DepositRecord[]>('/api/deposits', { adminKey });
}

// ============================================================================
// Travel Rule endpoints
// ============================================================================

export function submitTravelRule(
  dto: SubmitTravelRuleDto
): Promise<TravelRuleResponse> {
  return apiFetch<TravelRuleResponse>('/api/travel-rule', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export function getTravelRule(
  nonceHash: string
): Promise<TravelRuleStatusResponse> {
  return apiFetch<TravelRuleStatusResponse>(
    `/api/travel-rule/${nonceHash}`
  );
}

// ============================================================================
// Health endpoints
// ============================================================================

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}

export function getCrankHealth(): Promise<CrankHealthResponse> {
  return apiFetch<CrankHealthResponse>('/health/cranks');
}

// ============================================================================
// Multi-Asset Vault endpoints
// ============================================================================

export interface AssetVaultInfo {
  assetMint: string;
  shareMint: string;
  vaultTokenAccount: string;
  ticker: string;
  navPriceBps: string;
  navDisplay: string;
  totalDeposits: string;
  totalSupply: string;
  minDeposit: string;
  maxDeposit: string;
  paused: boolean;
}

export interface MultiVaultCredential {
  wallet: string;
  credentialPda: string;
  status: string;
  tier?: number;
  kycLevel?: number;
  amlCoverage?: number;
  jurisdiction?: string;
  expiresAt?: string;
  canDeposit: boolean;
}

export interface MultiVaultPreflight {
  canDeposit: boolean;
  reason?: string;
  credentialStatus: string;
  vault: { ticker: string; navPriceBps: string; navDisplay: string; paused: boolean };
  estimatedShares: string;
}

export function getMultiVaults(): Promise<AssetVaultInfo[]> {
  return apiFetch<AssetVaultInfo[]>('/api/multi-vault/vaults');
}

export function verifyMultiVaultCredential(wallet: string): Promise<MultiVaultCredential> {
  return apiFetch<MultiVaultCredential>(`/api/multi-vault/credentials/${wallet}`);
}

export function multiVaultFaucet(
  assetMint: string,
  wallet: string,
): Promise<{ success: boolean; ata: string; amount: number; txSignature: string }> {
  return apiFetch(`/api/multi-vault/vaults/${assetMint}/faucet`, {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  });
}

export function preflightMultiVaultDeposit(
  assetMint: string,
  wallet: string,
  amount: string,
): Promise<MultiVaultPreflight> {
  return apiFetch<MultiVaultPreflight>(`/api/multi-vault/vaults/${assetMint}/preflight`, {
    method: 'POST',
    body: JSON.stringify({ wallet, amount }),
  });
}
