# Oragami Vault — Backend Development Plan
> GitHub-style issue tracker format. Work top-to-bottom within each milestone.

---

## ⚠️ CONTRACT CHANGES REQUIRED BEFORE BACKEND STARTS

Before writing a single line of backend, two contract fixes are mandatory.
Both are blocking — backend code that calls the wrong on-chain shape will fail silently.

### CONTRACT FIX 1 — `VaultState::SIZE` is wrong ✅ COMPLETED
**Current constant:** 263 bytes
**Actual byte count (manual):**
```
8   discriminator
1   bump
32  cvault_mint
32  cvault_trade_mint
32  vault_token_account
32  treasury
32  authority
8   min_deposit
8   max_deposit
2   usx_allocation_bps
2   apy_bps
1   paused
8   total_deposits
8   total_supply
8   last_yield_claim
8   pending_yield
1   secondary_market_enabled
8   nav_price_bps
32  mock_usx_mint
─────
= 8+1+32+32+32+32+32+8+8+2+2+1+8+8+8+8+1+8+32 = 275 bytes
```
**Fix:** Change `pub const SIZE: usize = ...` to `275`.
Wrong space on `init` causes an `InsufficientFunds` error at account creation that
looks like a wallet balance problem — very hard to debug under hackathon pressure.

---

### CONTRACT FIX 2 — Real USX flow requires replacing `mock_usx_mint` with `usx_mint` ✅ COMPLETED

The mock mint design works for demo but judges will look for real Solstice integration.
Since the hackathon provides devnet USX, replace the mock with the real devnet USX mint.

**Changes to `VaultState`:**
```rust
// REMOVE
pub mock_usx_mint: Pubkey,   // we had this as a PDA we controlled

// ADD
pub usx_mint: Pubkey,        // the REAL Solstice devnet USX mint address
pub eusx_mint: Pubkey,       // the REAL Solstice devnet eUSX mint address
pub vault_usx_account: Pubkey,   // vault's ATA for USX (holding collateral in Solstice)
pub vault_eusx_account: Pubkey,  // vault's ATA for eUSX (the yield-bearing position)
```

**SIZE update after this change:**
Remove 32 (mock_usx_mint), add 32×4 (4 new pubkeys) = +96 net.
New SIZE = 275 - 32 + 128 = 371 bytes.

**Changes to `initialize_vault`:**
Add a new instruction `register_usx_accounts` (authority-only) that writes the four
pubkeys above into vault_state after the vault is deployed. This is cleaner than
cramming them into `initialize_vault` params which is already wide.

**Changes to `distribute_yield`:**
Remove the mock mint CPI. Replace with a real Solstice YieldVault CPI stub:
```rust
// stub — real CPI when Solstice devnet program ID is confirmed
pub fn distribute_yield(ctx: Context<DistributeYield>) -> Result<()> {
    // Step 1: Transfer pending_yield worth of USX from vault_usx_account → Solstice YieldVault
    // Step 2: Receive eUSX back into vault_eusx_account
    // Step 3: Reset pending_yield = 0
    // Step 4: Emit NAV update signal for backend to call set_nav
    emit!(YieldDistributed {
        usdc_yield: ctx.accounts.vault_state.pending_yield,
        timestamp: Clock::get()?.unix_timestamp,
    });
    ctx.accounts.vault_state.pending_yield = 0;
    Ok(())
}
```

**Add event types for backend indexing:**
```rust
#[event]
pub struct YieldDistributed {
    pub usdc_yield: u64,
    pub timestamp: i64,
}

#[event]
pub struct NavUpdated {
    pub nav_price_bps: u64,
    pub timestamp: i64,
}

#[event]
pub struct DepositMade {
    pub payer: Pubkey,
    pub usdc_amount: u64,
    pub cvault_amount: u64,
    pub timestamp: i64,
}
```
Backend subscribes to these via `connection.onLogs` — no polling needed.

---

## MILESTONE 0 — Project Scaffold
*Complete this before any feature work. ~2 hours.*

---

