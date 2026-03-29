# Oragami

Institutional RWA infrastructure on Solana. Two Anchor programs, one compliance layer, deployed on devnet.

**StableHacks 2026 · Track 4: RWA-Backed Stablecoin & Commodity Vaults**

---

## What It Is

Oragami solves two problems institutions have with on-chain RWAs:

1. **Yield on collateral** — deposit USDC, receive cVAULT priced against a live Gold/CHF/eUSX basket via SIX Exchange, earn delta-neutral yield via Solstice USX
2. **Compliant position transfers** — deposit tokenized assets into a custody vault, transfer positions between institutions with both sides verified on-chain before any token moves

Both products share one soulbound compliance credential PDA. One onboarding flow gates access to everything.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js 16, :3000)         │
│  /app          — yield vault dashboard, NAV sparkline        │
│  /app/vaults   — asset custody vaults, deposit + transfer    │
│  /onboard      — credential issuance flow                    │
└────────────────────────┬────────────────────────────────────┘
                         │ REST (polling 15s)
┌────────────────────────▼────────────────────────────────────┐
│                     Backend (NestJS, :3210)                  │
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
│  Credential PDAs│                  │  Credential PDAs         │
│  TravelRule PDAs│                  │  transfer_shares         │
└─────────────────┘                  └──────────────────────────┘
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
| `deposit` | Credential gate + travel rule gate → transfer USDC → mint cVAULT at NAV |
| `init_travel_rule` | Creates TravelRuleData PDA required for deposits ≥ 1,000 USDC |
| `set_nav` | Updates `nav_price_bps` on VaultState, requires RwaAssetRegistry |
| `process_yield` | Accrues daily yield into `pending_yield` |
| `distribute_yield` | Resets `pending_yield`, emits YieldDistributed event |
| `redeem` | Burns cVAULT, returns USDC at current NAV |
| `convert_to_tradeable` | Burns cVAULT, mints cVAULT-TRADE 1:1 |
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
Baseline is set on first successful SIX fetch. NAV starts at 10,000 bps ($1.00) and drifts with real market prices. Hard guard: max ±1,000 bps change per crank run.

**Credential PDA** — seeds `["credential", wallet]`. One per institution. Non-transferable. Required account on `deposit` — Anchor derives it from `payer.key()`, so you cannot pass a fake credential.

**Travel Rule PDA** — seeds `["travel_rule", payer, nonce_hash]`. Required for deposits ≥ 1,000 USDC. Program checks `tr.amount == params.amount` and `tr.payer == payer` inside the handler.

---

### `multi-asset-vault` — `6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D`

Factory pattern custody vault. One program, unlimited asset vaults. GOLD and SILVER vaults are live on devnet.

| Instruction | What it does |
|---|---|
| `initialize_factory` | Creates Factory PDA with fee config |
| `register_asset` | Creates AssetVault PDA for a new asset mint |
| `issue_credential` | Issues ComplianceCredential PDA on this program |
| `revoke_credential` | Revokes credential |
| `deposit` | Credential gate → transfer asset tokens into vault PDA → mint share tokens at NAV |
| `redeem` | Burns share tokens → returns asset tokens at NAV |
| `set_nav` | Updates NAV for a specific asset vault |
| `transfer_shares` | **Both** sender and receiver credentials verified on-chain → share tokens move, underlying asset stays in vault |

**`transfer_shares` — the key instruction:**
```rust
// Sender credential: seeds = ["credential", sender.key()]
// Receiver credential: seeds = ["credential", receiver_share_account.owner]
// Both must be status == CREDENTIAL_ACTIVE and not expired
// Only then does token::transfer execute
// Underlying asset never moves — vault PDA holds it throughout
```

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
| `GET` | `/api/multi-vault/credentials/:wallet` | Verify multi-vault credential |
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

## Repo Structure

```
Oragami/
├── oragami-vault/
│   └── programs/
│       ├── oragami-vault/src/lib.rs        # Yield vault — 14 instructions
│       └── multi-asset-vault/src/          # Custody vault — factory pattern
│           └── instructions/
│               └── transfer_shares.rs      # Dual credential check
├── programs/
│   └── cvault-transfer-hook/               # Token-2022 transfer hook
├── oragami-backend/
│   └── src/
│       ├── crank/nav-crank.service.ts      # SIX fetch → NAV compute → set_nav CPI
│       ├── vault/vault.service.ts          # NAV history, stats, state
│       ├── credentials/                    # Issue / verify / revoke
│       ├── deposits/                       # Preflight, travel rule, indexing
│       ├── multi-asset-vault/              # Factory state, credential verify
│       └── data/six.service.ts             # mTLS SIX API client
├── oragami-frontend/
│   ├── app/
│   │   ├── app/page.tsx                    # Vault dashboard
│   │   ├── app/vaults/page.tsx             # Asset custody vaults
│   │   └── onboard/register/page.tsx       # Credential issuance
│   ├── features/vault/
│   │   ├── useVaultState.ts                # On-chain + API state
│   │   ├── VaultPanel.tsx                  # Deposit / redeem / convert
│   │   └── NavSparkline.tsx                # recharts NAV history
│   └── shared/api/index.ts                 # All typed API calls
├── six-data-cert/                          # mTLS certificate bundle
├── PITCH.md                                # Hackathon pitch script
└── STRATEGY.md                             # Build strategy + issue tracker
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
