# Oragami

Institutional RWA infrastructure on Solana. Two Anchor programs, one compliance layer, deployed on devnet.

**StableHacks 2026 · Track 4: RWA-Backed Stablecoin & Commodity Vaults**

---

## The Products

### Product 1 — Yield Vault (`oragami-vault`)

Institutions deposit USDC and receive **cVAULT** — a NAV-priced token that captures two yield sources simultaneously:

**Gold NAV appreciation** — cVAULT is priced against a live basket:
- 50% Gold (XAU/USD) from SIX Exchange via authenticated mTLS
- 30% CHF/USD from SIX Exchange via authenticated mTLS
- 20% Solstice eUSX NAV

**USX carry yield** — 70% of deposited USDC is allocated to Solstice USX. A backend crank accrues yield daily on-chain into `pending_yield`. The vault holds both the USDC liquidity buffer and the USX position.

```
Institution deposits 10,000 USDC
        ↓
NAV = $1.043 (gold up 4.3% since baseline)
cVAULT minted = 10,000 × 10,000 / 10,430 = 9,587.73 cVAULT
        ↓
7,000 USDC → Solstice USX (70% allocation, earning ~5% APY)
3,000 USDC → liquidity buffer (30%, available for redemptions)
        ↓
cVAULT holder earns:
  · Gold price appreciation reflected in NAV every 2 minutes
  · USX carry yield accrued daily on-chain
```

NAV is computed by the backend crank from live SIX Exchange data and written on-chain via `set_nav`. Hard guard: max ±10% change per crank run to prevent manipulation.

---

### Product 2 — Custody Vault (`multi-asset-vault`)

A factory pattern custody vault. Institutions deposit tokenized assets (Gold, Silver, T-bills) directly. The vault PDA holds on-chain custody throughout the position lifecycle.

```
Institution A deposits 1,000 GOLD-mock
        ↓
Vault PDA takes custody of 1,000 GOLD-mock tokens
VAULT-GOLD shares minted to Institution A at current NAV
        ↓
Institution A transfers 500 VAULT-GOLD to Institution B
        ↓
Vault verifies BOTH credentials on-chain before transfer executes:
  · Sender: KYC active, not expired, wallet binding confirmed
  · Receiver: KYC active, not expired, wallet binding confirmed
        ↓
500 VAULT-GOLD moves A → B
Underlying gold stays in vault custody throughout
        ↓
Institution B redeems 500 VAULT-GOLD
Vault burns shares, releases gold at current NAV
If NAV moved $1.00 → $1.05: B receives 525 GOLD-mock
```

The vault is the central counterparty. No bilateral counterparty risk between institutions. The underlying asset never moves until redemption.

---

## Compliance Architecture

Both products share one compliance layer. One onboarding flow gates everything.

### Soulbound Credential PDA

Seeds: `["credential", wallet]` — one per institution, non-transferable.

Stores on-chain:
- Institution name (legal entity, 64 bytes)
- Jurisdiction (ISO 3166, e.g. `CH`)
- KYC level (1 = basic, 2 = enhanced, 3 = full)
- AML coverage score (0–100)
- Tier (1 = retail, 2 = professional, 3 = institutional)
- Attestation hash (SHA-256 of off-chain KYC docs)
- Issued at / expires at timestamps
- Status (pending / active / restricted / revoked)

The deposit instruction derives the credential PDA from `payer.key()` — you cannot pass a fake credential. Anchor enforces this at the account constraint level.

### FATF Travel Rule

Deposits ≥ 1,000 USDC require a `TravelRuleData` PDA to be initialised before the deposit call.

Seeds: `["travel_rule", payer, nonce_hash]`

Stores: originator name, originator account (IBAN), beneficiary name, compliance hash (SHA-256 of full Travel Rule packet), amount, submitted_at, payer, **consumed flag**.

