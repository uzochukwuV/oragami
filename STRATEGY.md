# Oragami — Strategic Documentation
> Written: March 29, 2026 | Deadline: March 29, 2026 22:00
> StableHacks 2026 — Track 4: RWA-Backed Stablecoin & Commodity Vaults

---

## Table of Contents

1. [What to Pitch](#1-what-to-pitch)
2. [What to Build](#2-what-to-build)
3. [Complete Remaining Implementation Plan](#3-complete-remaining-implementation-plan)
4. [Devnet Build Issues with Robust Tests](#4-devnet-build-issues-with-robust-tests)
5. [Demo Script](#5-demo-script)
6. [Risk Register](#6-risk-register)

---

## 1. What to Pitch

### The Product Story

Pitch **both contracts as a single institutional infrastructure layer**. They are not competing products — they are complementary layers that share one compliance credential, one backend, and one frontend.

```
Layer 1 — Yield Vault (oragami-vault, ihUcHpWk...)
  "Institutions deposit USDC. The vault allocates a portion to Solstice USX
   for delta-neutral yield. NAV is priced against a basket of Gold (50%),
   CHF/USD (30%), and Solstice eUSX (20%) via SIX Exchange live data.
   cVAULT is the receipt token. This is the yield product — institutions
   earn while holding."

Layer 2 — Asset Custody & Exchange (multi-asset-vault, 6Mbzwuw8...)
  "Institutions deposit actual tokenized assets — Gold, Silver, T-bills.
   The vault takes custody in a PDA token account. VAULT-GOLD and
   VAULT-SILVER are the receipt tokens, priced at SIX NAV.
   transfer_shares executes compliance-gated position transfers between
   institutions — both sender AND receiver credentials are verified
   on-chain before any transfer. The underlying asset never moves.
   The vault is the central counterparty. Zero counterparty risk."

The Bridge:
  "Both layers share the same compliance infrastructure — one soulbound
   credential PDA gates access to both. One backend indexes both. One
   frontend shows both. A single institution credential issued by AMINA
   Bank gives access to the yield vault AND the asset exchange."
```

### Why This Wins Track 4

| Criterion | How Oragami Delivers |
|-----------|---------------------|
| **RWA-Backed** | cVAULT backed by USDC collateral priced via SIX Exchange. VAULT-GOLD backed by actual tokenized gold. Real mTLS-authenticated SIX API calls. |
| **Institutional-Grade** | Soulbound compliance credentials, FATF Travel Rule enforcement for deposits >= 1000 USDC, on-chain credential verification for every operation. |
| **Solana Native** | Three Anchor programs deployed on devnet. Token-2022 transfer hook for secondary market compliance. PDA-based credential system. |
| **Yield** | Solstice USX integration for delta-neutral yield. NAV crank every 2 minutes with live SIX data. Yield accrual tracked on-chain and indexed in PostgreSQL. |
| **Scalable** | Factory pattern on multi-asset vault — one program, unlimited asset vaults. Backend indexes everything. Frontend polls every 30s. |

### The Elevator Pitch (30 seconds)

> Oragami is institutional RWA infrastructure on Solana. Two products, one compliance layer. The yield vault lets institutions deposit USDC and earn delta-neutral yield priced against Gold and CHF via SIX Exchange. The custody vault lets institutions deposit tokenized assets and trade positions through the vault as central counterparty — both sides verified on-chain before any transfer. One credential. Two products. Zero counterparty risk.

### What NOT to Pitch

- Do NOT present the contracts as separate products. They are one system.
- Do NOT pitch the `oragami-asset` scaffold — it is vestigial and unfinished.
- Do NOT claim Solstice CPI is fully integrated — the yield tick stub runs, but the full CPI (mint USX -> lock -> distribute) is post-hackathon.
- Do NOT pitch WebSocket real-time push — polling at 30s intervals is sufficient for the demo.

---

## 2. What to Build

### Current State (Honest Inventory)

#### Solana Programs — COMPLETE (deployed to devnet)

| Program | ID | Instructions | Status |
|---------|-----|-------------|--------|
| `oragami-vault` | `ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP` | 14 instructions, 5 account types | Deployed, functional |
| `multi-asset-vault` | `6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D` | 8 instructions, factory pattern | Deployed, GOLD + SILVER vaults live |
| `cvault-transfer-hook` | `965gkqvNvYbUsSdqz4AB3YvBw9hqQuNeKMYzHxQBsP1N` | 6 instructions, transfer hook | Deployed, functional |

All three contracts are deployed on devnet. No contract changes are needed for the demo. The escrow function is already implemented via `transfer_shares` which validates both sender and receiver credentials before executing.

#### Backend — MOSTLY COMPLETE (NestJS, port 3210)

| Module | Endpoint(s) | Status |
|--------|------------|--------|
| Credentials | `/api/credentials/*` | COMPLETE |
| Travel Rule | `/api/travel-rule/*` | COMPLETE |
| Deposits | `/api/deposits/*` | COMPLETE |
| Vault State | `/api/vault/*` | COMPLETE |
| Multi-Asset Vault | `/api/multi-vault/*` | COMPLETE (untested) |
| NAV Crank | Cron every 2 min | RUNNING |
| Health | `/health`, `/health/cranks` | COMPLETE |
| Audit Log | `/api/audit/*` | NOT BUILT |
| Yield Crank | Full Solstice CPI | STUB ONLY |
| Transfer Indexing | DB table + endpoint | NOT BUILT |
| Multi-Asset NAV Crank | GOLD/SILVER NAV updates | NOT BUILT |

#### Frontend — LANDING PAGE COMPLETE, APP PARTIALLY WIRED (Next.js, port 3000)

| Route | Status | Issue |
|-------|--------|-------|
| `/` (landing) | COMPLETE | — |
| `/app` (dashboard) | EXISTS but broken | `useVaultState` fetches from nonexistent SIX routes |
| `/onboard/*` | EXISTS | 4 pages, needs wiring to backend |
| Multi-asset vault page | NOT BUILT | No page for GOLD/SILVER vaults |
| NAV sparkline chart | NOT BUILT | `recharts` installed, not used |
| Deposit preflight | NOT WIRED | `VaultPanel` calls on-chain directly, skips preflight |
| Portfolio page | NOT BUILT | — |

### What Must Be Built (Priority Order)

**Priority 1 — Wire Frontend to Backend (FE-W1)** — 45 min
The single most important task. The NAV must be moving when the judge watches. Currently `useVaultState.ts` fetches from `${API_BASE_URL}/six/metal/GOLD` and `${API_BASE_URL}/six/forex/CHF/USD` — these routes do not exist on the NestJS backend. The SIX service is internal to the backend, not exposed as REST routes. Replace with `/api/vault/nav/current`.

**Priority 2 — NAV Sparkline Chart (FE-W2)** — 30 min
A visual proof that the NAV is dynamic. `recharts` is already installed via shadcn/ui.

**Priority 3 — Deposit Preflight + Indexing (FE-W3)** — 45 min
Wire `VaultPanel.tsx` to call `POST /api/deposits/preflight` before showing the deposit button, and `POST /api/deposits/index` after tx confirms.

**Priority 4 — Onboarding Flow (FE-W4)** — 1 hour
Wire the existing `/onboard/*` pages to backend credential endpoints. Without this, judges hit the dashboard without credentials and see errors.

**Priority 5 — Multi-Asset Vault Page (FE-W5)** — 1.5 hours
The demo moment: Institution A deposits GOLD-mock, transfers VAULT-GOLD to Institution B, with both credential checks shown in the UI.

**Priority 6 — Audit Log API (BE-W1)** — 30 min
Judges from AMINA Bank and SIX will ask "where's the audit trail?"

**Priority 7 — Multi-Asset NAV Crank (BE-W3)** — 30 min
Extend NAV crank to update VAULT-GOLD NAV with live gold price.

**Priority 8 — Transfer Indexing (BE-W2)** — 30 min
DB table + endpoint for share transfers in multi-asset vault.

### What to Skip

- **Full yield crank (ISSUE #7)** — the minimal stub in the NAV crank already calls `process_yield` and records `YieldEvent`. The full Solstice CPI (mint USX -> lock -> distribute) is a production concern.
- **WebSocket gateway** — polling every 30s is fine for a 5-minute demo.
- **Portfolio page** — nice to have, not critical. The dashboard shows TVL and NAV.
- **Admin panel** — credential issuance happens through the onboarding flow.
- **oragami-asset program** — scaffold only, not integrated, not relevant to the demo.

---

## 3. Complete Remaining Implementation Plan

### Build Order (6 hours total)

```
Phase 1: Frontend-Backend Integration (2 hours)
  FE-W1  Wire useVaultState to /api/vault/nav/current ........... 45 min
  FE-W2  NAV sparkline chart from /api/vault/nav/history ........ 30 min
  FE-W3  Deposit preflight + indexing wired to backend .......... 45 min

Phase 2: Onboarding (1 hour)
  FE-W4  Onboarding flow (3 pages, backend endpoints exist) ..... 1 hour

Phase 3: Multi-Asset Vault (1.5 hours)
  FE-W5  Multi-asset vault page with deposit + transfer modals .. 1.5 hours

Phase 4: Backend Completion (1.5 hours)
  BE-W1  Audit log API (one Prisma query, table already populated) 30 min
  BE-W3  Extend NAV crank to update VAULT-GOLD NAV ................ 30 min
  BE-W2  Transfer indexing DB table + endpoint ..................... 30 min

Phase 5: Demo Hardening (1 hour)
  End-to-end demo run .............................................. 30 min
  Fix broken flows, verify Solscan links ........................... 30 min
```

### Critical Path

```
FE-W1 (NAV moving) → FE-W2 (NAV chart) → FE-W3 (deposit works)
  → FE-W4 (onboarding gate) → FE-W5 (multi-asset demo moment)
    → BE-W1 (audit trail) → BE-W3 (GOLD NAV moving) → BE-W2 (transfer indexed)
      → E2E demo run
```

FE-W1 is the single most critical task. If the NAV is not moving when the judge watches, the entire story falls apart.

---

## 4. Devnet Build Issues with Robust Tests

### BUILD ISSUE #1 — Wire Frontend to Backend NAV

**Labels:** `frontend` `critical` `blocking`
**Estimate:** 45 min
**Depends on:** Nothing (backend endpoints already exist and are running)

**Problem:**
`useVaultState.ts` (line 112-114) fetches from:
- `${API_BASE_URL}/six/metal/GOLD`
- `${API_BASE_URL}/six/forex/CHF/USD`

These routes do not exist on the NestJS backend. The SIX service is an internal service used by the NAV crank — it is not exposed as REST routes. The frontend gets `404` on both calls, so `goldPrice` and `chfUsd` are always `null`.

Additionally, the vault state is read directly from on-chain via Anchor, bypassing the backend entirely. This means the frontend cannot benefit from the backend's cached data, aggregated stats, or NAV history.

**Solution:**

Replace direct SIX fetch and direct chain read with backend API calls:

1. **Replace SIX price fetch** with `GET /api/vault/nav/current`
   - Backend returns: `{ navBps, goldPrice, chfUsd, eusxNav, timestamp }`
   - This is a fast DB-only query (last NavSnapshot row)
   - Poll every 30s for the live ticker

2. **Add vault stats** from `GET /api/vault/stats`
   - Returns: `totalInstitutions`, `activeCredentials`, `totalDepositsUsd`, `currentApy`, `navChange24h`

3. **Keep on-chain read as fallback** for `totalDeposits`, `totalSupply`, `paused` if the backend `/api/vault/state` endpoint is slow

**Files to change:**
- `oragami-frontend/features/vault/useVaultState.ts` — rewrite `fetchAll` callback
- `oragami-frontend/lib/constants.ts` — verify `API_BASE_URL` points to `http://localhost:3210`

**Implementation:**

```typescript
// useVaultState.ts — new fetchAll
const fetchAll = useCallback(async () => {
  try {
    // 1. Fast path: backend NAV (DB-only, ~5ms)
    const navRes = await fetch(`${API_BASE_URL}/api/vault/nav/current`);
    const navData = await navRes.json();

    // 2. Stats (aggregated)
    const statsRes = await fetch(`${API_BASE_URL}/api/vault/stats`);
    const statsData = await statsRes.json();

    // 3. On-chain state (fallback for fields backend doesn't return)
    let onChain: any = null;
    try {
      const provider = getReadonlyProvider();
      const program = new Program(oragamiVaultIdl as Idl, provider);
      const [vaultStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from(VAULT_STATE_SEED)],
        VAULT_PROGRAM_ID
      );
      onChain = await (program.account as any).vaultState.fetch(vaultStatePda);
    } catch {}

    const navBps = navData.navBps ?? NAV_BPS_DENOMINATOR;
    const goldPrice = navData.goldPrice ?? null;
    const chfUsd = navData.chfUsd ?? null;

    setStats({
      navPriceBps: navBps,
      navDisplay: `$${navBpsToPrice(navBps)}`,
      tvlUsdc: statsData.totalDepositsUsd ?? 0,
      tvlDisplay: formatUsdc(statsData.totalDepositsUsd ?? 0),
      totalSupply: onChain?.totalSupply?.toNumber?.() ?? 0,
      supplyDisplay: formatCvault(onChain?.totalSupply?.toNumber?.() ?? 0),
      usxAllocationBps: onChain?.usxAllocationBps ?? 7000,
      usxAllocationPct: `${((onChain?.usxAllocationBps ?? 7000) / 100).toFixed(0)}%`,
      apy: statsData.currentApy ?? 5.0,
      paused: onChain?.paused ?? false,
      initialized: true,
      goldPrice,
      chfUsd,
      lastUpdated: new Date(),
    });

    setBasket([
      { symbol: 'XAU', name: 'Gold', weight: 50, price: goldPrice, currency: 'USD/oz' },
      { symbol: 'CHF', name: 'CHF/USD', weight: 30, price: chfUsd, currency: 'USD' },
      { symbol: 'USX', name: 'Solstice USX', weight: 20, price: 1.0, currency: 'USD' },
    ]);

    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to fetch vault state');
  } finally {
    setIsLoading(false);
  }
}, []);
```

**Robust Test (Devnet):**

```typescript
// oragami-frontend/__tests__/useVaultState.test.ts
// Run with: npx jest --testPathPattern=useVaultState

import { renderHook, waitFor } from '@testing-library/react';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Anchor
jest.mock('@coral-xyz/anchor', () => ({
  Program: jest.fn().mockReturnValue({
    account: {
      vaultState: {
        fetch: jest.fn().mockResolvedValue({
          navPriceBps: { toNumber: () => 10432 },
          totalDeposits: { toNumber: () => 1_000_000_000 },
          totalSupply: { toNumber: () => 958_000_000 },
          usxAllocationBps: 7000,
          paused: false,
        }),
      },
    },
  }),
  AnchorProvider: jest.fn(),
  Idl: jest.fn(),
}));

jest.mock('@/lib/constants', () => ({
  SOLANA_RPC_URL: 'https://api.devnet.solana.com',
  VAULT_PROGRAM_ID: { toString: () => 'ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP' },
  VAULT_STATE_SEED: 'vault_state',
  API_BASE_URL: 'http://localhost:3210',
  NAV_BPS_DENOMINATOR: 10000,
}));

describe('useVaultState', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should fetch NAV from /api/vault/nav/current and display live data', async () => {
    // Arrange: mock backend responses
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          navBps: 10432,
          goldPrice: 2351.50,
          chfUsd: 1.1234,
          eusxNav: 1.0012,
          timestamp: new Date().toISOString(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalInstitutions: 3,
          activeCredentials: 2,
          totalDepositsUsd: 1000000000,
          currentApy: 5.0,
          navChange24h: 0.43,
        }),
      });

    // Act
    const { useVaultState } = require('@/features/vault/useVaultState');
    const { result } = renderHook(() => useVaultState(60000));

    // Assert
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats.navPriceBps).toBe(10432);
    expect(result.current.stats.navDisplay).toBe('$1.0432');
    expect(result.current.stats.goldPrice).toBe(2351.50);
    expect(result.current.stats.chfUsd).toBe(1.1234);
    expect(result.current.stats.initialized).toBe(true);
    expect(result.current.error).toBeNull();

    // Verify correct API calls
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3210/api/vault/nav/current');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3210/api/vault/stats');
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/six/metal/GOLD')
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/six/forex/CHF/USD')
    );
  });

  it('should handle backend failure gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { useVaultState } = require('@/features/vault/useVaultState');
    const { result } = renderHook(() => useVaultState(60000));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
  });

  it('should update basket prices from backend NAV data', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          navBps: 10500,
          goldPrice: 2400.00,
          chfUsd: 1.1300,
          eusxNav: 1.0020,
          timestamp: new Date().toISOString(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalInstitutions: 5,
          activeCredentials: 4,
          totalDepositsUsd: 2000000000,
          currentApy: 5.2,
          navChange24h: 0.50,
        }),
      });

    const { useVaultState } = require('@/features/vault/useVaultState');
    const { result } = renderHook(() => useVaultState(60000));

    await waitFor(() => {
      expect(result.current.basket[0].price).toBe(2400.00);
      expect(result.current.basket[1].price).toBe(1.1300);
      expect(result.current.basket[2].price).toBe(1.0);
    });
  });
});
```

**Acceptance Criteria:**
- [ ] `useVaultState` calls `/api/vault/nav/current` and `/api/vault/stats`
- [ ] No calls to `/six/metal/GOLD` or `/six/forex/CHF/USD`
- [ ] NAV display shows live price (not `$1.0000`)
- [ ] Gold and CHF prices appear in basket
- [ ] Polling interval configurable (default 30s)
- [ ] All 3 test cases pass

---

### BUILD ISSUE #2 — Deposit Preflight + Indexing

**Labels:** `frontend` `vault` `high`
**Estimate:** 45 min
**Depends on:** BUILD ISSUE #1

**Problem:**
`VaultPanel.tsx` calls the on-chain `deposit` instruction directly without:
1. Pre-flight validation (credential check, travel rule check, NAV estimate)
2. Post-deposit indexing (the backend never learns about the deposit)

This means:
- No credential verification before deposit (user could deposit without a valid credential, tx fails on-chain with a confusing error)
- No travel rule warning (deposits >= 1000 USDC require travel rule data)
- No estimated cVAULT shown before signing
- Deposits are never indexed in the backend DB, so `/api/deposits/institution/:wallet` returns empty

**Solution:**

1. **Before deposit:** Call `POST /api/deposits/preflight` with `{ wallet, usdcAmount }`
   - Show `estimatedCvault` and `currentNav`
   - If `requiresTravelRule`, show travel rule form
   - If `!canDeposit`, show reason and block deposit button

2. **After deposit tx confirms:** Call `POST /api/deposits/index` with `{ txSignature, wallet, usdcAmount, cvaultAmount, nonce }`

**Files to change:**
- `oragami-frontend/features/vault/VaultPanel.tsx` — add preflight call in `DepositTab`
- `oragami-frontend/services/vault-operations.ts` — add `indexDeposit` helper

**Implementation:**

```typescript
// VaultPanel.tsx — DepositTab changes

const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
const [preflightLoading, setPreflightLoading] = useState(false);

// On amount change (debounced)
useEffect(() => {
  if (!amount || parseFloat(amount) <= 0) {
    setPreflight(null);
    return;
  }
  const timer = setTimeout(async () => {
    setPreflightLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/deposits/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey?.toBase58(),
          usdcAmount: Math.floor(parseFloat(amount) * 1_000_000).toString(),
        }),
      });
      const data = await res.json();
      setPreflight(data);
    } catch (err) {
      setPreflight(null);
    } finally {
      setPreflightLoading(false);
    }
  }, 500);
  return () => clearTimeout(timer);
}, [amount, publicKey]);

// After deposit tx confirms
const handleDepositConfirmed = async (txSignature: string) => {
  try {
    await fetch(`${API_BASE_URL}/api/deposits/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txSignature,
        wallet: publicKey?.toBase58(),
        usdcAmount: Math.floor(parseFloat(amount) * 1_000_000).toString(),
        cvaultAmount: preflight?.estimatedCvault ?? '0',
        nonce: crypto.randomUUID(),
      }),
    });
  } catch (err) {
    console.error('Failed to index deposit:', err);
  }
};
```

**Robust Test (Devnet):**

```typescript
// oragami-frontend/__tests__/depositPreflight.test.ts

const API_BASE = 'http://localhost:3210';

describe('Deposit Preflight + Indexing', () => {
  const testWallet = 'DEMO_WALLET_TIER3_ADDRESS'; // seeded institution

  it('should return canDeposit=true for valid wallet with active credential', async () => {
    const res = await fetch(`${API_BASE}/api/deposits/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: testWallet,
        usdcAmount: '100000000', // 100 USDC
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.canDeposit).toBe(true);
    expect(data.credentialStatus).toBe('active');
    expect(data.estimatedCvault).toBeDefined();
    expect(data.requiresTravelRule).toBe(false);
    expect(data.currentNav).toBeGreaterThan(0);
  });

  it('should require travel rule for deposits >= 1000 USDC', async () => {
    const res = await fetch(`${API_BASE}/api/deposits/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: testWallet,
        usdcAmount: '1000000000', // 1000 USDC
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.requiresTravelRule).toBe(true);
  });

  it('should reject deposit for wallet without credential', async () => {
    const fakeWallet = '11111111111111111111111111111111';
    const res = await fetch(`${API_BASE}/api/deposits/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: fakeWallet,
        usdcAmount: '100000000',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.canDeposit).toBe(false);
    expect(data.reason).toBeDefined();
  });

  it('should index a confirmed deposit and return it in history', async () => {
    // Step 1: Index a mock deposit
    const indexRes = await fetch(`${API_BASE}/api/deposits/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txSignature: `test-tx-${Date.now()}`,
        wallet: testWallet,
        usdcAmount: '100000000',
        cvaultAmount: '95800000',
        nonce: `nonce-${Date.now()}`,
      }),
    });

    expect(indexRes.status).toBe(201);

    // Step 2: Verify it appears in institution deposits
    const histRes = await fetch(`${API_BASE}/api/deposits/institution/${testWallet}`);
    expect(histRes.status).toBe(200);
    const deposits = await histRes.json();
    expect(deposits.length).toBeGreaterThan(0);
    expect(deposits[0].usdcAmount).toBeDefined();
  });

  it('should estimate cVAULT correctly based on current NAV', async () => {
    const preflightRes = await fetch(`${API_BASE}/api/deposits/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: testWallet,
        usdcAmount: '1000000000', // 1000 USDC
      }),
    });

    const data = await preflightRes.json();
    const navBps = data.currentNav;
    const estimated = BigInt(data.estimatedCvault);
    const expected = (BigInt(1000000000) * BigInt(10000)) / BigInt(navBps);

    // Allow 1% tolerance for rounding
    const diff = Number(estimated - expected) / Number(expected);
    expect(Math.abs(diff)).toBeLessThan(0.01);
  });
});
```

**Acceptance Criteria:**
- [ ] Deposit tab shows estimated cVAULT before user signs
- [ ] Travel rule warning appears for amounts >= 1000 USDC
- [ ] Deposit button disabled if `!canDeposit`
- [ ] After tx confirms, deposit appears in `/api/deposits/institution/:wallet`
- [ ] All 5 test cases pass against devnet backend

---

### BUILD ISSUE #3 — Onboarding Flow + Credential Gate

**Labels:** `frontend` `onboarding` `high`
**Estimate:** 1 hour
**Depends on:** BUILD ISSUE #1

**Problem:**
The middleware.ts exists and checks credentials, but the onboarding pages (`/onboard/connect`, `/onboard/register`, `/onboard/pending`, `/onboard/complete`) are not fully wired to the backend. A judge who clicks "Launch App" either:
1. Lands directly on the dashboard without a credential (broken state)
2. Gets redirected to `/onboard/connect` but the page doesn't actually verify or issue credentials

Without this flow, the demo cannot onboard new judges/institutions.

**Solution:**

Wire the four onboarding pages to existing backend endpoints:

1. `/onboard/connect` — `WalletMultiButton` + `GET /api/credentials/:wallet/verify`
   - `active` -> redirect `/app`
   - `pending` -> redirect `/onboard/pending`
   - `not_found` -> redirect `/onboard/register`
   - `revoked` -> show error

2. `/onboard/register` — Form -> `POST /api/credentials` (using `NEXT_PUBLIC_ADMIN_API_KEY` for demo)
   - Fields: institution name, jurisdiction, tier, KYC level, AML score, expiry

3. `/onboard/pending` — Poll `GET /api/credentials/:wallet/verify` every 3s
   - On `active` -> redirect `/onboard/complete`
   - Timeout after 60s

4. `/onboard/complete` — Show success + "Enter Vault" button -> `/app`

**Files to change:**
- `oragami-frontend/app/onboard/connect/page.tsx`
- `oragami-frontend/app/onboard/register/page.tsx`
- `oragami-frontend/app/onboard/pending/page.tsx`
- `oragami-frontend/app/onboard/complete/page.tsx`
- `oragami-frontend/middleware.ts` — verify it redirects correctly

**Robust Test (Devnet):**

```typescript
// oragami-frontend/__tests__/onboarding.test.ts

const API_BASE = 'http://localhost:3210';
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || 'test-admin-key';

describe('Onboarding Flow', () => {
  const testWallet = `test-wallet-${Date.now()}`;

  it('should return not_found for unknown wallet', async () => {
    const res = await fetch(`${API_BASE}/api/credentials/${testWallet}/verify`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('not_found');
  });

  it('should issue a credential and verify it becomes active', async () => {
    // Step 1: Issue credential
    const issueRes = await fetch(`${API_BASE}/api/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_KEY,
      },
      body: JSON.stringify({
        wallet: testWallet,
        institutionName: 'Test Institution AG',
        jurisdiction: 'CH',
        tier: 3,
        kycLevel: 3,
        amlScore: 95,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    expect(issueRes.status).toBe(201);
    const issueData = await issueRes.json();
    expect(issueData.success).toBe(true);
    expect(issueData.credentialPda).toBeDefined();
    expect(issueData.txSignature).toBeDefined();

    // Step 2: Verify credential is active
    const verifyRes = await fetch(`${API_BASE}/api/credentials/${testWallet}/verify`);
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.status).toBe('active');
    expect(verifyData.tier).toBe(3);
  });

  it('should list issued credentials', async () => {
    const res = await fetch(`${API_BASE}/api/credentials`, {
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('should reject credential issue without admin key', async () => {
    const res = await fetch(`${API_BASE}/api/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: 'fake-wallet',
        institutionName: 'Fake',
        jurisdiction: 'US',
        tier: 1,
        kycLevel: 1,
        amlScore: 50,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(res.status).toBe(401);
  });

  it('should revoke a credential and verify status changes', async () => {
    const revokeRes = await fetch(`${API_BASE}/api/credentials/${testWallet}/revoke`, {
      method: 'PUT',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(revokeRes.status).toBe(200);

    const verifyRes = await fetch(`${API_BASE}/api/credentials/${testWallet}/verify`);
    const verifyData = await verifyRes.json();
    expect(verifyData.status).toBe('revoked');
  });

  it('should redirect middleware to /onboard/connect for uncredentialed wallets', async () => {
    // This test verifies the middleware logic
    // Simulate a request to /app with no wallet cookie
    const res = await fetch('http://localhost:3000/app', {
      redirect: 'manual',
    });
    // Should redirect to /onboard/connect
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/onboard/connect');
  });
});
```

**Acceptance Criteria:**
- [ ] `/onboard/connect` shows wallet button, checks credential, redirects correctly
- [ ] `/onboard/register` submits form to `POST /api/credentials`, redirects to pending
- [ ] `/onboard/pending` polls verify endpoint, redirects to complete on `active`
- [ ] `/onboard/complete` shows success, "Enter Vault" button goes to `/app`
- [ ] Middleware redirects uncredentialed users from `/app` to `/onboard/connect`
- [ ] All 6 test cases pass against devnet

---

## 5. Demo Script (5 minutes)

```
0:00 — Open landing page
  "Oragami is institutional RWA infrastructure on Solana. Two products,
   one compliance layer. Built for StableHacks Track 4."

0:30 — Show the NAV ticker moving
  "The NAV crank runs every 2 minutes. It fetches live Gold and CHF/USD
   prices from SIX Exchange — real mTLS-authenticated API calls — and
   updates the on-chain NAV. Watch it tick."

1:00 — Connect wallet, go through onboarding
  "Every institution needs a soulbound credential. KYC level, AML score,
   jurisdiction — stored on-chain. No credential, no entry."

1:30 — Deposit USDC into cVAULT
  "100 USDC at NAV $1.0432 -> 95.78 cVAULT. The backend calls preflight,
   checks the credential, estimates the shares. User signs once."

2:00 — Show NAV chart
  "30 days of NAV history. Gold moved, NAV moved. This is what
   RWA-backed means."

2:30 — Switch to multi-asset vault
  "Now the custody product. Institution A deposits 1000 GOLD-mock tokens.
   The vault takes custody. VAULT-GOLD shares minted at current NAV."

3:00 — Transfer shares to Institution B
  "Institution A transfers 500 VAULT-GOLD to Institution B. Watch what
   happens: the contract checks BOTH credentials before executing.
   Institution B's KYC is verified on-chain. The gold never moves —
   it stays in the vault. Zero counterparty risk."

3:30 — Show the on-chain events on Solscan
  "DepositMade. TransferMade. Both events on-chain. Full audit trail.
   FATF Travel Rule tracked for large positions."

4:00 — Show the compliance dashboard
  "Every operation indexed. Credential status, deposit history,
   transfer history. Exportable for regulatory reporting."

4:30 — Close
  "One credential. Two products. Yield vault for returns, custody vault
   for institutional asset exchange. Built on Solana, priced by SIX
   Exchange, compliant by design."
```

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SIX API down during demo | Low | High | NAV crank caches last known prices. Backend falls back to `SIX-cached` source. Pre-seed 30 days of NAV history. |
| Devnet SOL insufficient | Medium | Medium | Airdrop 5 SOL before demo. Have backup wallet with SOL. |
| Backend crashes during demo | Low | High | Pre-start backend 10 min before demo. Health endpoint monitors all services. |
| Phantom wallet not connecting | Low | High | Test with Phantom + Solflare. Have backup wallet imported. |
| NAV not moving | Medium | Critical | FE-W1 is the first thing to build. Verify NAV crank is running via `/health/cranks`. |
| Credential on-chain tx fails | Low | High | Pre-issue credentials for 2 demo wallets. Use the onboarding flow only for the live demo. |
| Multi-asset vault not initialized | Low | Medium | Factory + GOLD/SILVER vaults are already initialized on devnet. Verify before demo. |

---

## Answer to the Original Three Questions

**1. Should you pitch the asset vault or the first contract?**
Both. They are one system. Contract 1 is the yield layer (USDC in, SIX-priced NAV, Solstice yield). Contract 2 is the custody and exchange layer (actual asset tokens in, vault as escrow, compliance-gated transfers between institutions). One credential gates both. That's a stronger story than either alone.

**2. Should you improve the contract to have escrow function?**
It already has it. `transfer_shares` validates both sender and receiver credentials before executing. The underlying asset stays in the vault PDA throughout — the vault is always the custodian. That is the escrow function. No contract changes needed.

**3. Should you implement the backend and frontend?**
Yes, in this exact order:
- FE-W1 (45 min) — Wire `useVaultState` to `/api/vault/nav/current`. This is the single most important thing. The NAV must be moving when the judge watches.
- FE-W2 (30 min) — NAV sparkline chart from `/api/vault/nav/history`
- FE-W3 (45 min) — Deposit preflight + indexing wired to backend
- FE-W4 (1 hour) — Onboarding flow (3 pages, backend endpoints already exist)
- FE-W5 (1.5 hours) — Multi-asset vault page with deposit + transfer modals
- BE-W1 (30 min) — Audit log API (one Prisma query, table already populated)
- BE-W3 (30 min) — Extend NAV crank to update VAULT-GOLD NAV with live gold price
- BE-W2 (30 min) — Transfer indexing DB table + endpoint

Total: ~6 hours. The demo script is in this document — 5 minutes, hits every judge criterion.