### ISSUE #1 — Initialize NestJS project with Prisma + PostgreSQL ✅ COMPLETED
**Labels:** `setup` `blocking`
**Estimate:** 45 min

**Tasks:**
- `nest new backend` → select npm
- Install deps: `@nestjs/config`, `@prisma/client`, `prisma`, `@solana/web3.js`,
  `@coral-xyz/anchor`, `@solana/spl-token`, `node-cron`, `axios`,
  `@nestjs/schedule`, `class-validator`, `class-transformer`
- `npx prisma init` → set `DATABASE_URL` in `.env`
- Create `docker-compose.yml` with PostgreSQL service (matches CaddyFinance approach)
- Set `main.ts` port to 3210, enable CORS for frontend origin
- Add `ConfigModule.forRoot({ isGlobal: true })` to `AppModule`

**Acceptance criteria:**
- `npm run start:dev` starts without errors
- `GET /` returns `{ status: 'ok', service: 'oragami-vault-backend' }`

---

### ISSUE #2 — Prisma schema (all tables) ✅ COMPLETED
**Labels:** `setup` `database` `blocking`
**Estimate:** 30 min
**Depends on:** #1

**Schema to create:**

```prisma
model Institution {
  id                String   @id @default(cuid())
  walletAddress     String   @unique
  name              String
  jurisdiction      String   // ISO 3166 e.g. "CH"
  tier              Int      // 1=retail 2=professional 3=institutional
  kycLevel          Int      // 1=basic 2=enhanced 3=full
  amlScore          Int      // 0-100
  credentialPda     String?  // on-chain PDA address
  credentialStatus  String   @default("pending") // pending|active|restricted|revoked
  credentialIssuedAt  DateTime?
  credentialExpiresAt DateTime?
  attestationHash   String?  // SHA-256 of KYC docs stored off-chain
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  deposits          Deposit[]
  travelRuleRecords TravelRule[]
  auditEvents       AuditEvent[]
}

model Deposit {
  id              String      @id @default(cuid())
  txSignature     String      @unique
  institutionId   String
  institution     Institution @relation(fields: [institutionId], references: [id])
  usdcAmount      BigInt
  cvaultAmount    BigInt
  navAtDeposit    BigInt      // nav_price_bps at time of deposit
  nonce           String      @unique
  travelRuleId    String?
  travelRule      TravelRule? @relation(fields: [travelRuleId], references: [id])
  timestamp       DateTime
  createdAt       DateTime    @default(now())
}

model TravelRule {
  id                 String      @id @default(cuid())
  pda                String      @unique  // on-chain PDA address
  institutionId      String
  institution        Institution @relation(fields: [institutionId], references: [id])
  originatorName     String
  originatorAccount  String
  beneficiaryName    String
  complianceHash     String      // SHA-256 of full travel rule packet
  nonceHash          String      @unique
  usdcAmount         BigInt
  submittedAt        DateTime
  deposits           Deposit[]
  createdAt          DateTime    @default(now())
}

model YieldEvent {
  id             String   @id @default(cuid())
  txSignature    String?
  totalDeposits  BigInt
  usxAllocationBps Int
  apyBps         Int
  daysElapsed    Int
  yieldAccrued   BigInt   // USDC units (6 decimals)
  navBeforeBps   BigInt
  navAfterBps    BigInt
  eusxPrice      Float?   // eUSX price from Solstice (HTTP API / on-chain) at time of event
  timestamp      DateTime
  createdAt      DateTime @default(now())
}

model NavSnapshot {
  id          String   @id @default(cuid())
  txSignature String?
  navBps      BigInt
  source      String   // "SIX" | "manual" | "solstice_eusx"
  rawPayload  Json?    // full SIX API response stored for audit
  timestamp   DateTime
  createdAt   DateTime @default(now())
}

model AuditEvent {
  id            String      @id @default(cuid())
  institutionId String?
  institution   Institution? @relation(fields: [institutionId], references: [id])
  actor         String      // wallet address or "system"
  role          String      // "admin"|"compliance"|"crank"|"institution"
  action        String      // "issue_credential"|"deposit"|"redeem"|"set_nav"|etc
  result        String      // "success"|"failed"
  txSignature   String?
  metadata      Json?       // any extra context
  timestamp     DateTime    @default(now())
}
```

