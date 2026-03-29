# Oragami — Frontend Flow & Implementation Issues

> Complete user journey map + GitHub-style issues for every screen.
> Stack: Next.js 15 App Router · Tailwind · shadcn/ui · Zustand · @solana/wallet-adapter

---

## Current State

```
/ (landing)          ✅ exists — full marketing page
/app                 ✅ exists — vault dashboard (deposit/redeem/convert)
```

**What's missing:** There is no path between landing and the vault dashboard that
enforces compliance. A user who clicks "Launch App" lands directly on the vault
operations panel with no credential check, no onboarding, and no registration.
The backend has full credential + travel-rule + deposit-index APIs — none of them
are wired to the frontend yet.

---

## Target Route Map

```
/                           Landing page (exists)
/app                        Protected shell — redirects to /onboard if no credential
  /app/dashboard            Vault dashboard (replaces current /app/page.tsx)
  /app/deposit              Deposit flow (multi-step)
  /app/portfolio            Institution portfolio — deposits + P&L
  /app/history              NAV chart + yield history

/onboard                    Onboarding shell
  /onboard/connect          Step 1 — connect wallet
  /onboard/register         Step 2 — institution registration form
  /onboard/pending          Step 3 — waiting for admin to issue credential
  /onboard/complete         Step 4 — credential confirmed, enter vault

/admin                      Admin panel (ADMIN_API_KEY gated)
  /admin/credentials        Issue / revoke credentials
  /admin/deposits           All deposits table
  /admin/audit              Audit event log
```

---

## User Journeys

### Journey A — New Institution (first visit)

```
Landing → "Launch App"
  → /app (middleware checks credential)
  → no credential → redirect /onboard/connect
  → connect Phantom wallet
  → /onboard/register — fill institution name, jurisdiction, tier
  → POST /api/credentials (admin issues on-chain credential)
  → /onboard/pending — poll GET /api/credentials/:wallet/verify
  → status === 'active' → /onboard/complete
  → enter /app/dashboard
```

### Journey B — Returning Institution (credential active)

```
Landing → "Launch App"
  → /app (middleware checks credential via GET /api/credentials/:wallet/verify)
  → status === 'active' → /app/dashboard
```

### Journey C — Deposit (< 1000 USDC, no travel rule)

```
/app/dashboard → "Deposit"
  → /app/deposit
  → Step 1: enter USDC amount
  → POST /api/deposits/preflight → { canDeposit, requiresTravelRule: false, estimatedCvault }
  → Step 2: review — show estimated cVAULT at current NAV
  → Step 3: sign & submit on-chain tx
  → POST /api/deposits/index (index the confirmed tx)
  → success → /app/portfolio
```

### Journey D — Deposit (≥ 1000 USDC, travel rule required)

```
/app/deposit
  → Step 1: enter amount ≥ 1000 USDC
  → POST /api/deposits/preflight → { requiresTravelRule: true }
  → Step 2: travel rule form — originator name/account, beneficiary name
  → POST /api/travel-rule → { unsignedTransactionBase64, nonceHash }
  → Step 3: sign travel-rule tx in wallet
  → Step 4: review deposit + sign deposit tx
  → POST /api/deposits/index with travelRuleNonceHash
  → success → /app/portfolio
```

### Journey E — Admin issues credential

```
/admin/credentials
  → enter wallet, institution name, jurisdiction, tier, KYC level, AML score, expiry
  → POST /api/credentials (with ADMIN_API_KEY header)
  → credential issued on-chain + DB
  → institution moves from /onboard/pending → /onboard/complete
```

---

## Issues

---

### ISSUE #FE-01 — API client layer (`shared/api/index.ts`) ✅ COMPLETED
**Labels:** `foundation` `blocking`
**Estimate:** 1 hour

Replace the current stub with a typed client covering every backend endpoint.