The deposit instruction verifies:
1. `tr.payer == payer` — record belongs to this depositor
2. `tr.amount == params.amount` — record covers this exact deposit
3. `tr.consumed == false` — prevents replay of the same record

On verification, `consumed` is set to `true`. The PDA remains on-chain as an immutable audit record.

### Transfer Hook (cVAULT-TRADE)

`cvault-transfer-hook` (`965gkqvN...`) is a Token-2022 transfer hook on cVAULT-TRADE. Every secondary market transfer triggers an on-chain compliance check. Non-whitelisted wallets are rejected at the protocol layer — no off-chain bypass possible.

### Dual-Credential Transfer (multi-asset-vault)

`transfer_shares` verifies both sender and receiver credentials on-chain before any token moves:

```rust
// Sender credential: seeds = ["credential", sender.key()]
// Receiver credential: seeds = ["credential", receiver_share_account.owner]
// Both must be status == ACTIVE and not expired
// Only then does token::transfer execute
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 16, :3000)              │
│  /app          — yield vault dashboard, NAV sparkline        │
│  /app/vaults   — custody vaults, deposit + transfer          │
│  /onboard      — credential issuance flow                    │
└────────────────────────┬────────────────────────────────────┘
                         │ REST (polling 15s)
┌────────────────────────▼────────────────────────────────────┐
│                   Backend (NestJS, :3210)                    │
│  NAV crank     — SIX mTLS → compute basket → set_nav CPI    │
│  Credentials   — issue / verify / revoke on-chain PDAs       │
│  Deposits      — preflight, travel rule, index               │
│  Multi-vault   — factory state, credential verify            │
│  PostgreSQL    — NavSnapshot, Deposit, AuditEvent, YieldEvent│
└──────┬──────────────────────────────────────┬───────────────┘
       │ Anchor CPI                            │ Anchor CPI
┌──────▼──────────┐                  ┌────────▼────────────────┐
│  oragami-vault  │                  │   multi-asset-vault      │
│  ihUcHpWk...    │                  │   6Mbzwuw8...            │
│                 │                  │                          │
│  VaultState PDA │                  │  Factory PDA             │
│  cVAULT mint    │                  │  AssetVault PDAs         │
│  USDC custody   │                  │  VAULT-GOLD / VAULT-SILVER│
│  Credential PDAs│◄─────────────────│  reads credentials from  │
│  TravelRule PDAs│  cross-program   │  oragami-vault program   │
└─────────────────┘  credential read └──────────────────────────┘
                                              │ Token-2022
                                     ┌────────▼────────────────┐
                                     │  cvault-transfer-hook    │
                                     │  965gkqvN...             │
                                     │  compliance on transfer  │
                                     └──────────────────────────┘
```

---

## Programs

### `oragami-vault` — `ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP`

NAV-priced yield vault. Institutions deposit USDC, receive cVAULT at live NAV.

| Instruction | What it does |
|---|---|
| `initialize_vault` | Creates VaultState PDA, mints cVAULT mint |
| `issue_credential` | Issues soulbound ComplianceCredential PDA for a wallet |
| `revoke_credential` | Sets credential status to revoked |
| `init_travel_rule` | Creates TravelRuleData PDA required for deposits ≥ 1,000 USDC |
| `deposit` | Credential gate + travel rule gate (with consumed flag) → transfer USDC → mint cVAULT at NAV |
| `set_nav` | Updates `nav_price_bps` on VaultState, requires RwaAssetRegistry, operator-only |
| `process_yield` | Accrues daily yield into `pending_yield` based on USX allocation × APY |
| `distribute_yield` | Resets `pending_yield`, emits YieldDistributed event |
| `redeem` | Burns cVAULT, returns USDC at current NAV. No credential check on exit. |
| `convert_to_tradeable` | Burns cVAULT, mints cVAULT-TRADE 1:1 for secondary market |
| `verify_proof_of_reserve` | Checks `total_assets × 10000 ≥ total_deposits × min_collateral_ratio_bps` |
| `initialize_rwa_asset_registry` | On-chain RWA backing metadata (ISIN, custodian, attestation hash) |
| `initialize_vault_mandate` | Risk envelope: liquidity buffer, max USX allocation, collateral ratio |
| `assert_liquidity_allocation` | Enforces USDC band vs `usx_allocation_bps` |

