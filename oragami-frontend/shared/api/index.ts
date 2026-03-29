import { API_BASE_URL } from '@/lib/constants';

export interface HealthResponse {
  database: 'healthy' | 'degraded' | 'unhealthy';
  blockchain: 'healthy' | 'degraded' | 'unhealthy';
  six_connected?: boolean;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) throw new Error('Health check failed');
  const data = await res.json();
  return {
    database: data.db_connected ? 'healthy' : 'unhealthy',
    blockchain: data.solana_connected ? 'healthy' : 'unhealthy',
    six_connected: data.six_connected,
  };
}

export async function getVaultState() {
  const res = await fetch(`${API_BASE_URL}/api/vault/state`);
  if (!res.ok) throw new Error('Failed to fetch vault state');
  return res.json();
}

export async function getVaultStats() {
  const res = await fetch(`${API_BASE_URL}/api/vault/stats`);
  if (!res.ok) throw new Error('Failed to fetch vault stats');
  return res.json();
}

export async function getNavHistory(limit = 30) {
  const res = await fetch(`${API_BASE_URL}/api/vault/nav/history?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch NAV history');
  return res.json();
}

export async function verifyCredential(wallet: string) {
  const res = await fetch(`${API_BASE_URL}/api/credentials/${wallet}/verify`);
  if (!res.ok) throw new Error('Failed to verify credential');
  return res.json();
}