**Endpoints to add:**
```ts
// Vault
getNavCurrent()                          // GET /api/vault/nav/current
getNavHistory(limit)                     // GET /api/vault/nav/history
getYieldHistory(limit)                   // GET /api/vault/yield/history
getVaultStats()                          // GET /api/vault/stats
getVaultState()                          // GET /api/vault/state

// Credentials
verifyCredential(wallet)                 // GET /api/credentials/:wallet/verify
issueCredential(dto, adminKey)           // POST /api/credentials
revokeCredential(wallet, adminKey)       // PUT /api/credentials/:wallet/revoke

// Deposits
preflightDeposit(wallet, usdcAmount)     // POST /api/deposits/preflight
indexDeposit(dto)                        // POST /api/deposits/index
getDepositsForWallet(wallet)             // GET /api/deposits/institution/:wallet

// Travel Rule
submitTravelRule(dto)                    // POST /api/travel-rule
getTravelRule(nonceHash)                 // GET /api/travel-rule/:nonceHash

// Health
getHealth()                              // GET /health
getCrankHealth()                         // GET /health/cranks
```

**Types to export:**
- `CredentialVerifyResponse` — `{ wallet, status, tier, expiresAt, requiresTravelRule }`
- `PreflightResponse` — `{ canDeposit, reason, requiresTravelRule, credentialStatus, currentNav, estimatedCvault }`
- `TravelRuleResponse` — `{ nonceHash, nonceBase58, travelRulePda, unsignedTransactionBase64, lastValidBlockHeight }`
- `DepositRecord` — `{ id, txSignature, usdcAmount, cvaultAmount, navAtDeposit, currentNavBps, pnlBps, timestamp }`
- `NavSnapshot` — `{ navBps, source, goldPrice, chfUsd, eusxNav, timestamp }`

**Acceptance criteria:**
- All functions return typed responses
- All functions throw a typed `ApiError` with `status` and `message` on non-2xx
- `NEXT_PUBLIC_API_URL` env var used as base

---

### ISSUE #FE-02 — Wallet provider + credential middleware ✅ COMPLETED
**Labels:** `foundation` `blocking`
**Estimate:** 1.5 hours
**Depends on:** #FE-01

**Tasks:**

1. Install `@solana/wallet-adapter-react`, `@solana/wallet-adapter-wallets`, `@solana/wallet-adapter-react-ui`
2. Wrap `app/layout.tsx` with `WalletProvider` + `ConnectionProvider`
3. Replace the current Zustand `useWalletStore` manual Phantom binding with wallet-adapter — keep the store but source `publicKey` and `connected` from adapter
4. Create `middleware.ts` at project root:
   - Matches `/app/*` routes
   - Reads `wallet` cookie (set on connect)
   - Calls `verifyCredential(wallet)` — if `status !== 'active'` redirect to `/onboard/connect`
   - Skip middleware for `/onboard/*` and `/admin/*`
5. On wallet connect: set `wallet` cookie (httpOnly: false, so middleware can read it client-side via `document.cookie`)

**Note:** Middleware runs on the edge — use `fetch` directly, not the API client.

---

### ISSUE #FE-03 — Onboarding shell + Step 1: Connect wallet (`/onboard/connect`)
**Labels:** `onboarding`
**Estimate:** 1 hour
**Depends on:** #FE-02

**Route:** `app/onboard/connect/page.tsx`

**UI:**
- Centered card, Oragami logo
- Headline: "Institutional Access"
- Sub: "Connect your wallet to begin the onboarding process"
- `<WalletMultiButton />` from wallet-adapter-ui (styled to match existing design)
- On connect → check `verifyCredential(wallet)`:
  - `active` → redirect `/app/dashboard`
  - `pending` → redirect `/onboard/pending`
  - `not_found` → redirect `/onboard/register`
  - `revoked` → show revoked error, no redirect

---

### ISSUE #FE-04 — Onboarding Step 2: Institution registration (`/onboard/register`)
**Labels:** `onboarding`
**Estimate:** 1.5 hours
**Depends on:** #FE-03

**Route:** `app/onboard/register/page.tsx`