**Tasks:**
- Write schema above to `prisma/schema.prisma`
- `npx prisma db push`
- `npx prisma generate`
- Write seed script: 2 demo institutions, 1 with active credential

---

## MILESTONE 1 — Solana Client Layer
*The shared service that all other modules talk to. ~3 hours.*

---

### ISSUE #3 — Anchor client singleton service ✅ COMPLETED ✅ COMPLETED
**Labels:** `blockchain` `blocking`
**Estimate:** 1 hour
**Depends on:** #1

**File:** `src/solana/anchor.service.ts`

**Tasks:**
- Load `idl.json` (export from anchor build)
- Load vault authority keypair from `VAULT_AUTHORITY_KEYPAIR` env var (base58 or JSON array)
- Create `AnchorProvider` with `Connection` to `SOLANA_RPC_URL` env var
- Export typed `Program<OragamiVault>` instance
- Expose helper: `confirmTx(sig)` — retries 3× with 2s delay before throwing
- Expose helper: `readVaultState()` — fetches and deserializes vault_state PDA
- Expose helper: `readCredential(wallet: PublicKey)` — fetches ComplianceCredential PDA
- Expose helper: `deriveCredentialPda(wallet)` → PDA address (seeds: ["credential", wallet])
- Expose helper: `deriveTravelRulePda(payer, nonceHash)` → PDA address

**Environment variables required:**
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
VAULT_AUTHORITY_KEYPAIR=[...] # JSON array of private key bytes
VAULT_PROGRAM_ID=GRk6Qv4rAzWf1DiKPv5FLKPvGKkk8rEdNGDoK6VMf8sX
```

---

### ISSUE #4 — Solstice USX instruction service ✅ COMPLETED ✅ COMPLETED
**Labels:** `blockchain` `yield`
**Estimate:** 1 hour
**Depends on:** #3

**File:** `src/solana/solstice.service.ts`

**Important — no public npm SDK:** There is **no** published `@solsticelabs/usx-client-sdk` on the public npm registry. Integration uses Solstice’s **HTTP Instructions API** (same flow as the reference at the bottom of **`SOLICTICE.md`** in this repo): `POST {SOLSTICE_API_URL}/v1/instructions` with header `x-api-key: SOLSTICE_API_KEY` and JSON body `{ type, data }` for instruction kinds such as `RequestMint`, `ConfirmMint`, `Lock`, etc.

**Equivalent to the old SDK mental model:**

| Intent | Instruction type(s) on the API |
|--------|-------------------------------|
| Mint USX from USDC | `RequestMint` → `ConfirmMint` (collateral `usdc` / `usdt`) |
| Lock USX → eUSX | `Lock` |
| Unlock / withdraw / redeem | `Unlock`, `Withdraw`, `RequestRedeem`, `ConfirmRedeem` (see `SOLICTICE.md`) |

**Tasks:**
- Wire `SolsticeService` to `AnchorService` (shared `Connection` + vault authority `Keypair`)
- Implement HTTP client + optional **curl fallback** for environments where Node `fetch` fails (per `SOLICTICE.md`)
- Method `getEusxNav(): Promise<number>` — cached 60s; optional `SOLSTICE_EUSX_NAV_OVERRIDE`, or ratio from `SOLSTICE_YIELD_RESERVE_USX_ACCOUNT` + eUSX mint supply, else conservative `1.0`
- Method `mintUsx(usdcAmount: bigint): Promise<string>` — builds `RequestMint` + `ConfirmMint` (+ idempotent USX/eUSX ATAs), signs and sends, returns tx signature
- Method `lockUsxForYield(usxAmount: bigint): Promise<string>` — `Lock` instruction, returns sig
- Method `getVaultYieldPosition()` — reads authority’s eUSX ATA via `@solana/spl-token`, applies NAV

**Reference:** Copy/adapt the Nest `SolsticeService` block at the end of **`SOLICTICE.md`** (that doc uses `backend/src/solstice/...`; this project uses `src/solana/solstice.service.ts`).

**Note on devnet USX:** The hackathon may airdrop devnet USX to the vault authority wallet. Confirm devnet program IDs and mints with hackathon docs / Discord.

---

### ISSUE #5 — SIX API service ✅ COMPLETED
**Labels:** `data` `nav`
**Estimate:** 1 hour
**Depends on:** #1

**File:** `src/data/six.service.ts`

**What SIX Web API provides:**
SIX uses REST/JSON with OAuth2 bearer token auth. The endpoint structure for FX data:
```
GET https://api.six-group.com/api/findata/v1/instruments/referenceData
    ?instrumentIds=USDCHF&instrumentIdType=Symbol