**NAV formula** (computed in `nav-crank.service.ts`, written on-chain via `set_nav`):
```
navFloat = (0.50 × goldFactor) + (0.30 × chfFactor) + (0.20 × eusxNav)
navBps   = round(navFloat × 10_000)

goldFactor = currentGoldPrice / baselineGoldPrice
chfFactor  = currentChfUsd   / baselineChfUsd
```
Baseline is set on first successful SIX fetch. NAV starts at 10,000 bps ($1.00) and drifts with real market prices. Hard guard: max ±10% change per crank run.

**Credential PDA** — seeds `["credential", wallet]`. One per institution. Non-transferable. Required account on `deposit` — Anchor derives it from `payer.key()`, so you cannot pass a fake credential.

**Travel Rule PDA** — seeds `["travel_rule", payer, nonce_hash]`. Required for deposits ≥ 1,000 USDC. Program checks `tr.amount == params.amount`, `tr.payer == payer`, and `tr.consumed == false` inside the handler. Sets `consumed = true` on use — single-use, replay-proof.

---

### `multi-asset-vault` — `6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D`

Factory pattern custody vault. One program, unlimited asset vaults. GOLD and SILVER vaults are live on devnet.

| Instruction | What it does |
|---|---|
| `initialize_factory` | Creates Factory PDA with fee config |
| `register_asset` | Creates AssetVault PDA, share mint PDA, vault token account PDA for a new asset |
| `issue_credential` | Issues ComplianceCredential PDA on this program |
| `revoke_credential` | Revokes credential |
| `deposit` | Credential gate → transfer asset tokens into vault PDA → mint share tokens at NAV |
| `redeem` | Burns share tokens → returns asset tokens at NAV. No credential check on exit. |
| `set_nav` | Updates NAV for a specific asset vault, authority-only |
| `transfer_shares` | Both sender and receiver credentials verified on-chain → share tokens move, underlying asset stays in vault |
| `pause_vault` | Emergency stop for a specific vault. Blocks deposits, redemptions remain open. |

**`transfer_shares` — the key instruction:**
```rust
// Sender credential: seeds = ["credential", sender.key()]
// Receiver credential: seeds = ["credential", receiver_share_account.owner]
// Both must be status == CREDENTIAL_ACTIVE and not expired
// Only then does token::transfer execute
// Underlying asset never moves — vault PDA holds it throughout
```

**Credential reads** — the multi-asset-vault reads credentials issued by `oragami-vault` (`ihUcHpWk...`). One onboarding flow, one credential, both products. The backend derives credential PDAs using the oragami-vault program ID.

---

### `cvault-transfer-hook` — `965gkqvNvYbUsSdqz4AB3YvBw9hqQuNeKMYzHxQBsP1N`

Token-2022 transfer hook on cVAULT-TRADE. Every secondary market transfer triggers an on-chain compliance check. Non-whitelisted wallets are rejected at the protocol layer.

---

## SIX Exchange Integration

Real mTLS-authenticated calls to `api.six-group.com`. The certificate bundle is in `/six-data-cert/`.

```
six-data-cert/
├── signed-certificate.pem   # Signed by SIX CA
├── private-key.pem          # RSA private key
├── certificate.p12          # PKCS#12 bundle
└── password.txt             # P12 passphrase
```

The backend loads the cert via Node's `https.Agent` with `pfx` + `passphrase`. Every crank run fetches:
- Gold intraday snapshot — VALOR `274702`, BC `148`
- CHF/USD intraday snapshot — VALOR `275164`, BC `148`