**Form fields:**
| Field | Type | Validation |
|-------|------|------------|
| Institution Name | text | required, max 64 chars |
| Jurisdiction | select | ISO 3166 — CH, DE, US, GB, SG, AE, JP |
| Tier | radio | 1 = Retail, 2 = Professional, 3 = Institutional |
| KYC Level | radio | 1 = Basic, 2 = Enhanced, 3 = Full |
| AML Score | slider | 0–100 |
| Credential Expiry | date | must be future |

**On submit:**
- This is a demo — call `POST /api/credentials` with the `NEXT_PUBLIC_ADMIN_API_KEY` env var
- In production this would be an admin-only action; for the hackathon demo the frontend self-issues
- On success → redirect `/onboard/pending`
- On error → show inline error

**Note:** Add `NEXT_PUBLIC_ADMIN_API_KEY` to `.env.local` — this is the demo shortcut.

---

### ISSUE #FE-05 — Onboarding Step 3: Pending credential (`/onboard/pending`)
**Labels:** `onboarding`
**Estimate:** 45 min
**Depends on:** #FE-04

**Route:** `app/onboard/pending/page.tsx`

**UI:**
- Animated spinner / pulse
- "Your credential is being issued on-chain..."
- Poll `GET /api/credentials/:wallet/verify` every 3 seconds
- On `status === 'active'` → redirect `/onboard/complete`
- Show credential PDA address once active (from `getByWallet` response)
- Timeout after 60s → show "Taking longer than expected — contact support"

---

### ISSUE #FE-06 — Onboarding Step 4: Complete (`/onboard/complete`)
**Labels:** `onboarding`
**Estimate:** 30 min
**Depends on:** #FE-05

**Route:** `app/onboard/complete/page.tsx`

**UI:**
- Green checkmark animation
- "You're verified. Welcome to Oragami Vault."
- Show: wallet address, tier, jurisdiction, credential expiry
- CTA button → "Enter Vault" → `/app/dashboard`

---

### ISSUE #FE-07 — Vault dashboard (`/app/dashboard`)
**Labels:** `vault` `core`
**Estimate:** 2 hours
**Depends on:** #FE-01, #FE-02

Move the current `/app/page.tsx` to `/app/dashboard/page.tsx` and wire it to the real backend.

**Changes from current implementation:**

1. **`useVaultState` hook** — replace the direct on-chain + broken SIX fetch with:
   - `GET /api/vault/nav/current` for the price ticker (fast, DB-only, poll every 30s)
   - `GET /api/vault/state` on mount only (slow, full chain read)
   - `GET /api/vault/stats` for TVL, institution count, navChange24h

2. **NAV chart** — add a small sparkline chart below `VaultStatsBar`:
   - Fetch `GET /api/vault/nav/history?limit=48`
   - Plot `navBps / 100` as USD price over time
   - Use `recharts` (already in the project via shadcn chart component)
   - Show gold price and CHF/USD from `rawPayload` as tooltips

3. **Credential status badge** — in the header, show the connected wallet's credential:
   - `GET /api/credentials/:wallet/verify`
   - Green "Verified · Tier 2" badge or yellow "Credential Expiring" if < 30 days

4. **Remove** the broken SIX direct fetch (`/six/metal/GOLD`, `/six/forex/CHF/USD`) — these routes don't exist on the backend. Use `navCurrent.goldPrice` and `navCurrent.chfUsd` instead.

---

### ISSUE #FE-08 — Deposit flow (`/app/deposit`)
**Labels:** `vault` `core`
**Estimate:** 3 hours
**Depends on:** #FE-01, #FE-07

**Route:** `app/deposit/page.tsx` — multi-step wizard

**Step 1 — Amount**
- USDC amount input
- On blur/change: call `POST /api/deposits/preflight`
- Show: `estimatedCvault`, `currentNav`, `canDeposit`, `requiresTravelRule`
- If `!canDeposit` show reason and block Next button
- If `requiresTravelRule` show travel rule notice