Authorization: Bearer {token}
```
For NAV-relevant data (e.g. if vault holds Swiss T-bills or gold equivalent via SIX):
```
GET https://api.six-group.com/api/findata/v1/instruments/eod?instrumentIds={id}
```

**Tasks:**
- Store `SIX_CLIENT_ID`, `SIX_CLIENT_SECRET`, `SIX_BASE_URL` in env
- Implement OAuth2 client credentials flow: POST to token endpoint, cache token until expiry
- Method `getFxRate(pair: string): Promise<number>` — e.g. `getFxRate('USDCHF')` → 0.8923
- Method `getInstrumentNav(isin: string): Promise<number>` — for RWA collateral price
- Method `computeVaultNav(totalDeposits: bigint, eusxNav: number, fxRate: number): bigint`
  - Formula: `nav_bps = floor((eusxNav * fxRate * NAV_BPS_DENOMINATOR))` adjusted for USX allocation
  - Full formula: `nav = ((usxAlloc/10000 * eusxNav) + (1 - usxAlloc/10000)) * 10000`
  - Returns as bigint nav_price_bps for `set_nav` instruction
- Fallback: if SIX token fetch fails, use last cached value and log warning
- Expose `getSixStatus(): { connected: boolean, lastSuccessAt: Date | null }`

**Environment variables:**
```env
SIX_CLIENT_ID=your_client_id
SIX_CLIENT_SECRET=your_client_secret
SIX_BASE_URL=https://api.six-group.com
SIX_TOKEN_URL=https://api.six-group.com/oauth2/token
```

---

## MILESTONE 2 — Crank Services (Scheduled Jobs)
*The two most important backend functions — NAV update and yield accrual. ~3 hours.*

---

### ISSUE #6 — NAV update crank ✅ COMPLETED
**Labels:** `crank` `nav` `critical`
**Estimate:** 1.5 hours
**Depends on:** #3, #4, #5

**File:** `src/crank/nav-crank.service.ts`

**Schedule:** Every 15 minutes during market hours (Mon–Fri 08:00–18:00 UTC).
For hackathon demo: every 2 minutes unconditionally.

**Full flow:**
```
1. sixService.getFxRate('USDCHF')                    ← SIX API (real data)
2. solsticeService.getEusxNav()                      ← Solstice service (cached NAV)
3. sixService.computeVaultNav(totalDeps, eusx, fx)   ← compute nav_price_bps
4. anchorService.readVaultState()                    ← get current nav for guard check
5. If |new_nav - current_nav| < 50% → proceed
6. program.methods.setNav({ navPriceBps: newNav })
         .accounts({ vaultState, authority })
         .rpc()
7. prisma.navSnapshot.create({
     navBps: newNav, source: 'SIX', rawPayload: sixRawResponse
   })