If SIX is unreachable, the crank falls back to the last cached price and records `source: "SIX-cached"` in the NavSnapshot. The `GET /api/vault/state` response includes `sixStatus.mtlsConfigured: true` when the cert is loaded.

---

## Backend API

Base URL: `http://localhost:3210`

### Vault
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/vault/nav/current` | Latest NavSnapshot — navBps, goldPrice, chfUsd, eusxNav, timestamp |
| `GET` | `/api/vault/nav/history?limit=100` | NAV history for sparkline |
| `GET` | `/api/vault/yield/history` | YieldEvent history |
| `GET` | `/api/vault/stats` | TVL, active credentials, 24h NAV change |
| `GET` | `/api/vault/state` | Full on-chain VaultState + SIX status |

### Credentials
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/credentials` | Issue credential (admin key required) |
| `GET` | `/api/credentials/:wallet/verify` | Verify credential status |
| `PUT` | `/api/credentials/:wallet/revoke` | Revoke credential (admin key required) |
| `GET` | `/api/credentials` | List all institutions (admin key required) |

### Deposits
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/deposits/preflight` | Check credential, travel rule threshold, estimate cVAULT out |
| `POST` | `/api/deposits/index` | Index a confirmed deposit tx |
| `GET` | `/api/deposits/institution/:wallet` | Deposit history for a wallet |

### Travel Rule
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/travel-rule` | Submit Travel Rule data, returns unsigned tx + nonce |
| `GET` | `/api/travel-rule/:nonceHash` | Check Travel Rule PDA status |

### Multi-Asset Vault
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/multi-vault/vaults` | All registered asset vaults |
| `GET` | `/api/multi-vault/vaults/:assetMint` | Single vault state |
| `POST` | `/api/multi-vault/vaults/:assetMint/preflight` | Credential check + share estimate |
| `GET` | `/api/multi-vault/credentials/:wallet` | Verify credential (reads from oragami-vault program) |
| `POST` | `/api/multi-vault/credentials` | Issue multi-vault credential (admin key required) |

### Health
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Solana, SIX, DB connectivity |
| `GET` | `/health/cranks` | Last NAV crank run timestamp + success |

---

## Running Locally

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- Anchor CLI 0.32.1
- Solana CLI 2.1+
- Phantom wallet browser extension

### 1. Database

```bash
cd oragami-backend
docker compose up -d
```

### 2. Backend

```bash
cd oragami-backend
cp .env.example .env
# Fill in: VAULT_AUTHORITY_KEYPAIR, SIX_CLIENT_ID, SIX_CLIENT_SECRET, ADMIN_API_KEY
npm install
npm run db:push
npm run db:generate
npm run start:dev
```

The NAV crank starts automatically and runs every 2 minutes.

**Minimum required env vars:**
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
VAULT_PROGRAM_ID=ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP
MULTI_VAULT_PROGRAM_ID=6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D
VAULT_AUTHORITY_KEYPAIR=[...your keypair array...]
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/oragami_vault
ADMIN_API_KEY=your-secret-key
SIX_CLIENT_ID=your-six-client-id
SIX_CLIENT_SECRET=your-six-client-secret
```

### 3. Frontend

```bash
cd oragami-frontend
# .env.local is already present — update NEXT_PUBLIC_ADMIN_API_KEY to match backend ADMIN_API_KEY
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

### 4. Verify everything is up

```bash
curl http://localhost:3210/health
# {"status":"ok","solana_connected":true,"six_connected":true,"db_connected":true}

curl http://localhost:3210/health/cranks
# {"nav_crank":{"lastRun":"...","lastSuccess":"..."}}

curl http://localhost:3210/api/vault/nav/current
# {"navBps":"10043","goldPrice":3312.5,"chfUsd":1.1182,...}
```

---

## User Flow

```
1. Visit /onboard/connect → connect Phantom wallet
2. Visit /onboard/register → submit institution details
3. Backend calls issue_credential on oragami-vault program
4. Credential PDA created on-chain: ["credential", wallet]
5. /onboard/pending polls until credential is active
6. /onboard/complete → Enter Vault