**Step 2a — Travel Rule (conditional, only if `requiresTravelRule`)**
- Fields: originator name, originator account (IBAN/wallet), beneficiary name
- On Next: `POST /api/travel-rule` → get `unsignedTransactionBase64`
- Deserialize the base64 tx, send to wallet for signing
- Submit signed tx to Solana RPC
- Store `nonceHash` in component state

**Step 2b — Review (no travel rule)**
- Show deposit summary: amount, estimated cVAULT, NAV, fees
- "Confirm & Sign" button

**Step 3 — Sign & Submit**
- Build the on-chain deposit tx using `depositToVault()` from `vault-operations.ts`
- Sign and submit
- On confirm: `POST /api/deposits/index` with `{ txSignature, wallet, usdcAmount, cvaultAmount, nonce, travelRuleNonceHash? }`
- Redirect to `/app/portfolio`

**Step indicator** — show 2 or 3 steps at top depending on travel rule requirement.

---

### ISSUE #FE-09 — Institution portfolio (`/app/portfolio`)
**Labels:** `vault` `core`
**Estimate:** 2 hours
**Depends on:** #FE-01, #FE-08

**Route:** `app/portfolio/page.tsx`

**Data:** `GET /api/deposits/institution/:wallet`

**UI sections:**

1. **Summary bar**
   - Total deposited (sum of `usdcAmount`)
   - Current value (sum of `cvaultAmount * currentNavBps / 10000`)
   - Total P&L in USD and % (derived from `pnlBps`)
   - cVAULT balance (on-chain ATA balance)

2. **Deposits table**
   | Date | USDC Deposited | cVAULT Minted | NAV at Deposit | Current NAV | P&L |
   |------|---------------|---------------|----------------|-------------|-----|
   - `pnlBps` from API → display as `+2.34%` in green or `-0.12%` in red
   - Link each row to Solscan via `txSignature`

3. **Redeem button** per row → opens redeem modal (reuse `RedeemTab` from `VaultPanel`)

---

### ISSUE #FE-10 — NAV & yield history (`/app/history`)
**Labels:** `vault`
**Estimate:** 1.5 hours
**Depends on:** #FE-01

**Route:** `app/history/page.tsx`

**Sections:**

1. **NAV chart** — full page version
   - `GET /api/vault/nav/history?limit=200`
   - Line chart: NAV price (USD) over time
   - Overlay lines: gold price, CHF/USD (from `rawPayload`)
   - Time range selector: 24h / 7d / 30d / All
   - Source badge: "SIX Exchange · updated every 2 min"

2. **Yield events table**
   - `GET /api/vault/yield/history?limit=50`
   - Columns: Date, Total Deposits, APY, Yield Accrued, NAV Before → After
   - Shows the compounding effect over time

---

### ISSUE #FE-11 — Admin panel (`/admin`)
**Labels:** `admin`
**Estimate:** 2.5 hours
**Depends on:** #FE-01

**Route:** `app/admin/layout.tsx` — checks `NEXT_PUBLIC_ADMIN_API_KEY` is set, shows warning if not.

**Sub-routes:**

#### `/admin/credentials`
- Table: all institutions from `GET /api/credentials` (admin key required)
- Columns: wallet, name, jurisdiction, tier, status, expires, actions
- "Issue Credential" button → modal with the same form as `/onboard/register`
- "Revoke" button per row → `PUT /api/credentials/:wallet/revoke`
- Status badge: active (green) / pending (yellow) / revoked (red) / expired (orange)

#### `/admin/deposits`
- Table: all deposits from `GET /api/deposits` (admin key required)
- Columns: date, institution, USDC amount, cVAULT amount, NAV at deposit, travel rule
- Filter by institution wallet

#### `/admin/audit`
- Table: audit events (need `GET /api/audit` endpoint — see note below)
- Columns: timestamp, actor, role, action, result, tx signature

**Note:** The backend has `AuditEvent` in the DB but no `GET /api/audit` endpoint yet.
Add `GET /api/audit` (admin-gated) to the backend as part of this issue.