8. prisma.auditEvent.create({ actor: 'system', action: 'set_nav', ... })
```

**Tasks:**
- `@Cron('*/2 * * * *')` decorator (use `@nestjs/schedule`)
- Full flow above with try/catch on each step independently
- If SIX fails: use last known FX rate, mark `source: 'manual'`, continue
- If Solstice fails: use `eusxNav = 1.0`, continue  
- If `set_nav` tx fails: log, do NOT retry immediately (guard against 50% flip)
- Emit `NavUpdated` event to any connected WebSocket clients (for frontend live ticker)
- Method `getLastNavUpdate(): NavSnapshot` — used by dashboard endpoint

---

### ISSUE #7 — Yield accrual crank ❌ NOT IMPLEMENTED
**Labels:** `crank` `yield` `critical`
**Estimate:** 1.5 hours
**Depends on:** #3, #4

**File:** `src/crank/yield-crank.service.ts`

**Schedule:** Daily at 00:05 UTC. For hackathon demo: every 10 minutes.

**Full flow:**
```
1. anchorService.readVaultState()
   → get total_deposits, usx_allocation_bps, apy_bps, last_yield_claim, pending_yield

2. Compute expected yield (mirrors on-chain logic exactly — use same integer math):
   days_elapsed = floor((now - last_yield_claim) / 86400)
   if days_elapsed == 0 → skip
   daily_yield = total_deposits * usx_alloc / 10000 * apy / 10000 / 365
   accrued = daily_yield * days_elapsed

3. Call process_yield on-chain:
   program.methods.processYield()
          .accounts({ vaultState, authority })
          .rpc()

4. Read updated vault_state.pending_yield

5. If pending_yield > DISTRIBUTE_THRESHOLD (e.g. 1_000_000 = 1 USDC):
   a. solsticeService.mintUsx(pendingYield)     ← USDC → USX
   b. solsticeService.lockUsxForYield(usxAmt)   ← USX → eUSX
   c. program.methods.distributeYield()          ← resets pending_yield on-chain
             .accounts({...})
             .rpc()

6. prisma.yieldEvent.create({
     totalDeposits, usxAllocationBps, apyBps,
     daysElapsed, yieldAccrued: accrued,
     navBeforeBps, navAfterBps,
     eusxPrice: await solsticeService.getEusxNav()
   })

7. Trigger NAV crank immediately after yield distribution
   (because eUSX position changed, NAV should update)
```

**Tasks:**
- Full flow above
- Add `DISTRIBUTE_THRESHOLD` env var (default 1_000_000 = 1 USDC, 6 decimals)
- Idempotency check: read `last_yield_claim` from chain before calling — if within last hour, skip
- On Solstice CPI failure: log, do NOT reset pending_yield, retry next cycle
- Expose `getYieldHistory(days: number): YieldEvent[]` for dashboard

---

## MILESTONE 3 — API Modules
*The REST API the frontend calls. ~5 hours.*

---

### ISSUE #8 — Credentials module ✅ COMPLETED
**Labels:** `api` `compliance`
**Estimate:** 1.5 hours
**Depends on:** #2, #3

**Base path:** `/api/credentials`

**Endpoints:**

```
POST   /api/credentials              Issue credential (admin only)
GET    /api/credentials              List all (admin/compliance)
GET    /api/credentials/:wallet      Get by wallet address
PUT    /api/credentials/:wallet/revoke   Revoke (admin only)
GET    /api/credentials/:wallet/verify  Verify status (used by frontend pre-deposit)
```

**POST /api/credentials — full detail:**
```typescript
// Body DTO
class IssueCredentialDto {
  wallet: string;           // base58 public key
  institutionName: string;  // max 64 chars
  jurisdiction: string;     // 2-char ISO e.g. "CH"
  tier: 1 | 2 | 3;
  kycLevel: 1 | 2 | 3;
  amlScore: number;         // 0-100
  expiresAt: string;        // ISO 8601 datetime
  // attestation docs are submitted as multipart (or base64)
  // backend computes SHA-256 and stores attestationHash
}