Yield Vault (/app):
  · Deposit USDC → receive cVAULT at live NAV
  · NAV updates every 2 minutes from SIX Exchange
  · Yield accrues daily, visible in dashboard

Custody Vault (/app/vaults):
  · Deposit GOLD-mock → receive VAULT-GOLD at NAV
  · Transfer VAULT-GOLD to another credentialed institution
  · Both credentials verified on-chain before transfer
  · Redeem VAULT-GOLD → receive GOLD-mock at current NAV
```

---

## Repo Structure

```
Oragami/
├── oragami-vault/
│   └── programs/
│       ├── oragami-vault/src/lib.rs          # Yield vault — 14 instructions
│       └── multi-asset-vault/src/            # Custody vault — factory pattern
│           ├── instructions/
│           │   ├── deposit.rs                # Credential gate + share mint
│           │   ├── transfer_shares.rs        # Dual credential check
│           │   ├── redeem.rs                 # Burn shares, release asset
│           │   ├── credential.rs             # Issue / revoke
│           │   ├── register_asset.rs         # Factory: new asset vault
│           │   ├── set_nav.rs                # NAV update, authority-only
│           │   └── admin.rs                  # Pause vault
│           ├── state.rs                      # Factory, AssetVault, ComplianceCredential
│           ├── error.rs                      # VaultError codes
│           └── constants.rs                  # Seeds, NAV denominator, thresholds
├── programs/
│   └── cvault-transfer-hook/                 # Token-2022 transfer hook
├── oragami-backend/
│   └── src/
│       ├── crank/nav-crank.service.ts        # SIX fetch → NAV compute → set_nav CPI
│       ├── vault/vault.service.ts            # NAV history, stats, state
│       ├── credentials/                      # Issue / verify / revoke
│       ├── deposits/                         # Preflight, travel rule, indexing
│       ├── multi-asset-vault/                # Factory state, credential verify
│       │   └── multi-asset-vault.service.ts  # Credential PDA uses oragami-vault program ID
│       └── data/six.service.ts               # mTLS SIX API client
├── oragami-frontend/
│   ├── app/
│   │   ├── app/page.tsx                      # Yield vault dashboard
│   │   ├── app/vaults/page.tsx               # Custody vaults
│   │   └── onboard/                          # Credential issuance flow
│   ├── features/vault/
│   │   ├── useVaultState.ts                  # On-chain + API state
│   │   ├── VaultPanel.tsx                    # Deposit / redeem / convert
│   │   └── NavSparkline.tsx                  # recharts NAV history
│   └── shared/api/index.ts                   # All typed API calls
├── six-data-cert/                            # mTLS certificate bundle
├── PITCH.md                                  # Hackathon pitch script
└── STRATEGY.md                               # Build strategy + issue tracker
```

---

## Devnet Program IDs

| Program | ID |
|---|---|
| `oragami-vault` | `ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP` |
| `multi-asset-vault` | `6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D` |
| `cvault-transfer-hook` | `965gkqvNvYbUsSdqz4AB3YvBw9hqQuNeKMYzHxQBsP1N` |

[View oragami-vault on Solscan](https://explorer.solana.com/address/ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP?cluster=devnet) · [View multi-asset-vault on Solscan](https://explorer.solana.com/address/6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D?cluster=devnet)

---

## Tech Stack

| Layer | Stack |
|---|---|
| Programs | Rust, Anchor 0.32.1, Token-2022 |
| Backend | NestJS 11, Prisma 7, PostgreSQL 16, `@coral-xyz/anchor` 0.32 |
| Frontend | Next.js 16, React 19, Tailwind 4, `@solana/web3.js`, recharts, framer-motion |
| Data | SIX Exchange intraday API (mTLS), Solstice eUSX NAV endpoint |
| Wallet | Phantom (devnet) |