---

### ISSUE #FE-12 — Navigation + app shell
**Labels:** `foundation`
**Estimate:** 1 hour
**Depends on:** #FE-07

**Tasks:**

1. Create `app/app/layout.tsx` — the authenticated shell:
   - Sidebar (desktop) / bottom nav (mobile) with: Dashboard, Deposit, Portfolio, History
   - Header: Oragami logo, DEVNET badge, credential status, wallet button
   - Wraps all `/app/*` routes

2. Update landing page `Navigation` component:
   - "Launch App" CTA → `/app/dashboard` (middleware handles redirect to onboard if needed)
   - Add "Admin" link (hidden unless `NEXT_PUBLIC_ADMIN_API_KEY` is set)

3. Create `app/onboard/layout.tsx` — centered card layout with step progress indicator

---

### ISSUE #FE-13 — Real-time NAV ticker
**Labels:** `vault` `polish`
**Estimate:** 45 min
**Depends on:** #FE-07

Poll `GET /api/vault/nav/current` every 30 seconds.

- Show in the dashboard header: `cVAULT $1.0432 ↑ +0.12%`
- Animate the price change: green flash on increase, red flash on decrease
- Show `goldPrice` and `chfUsd` as sub-labels: `XAU $2,351 · CHF/USD $1.1234`
- Show "via SIX Exchange · 2 min ago" timestamp

This replaces the broken direct SIX fetch in `useVaultState`.

---

### ISSUE #FE-14 — Health status bar
**Labels:** `polish`
**Estimate:** 30 min
**Depends on:** #FE-01

Small status bar at the bottom of the app shell (or in the header).

- Poll `GET /health` every 60s
- Poll `GET /health/cranks` every 60s
- Show: DB ✓ · Solana ✓ · SIX ✓ · NAV crank: last run 2 min ago
- If any service is degraded → yellow warning icon
- If NAV crank hasn't run in > 10 min → "NAV stale" warning

---

## Implementation Order

```
Week 1 (foundation + onboarding)
  #FE-01  API client layer
  #FE-02  Wallet provider + middleware
  #FE-03  /onboard/connect
  #FE-04  /onboard/register
  #FE-05  /onboard/pending
  #FE-06  /onboard/complete
  #FE-12  Navigation + app shell

Week 2 (vault core)
  #FE-07  Dashboard (wire to real backend)
  #FE-08  Deposit flow (preflight + travel rule + index)
  #FE-09  Portfolio
  #FE-10  History

Week 3 (admin + polish)
  #FE-11  Admin panel
  #FE-13  Real-time NAV ticker
  #FE-14  Health status bar
```

---

## Environment Variables Required

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3210
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_ADMIN_API_KEY=change-me-before-demo   # matches backend ADMIN_API_KEY
NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID=3K8V8s8gQtvJVZxW8Z9DvLU4MgginGBx5Yvptb7o6dmT
```

---

## Key Design Decisions

**Self-issuing credentials in demo mode**
The backend `POST /api/credentials` is admin-gated. For the hackathon demo, the
frontend calls it directly using `NEXT_PUBLIC_ADMIN_API_KEY`. This is intentional —
it lets judges onboard themselves without needing a separate admin session.
In production this would be a back-office workflow.

**No server-side sessions**
Auth state is: wallet connected + credential active on-chain. The middleware reads
the wallet from a cookie set on connect and calls the backend verify endpoint.
No JWT, no session store.

**Travel rule UX**
The backend returns an `unsignedTransactionBase64` — the frontend deserializes it,
gets the user to sign it (Phantom), submits it to RPC, then proceeds with the
deposit. The `nonceHash` ties the travel rule record to the deposit record.

**NAV data source**
The frontend must NOT call SIX directly. All price data comes from the backend
(`/api/vault/nav/current` and `/api/vault/nav/history`). The NAV crank runs
every 2 minutes and stores gold + CHF prices in `rawPayload` — the frontend
just reads those.