// Service flow:
// 1. Hash the attestation package: SHA-256 of JSON.stringify(body)
// 2. Encode institutionName to [u8; 64] (UTF-8, null-padded)
// 3. Encode jurisdiction to [u8; 4]
// 4. Derive credential PDA
// 5. Call program.methods.issueCredential(params).accounts({...}).rpc()
// 6. prisma.institution.upsert({ walletAddress: wallet, credentialStatus: 'active', ... })
// 7. prisma.auditEvent.create({ action: 'issue_credential', ... })
// 8. Return { success: true, credentialPda, txSignature }
```

**GET /api/credentials/:wallet/verify:**
```typescript
// Used by frontend to gate deposit UI
// Returns:
{
  wallet: string,
  status: 'active' | 'expired' | 'revoked' | 'not_found',
  tier: number,
  expiresAt: string,
  requiresTravelRule: boolean  // always true — frontend uses this
}
```

**Tasks:**
- `CredentialsModule`, `CredentialsController`, `CredentialsService`
- All 5 endpoints above
- Auth guard: `X-Admin-Key` header check against `ADMIN_API_KEY` env var for POST/PUT
- Input validation with `class-validator`
- Encode helpers: `strToBytes64(s: string): number[]`, `jurisdictionToBytes(s: string): number[]`

---

### ISSUE #9 — Travel Rule module ✅ COMPLETED
**Labels:** `api` `compliance`
**Estimate:** 1 hour
**Depends on:** #2, #3

**Base path:** `/api/travel-rule`

**Endpoints:**

```
POST  /api/travel-rule              Submit travel rule data pre-deposit
GET   /api/travel-rule/:nonceHash  Get status of a travel rule submission
```

**POST /api/travel-rule — full detail:**
```typescript
class SubmitTravelRuleDto {
  wallet: string;             // payer wallet (base58)
  usdcAmount: string;         // bigint as string (avoids JS precision issues)
  originatorName: string;     // max 64 chars
  originatorAccount: string;  // max 34 chars (IBAN format)
  beneficiaryName: string;    // max 64 chars
}

// Service flow:
// 1. Validate amount >= 1_000_000_000 (1000 USDC)
// 2. Generate nonce: crypto.randomBytes(32)
// 3. nonceHash = SHA-256(nonce) — this is the PDA seed
// 4. complianceHash = SHA-256(JSON.stringify({ originatorName, originatorAccount, beneficiaryName, amount, nonce }))
// 5. Build on-chain params (encode strings to byte arrays)
// 6. Call program.methods.initTravelRule(params)
//         .accounts({ travelRuleData: pda, payer: walletPubkey, systemProgram })
//         .rpc()
// 7. prisma.travelRule.create({ pda, nonceHash, complianceHash, ... })
// 8. Return { nonceHash, nonceBase58, travelRulePda, txSignature }
//    ← frontend passes nonceHash back when calling deposit
```

**Note:** The nonce itself (32 random bytes, base58-encoded) must be returned to the client.
The client needs it to re-derive the travel rule PDA when constructing the deposit tx.

---

### ISSUE #10 — Deposits module (indexing only — tx built client-side) ✅ COMPLETED
**Labels:** `api` `indexing`
**Estimate:** 1 hour
**Depends on:** #2, #3

**Deposits are signed by the user's wallet in the browser** — the backend does NOT
sign deposit transactions. The frontend uses the Anchor client directly.
This module handles: pre-flight checks, post-deposit indexing, and history queries.

**Endpoints:**

```
POST  /api/deposits/preflight    Pre-deposit validation (credential + travel rule check)
POST  /api/deposits/index        Called by frontend after deposit tx confirms
GET   /api/deposits              List all deposits (admin)
GET   /api/deposits/institution/:wallet   Deposits for a specific institution
```

**POST /api/deposits/preflight:**
```typescript
// Input: { wallet, usdcAmount }
// Returns:
{
  canDeposit: boolean,
  reason?: string,             // if canDeposit=false
  requiresTravelRule: boolean, // amount >= 1_000_000_000
  credentialStatus: string,
  currentNav: number,          // nav_price_bps as number
  estimatedCvault: string,     // bigint as string
}
// Logic:
// 1. anchorService.readCredential(wallet) — check status + expiry
// 2. if amount >= TRAVEL_RULE_THRESHOLD → requiresTravelRule = true
// 3. anchorService.readVaultState() → currentNav
// 4. estimatedCvault = amount * 10000 / currentNav
```

**POST /api/deposits/index:**
```typescript
// Called after deposit tx confirms in browser
// Input: { txSignature, wallet, usdcAmount, cvaultAmount, nonce }
// Backend: verify tx on-chain (fetch tx, check it succeeded)
// Then: prisma.deposit.create(...)
// And:  prisma.auditEvent.create({ action: 'deposit', ... })
```

---

### ISSUE #11 — Vault state module ✅ COMPLETED
**Labels:** `api` `dashboard`
**Estimate:** 45 min
**Depends on:** #3, #4, #5

**Base path:** `/api/vault`

**Endpoints:**

```
GET  /api/vault/state          Current vault state (live from chain)
GET  /api/vault/nav/history    NAV history from DB (last N snapshots)
GET  /api/vault/yield/history  Yield events from DB
GET  /api/vault/stats          Aggregated dashboard stats
```

**GET /api/vault/state:**
```typescript
// Returns merged on-chain + off-chain data:
{
  totalDeposits: string,       // bigint as string
  totalSupply: string,
  navPriceBps: string,
  pendingYield: string,
  apyBps: number,
  usxAllocationBps: number,
  paused: boolean,
  lastYieldClaim: string,      // ISO datetime
  eusxPrice: number,           // live from Solstice service (cached 60s)
  sixStatus: { connected: boolean, lastSuccessAt: string | null },
  vaultUsxBalance: string,     // vault's USX ATA balance
  vaultEusxBalance: string,    // vault's eUSX ATA balance
}
```

**GET /api/vault/stats:**
```typescript
{
  totalInstitutions: number,
  activeCredentials: number,
  totalDepositsUsd: string,
  totalYieldDistributed: string,
  currentApy: number,          // apy_bps / 100 as percentage
  navChange24h: number,        // % change over last 24 nav snapshots
}
```

---

### ISSUE #12 — Audit log module ❌ NOT IMPLEMENTED
**Labels:** `api` `compliance`
**Estimate:** 30 min
**Depends on:** #2

**Base path:** `/api/audit`

```
GET  /api/audit              List events (filterable by wallet, action, date range)
GET  /api/audit/export/csv   Export as CSV for compliance reports
```

**Query params for GET /api/audit:**
- `wallet` — filter by institution wallet
- `action` — filter by action type
- `from`, `to` — ISO datetime range
- `page`, `limit` — pagination

**CSV export:** Use `fast-csv` package. Include all AuditEvent fields plus institution name.

---

### ISSUE #13 — WebSocket gateway (live dashboard) ❌ NOT IMPLEMENTED
**Labels:** `api` `realtime`
**Estimate:** 45 min
**Depends on:** #6, #7

**File:** `src/gateway/vault.gateway.ts`

Uses `@nestjs/websockets` with `socket.io`.

**Events the server emits:**
```typescript
// nav_updated — emitted after every successful set_nav
{ navPriceBps: string, source: string, timestamp: string }

// yield_processed — emitted after process_yield crank
{ yieldAccrued: string, pendingYield: string, timestamp: string }

// vault_state_refresh — emitted every 30s unconditionally
{ ...full vault state object from /api/vault/state }
```

Frontend subscribes to these for the live SIX FX ticker and yield accumulation counter.

---

## MILESTONE 4 — Demo Hardening
*Make the demo bulletproof for judges. ~2 hours.*

---

### ISSUE #14 — Seed script for demo day ✅ COMPLETED
**Labels:** `demo` `data`
**Estimate:** 30 min
**Depends on:** all above

**File:** `prisma/seed.ts`

**What it provisions:**
1. Deploy vault on devnet (call `initialize_vault`) if not already deployed
2. Call `register_usx_accounts` with real devnet USX/eUSX mint addresses
3. Issue credentials for 3 demo wallets:
   - `DEMO_WALLET_TIER3` (institutional, CH, tier=3, kyc=3, expires 1 year)
   - `DEMO_WALLET_TIER2` (professional, GB, tier=2, kyc=2, expires 1 year)
   - `DEMO_WALLET_RETAIL` (retail, US, tier=1, kyc=1, expires 1 year)
4. Make one demo deposit from DEMO_WALLET_TIER3 (10,000 USDC if devnet balance allows)
5. Seed 30 days of NAV history (simulated SIX data, realistic curve 10000→10430)
6. Seed 30 days of yield events
7. Insert NAV snapshots with source="SIX" for display

**Run with:** `npm run db:seed`

---

### ISSUE #15 — Health + readiness endpoints ✅ COMPLETED
**Labels:** `ops` `demo`
**Estimate:** 20 min

```
GET  /health          { status, solana_connected, six_connected, db_connected }
GET  /health/cranks   { nav_crank: { lastRun, lastSuccess }, yield_crank: { lastRun, lastSuccess } }
```

For demo: embed these in the dashboard UI so judges can see all systems green.

---

### ISSUE #16 — Environment config and `.env.example` ✅ COMPLETED
**Labels:** `ops` `docs`
**Estimate:** 20 min

```env
# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
VAULT_PROGRAM_ID=GRk6Qv4rAzWf1DiKPv5FLKPvGKkk8rEdNGDoK6VMf8sX
VAULT_AUTHORITY_KEYPAIR=[...]    # JSON array
VAULT_STATE_PDA=...              # computed at deploy

# Solstice (devnet provided by hackathon)
SOLSTICE_USX_MINT=...
SOLSTICE_EUSX_MINT=...
SOLSTICE_PROGRAM_ID=...

# SIX API (you have credentials)
SIX_CLIENT_ID=...
SIX_CLIENT_SECRET=...
SIX_BASE_URL=https://api.six-group.com
SIX_TOKEN_URL=https://api.six-group.com/oauth2/token

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/oragami_vault

# App
ADMIN_API_KEY=...
PORT=3210
DISTRIBUTE_THRESHOLD=1000000    # 1 USDC in raw units
```

---

## MILESTONE 5 — Real USX Yield Loop Validation
*End-to-end test that the money actually moves. ~2 hours.*

---

### ISSUE #17 — Integration test: full yield cycle ❌ NOT IMPLEMENTED
**Labels:** `testing` `yield` `critical`
**Estimate:** 2 hours
**Depends on:** all milestones above

**Test scenario (run against devnet, not mocks):**

```
Step 1: Read vault state → assert total_deposits > 0
Step 2: Read eUSX nav from Solstice → assert > 1.0
Step 3: Read SIX FX rate USDCHF → assert between 0.80 and 0.95
Step 4: Compute expected nav_bps → call set_nav → read back vault state → assert nav updated
Step 5: Wait for process_yield crank → read vault state → assert pending_yield > 0
Step 6: Call distribute_yield manually:
   a. mintUsx(pendingYield) → assert vault has USX
   b. lockUsxForYield() → assert vault has eUSX
   c. distribute_yield on-chain → assert pending_yield = 0
Step 7: Trigger NAV crank → assert nav_bps changed (reflects eUSX appreciation)
Step 8: Query /api/vault/yield/history → assert entry exists for this cycle
Step 9: Query /api/vault/nav/history → assert entry with source="SIX"
```

Write as a standalone `test/integration/yield-cycle.test.ts` using Jest.
This is the script you run LIVE during the demo to show judges real money moving.

---

## Build Order Summary

```
CONTRACT FIX 1 (SIZE) → CONTRACT FIX 2 (real USX fields + events)
  ↓
ISSUE #1 (scaffold) → #2 (schema)
  ↓
ISSUE #3 (anchor client) → #4 (solstice) + #5 (SIX)
  ↓
ISSUE #6 (NAV crank) → #7 (yield crank)   [these can be parallel]
  ↓
ISSUE #8 (credentials) → #9 (travel rule) → #10 (deposits) → #11 (vault state) → #12 (audit)
  ↓
ISSUE #13 (websocket)
  ↓
ISSUE #14 (seed) → #15 (health) → #16 (env)
  ↓
ISSUE #17 (integration test)
```

**Estimated total backend time:** 18–22 hours of focused work.
**Critical path for judging:** #1 → #3 → #4 → #5 → #6 → #7 → #11 → #17.
If time is tight, skip #12 (audit CSV export) and #13 (WebSocket) — these are polish.
Everything else is required for a credible demo.