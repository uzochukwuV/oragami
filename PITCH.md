# Oragami — Hackathon Pitch
> StableHacks 2026 · Track 4: RWA-Backed Stablecoin & Commodity Vaults

---

## The One-Line Problem

Institutions can't hold tokenized RWAs on-chain because there's no compliant way to price them, earn yield on them, or transfer positions between counterparties without bilateral settlement risk.

---

## What Oragami Is

Two Anchor programs. One compliance layer. Deployed on Solana devnet right now.

```
Program 1 — oragami-vault       (ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP)
  Institutions deposit USDC.
  Vault mints cVAULT at live NAV.
  NAV is a weighted basket: Gold 50% · CHF/USD 30% · Solstice eUSX 20%.
  Priced by SIX Exchange via mTLS-authenticated API, cranked on-chain every 2 minutes.
  Yield accrues daily via process_yield → pending_yield on VaultState.

Program 2 — multi-asset-vault   (6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D)
  Factory pattern. One program, unlimited asset vaults.
  GOLD and SILVER vaults are live.
  Institutions deposit tokenized assets. Vault holds custody in a PDA token account.
  VAULT-GOLD / VAULT-SILVER are the receipt tokens.
  transfer_shares moves positions between institutions.
  Both sender AND receiver credentials are verified on-chain before any transfer executes.
  The underlying asset never moves. The vault is the central counterparty.

Program 3 — cvault-transfer-hook (965gkqvNvYbUsSdqz4AB3YvBw9hqQuNeKMYzHxQBsP1N)
  Token-2022 transfer hook on cVAULT-TRADE.
  Every secondary market transfer triggers an on-chain compliance check.
  Non-whitelisted wallets are rejected at the protocol layer, not the API layer.
```

These are not separate products. They share one soulbound credential PDA, one NestJS backend, one Next.js frontend.

---

## Page 1 — Landing (`/`)

**What to say:**

> "Notice there's no 'connect wallet' button here. That's intentional. You don't get access without a credential. This is not a retail product."

**What to point at:**

- SIX Exchange and Solstice in the integrations section — these are real integrations, not logos
- The infrastructure section describes the actual on-chain architecture

---

## Page 2 — Vault Dashboard (`/app`)

**What to say:**

> "The NAV you see is live. It's not a mock number. Every 2 minutes, the backend calls SIX Exchange's intraday snapshot API over mTLS — the certificate is in the repo at `/six-data-cert/`. It fetches Gold (VALOR 274702) and CHF/USD (VALOR 275164), computes a weighted basket NAV in basis points, calls `set_nav` on-chain, and records the snapshot in PostgreSQL. The sparkline is that history."

**The NAV formula — say this out loud:**

```
navFloat = (0.50 × goldFactor) + (0.30 × chfFactor) + (0.20 × eusxNav)
navBps   = round(navFloat × 10_000)
```

Where `goldFactor = currentGold / baselineGold` at vault initialization. NAV starts at 10,000 bps ($1.00) and drifts with real market prices.

**On the deposit flow:**

> "Type any amount. Before the button activates, the frontend calls `POST /api/deposits/preflight`. The backend checks three things: does this wallet have an active on-chain credential PDA, is it expired, and does this amount cross the FATF Travel Rule threshold of 1,000 USDC. The deposit button only enables if all three pass."

> "But here's the important part — the backend preflight is UX, not security. The `deposit` instruction requires `investor_credential` as an account with seeds `['credential', payer.key()]`. If that PDA doesn't exist or has `status != ACTIVE`, the transaction fails on-chain. You cannot bypass the backend by calling the program directly."

**On Travel Rule:**

> "Deposits ≥ 1,000 USDC require a `TravelRuleData` PDA to be initialized first — seeds `['travel_rule', payer, nonce_hash]`. The deposit instruction checks `tr.amount == params.amount` and `tr.payer == payer`. FATF compliance enforced at the protocol layer, not the API layer."

**On the basket panel:**

> "Gold price and CHF/USD are live SIX prices. The vault mandate is a separate on-chain PDA — `min_liquidity_buffer_bps`, `max_usx_allocation_bps`, `min_collateral_ratio_bps`. `verify_proof_of_reserve` is a callable instruction that checks `total_assets × 10000 >= total_deposits × min_collateral_ratio_bps`. Anyone can call it — auditors, regulators, other programs."

---

## Page 3 — Asset Vaults (`/app/vaults`)

**What to say:**

> "This is the custody vault. Different product, same compliance layer. The factory pattern means one deployed program creates unlimited asset vaults — GOLD and SILVER are live, you could add T-bills or any tokenized asset without redeploying."

**Open the Transfer modal. This is the demo moment.**

> "I paste in a receiver wallet. The UI immediately calls `GET /api/multi-vault/credentials/{wallet}` and shows you the receiver's credential status — tier, jurisdiction, active/revoked. Now watch what happens on-chain when I submit."

**After the tx confirms, point to Solscan:**

> "The `transfer_shares` instruction required four accounts: `senderCredential`, `receiverCredential`, `senderShareAccount`, `receiverShareAccount`. The program verified both PDAs — seeds `['credential', wallet]` — before moving a single token. The GOLD-mock never left the vault PDA. What moved is VAULT-GOLD. Zero counterparty risk. The vault is the CCP."

**On the escrow model:**

```
Institution A deposits GOLD-mock
  → vault PDA holds GOLD-mock
  → Institution A receives VAULT-GOLD

Institution A calls transfer_shares(amount) to Institution B
  → program checks: A's credential active? B's credential active?
  → VAULT-GOLD moves from A's ATA to B's ATA
  → GOLD-mock stays in vault PDA

Institution B calls redeem(share_amount)
  → VAULT-GOLD burned
  → GOLD-mock returned at current NAV
```

> "There is no bilateral settlement. There is no counterparty exposure. The vault is always the counterparty."

---

## Page 4 — Onboarding (`/onboard`)

**What to say:**

> "Credential issuance. The institution fills in name, jurisdiction, tier, KYC level, AML score. The backend calls `issue_credential` on the Anchor program. The PDA is soulbound — seeds `['credential', wallet]`, one per institution, non-transferable. This same PDA gates both the yield vault and the custody vault. One credential, two products."

**On the audit trail:**

> "Every credential issuance, every NAV update, every deposit — written to the `AuditEvent` table. Actor, role, action, result, tx signature, timestamp. The NAV crank writes to it automatically on every run. The data is there."

---

## The Three Questions Judges Will Ask

**"Is the SIX data real?"**

Yes. Open `/six-data-cert/` in the repo. There's a signed certificate, private key, and `.p12` bundle. The backend loads it via `https.Agent` with `pfx` and `passphrase`. The `SixService` makes real mTLS calls to `api.six-group.com`. The `sixStatus.mtlsConfigured: true` field in `GET /api/vault/state` confirms the cert is loaded. If SIX is unreachable, the crank falls back to the last cached price and logs `SIX-cached` as the source in the snapshot.

**"Can someone bypass the credential check by calling the program directly?"**

No. The `deposit` instruction context has:
```rust
#[account(
    seeds = [COMPLIANCE_CREDENTIAL_SEED, payer.key().as_ref()],
    bump = investor_credential.bump
)]
pub investor_credential: Account<'info, ComplianceCredential>,
```
Anchor derives the PDA from `payer.key()`. If the account doesn't exist or the bump doesn't match, the transaction fails before your instruction handler runs. The status check (`cred.status == CREDENTIAL_STATUS_ACTIVE`) and expiry check (`cred.expires_at > now`) happen inside the handler. There is no way to pass a fake credential — the PDA seeds are deterministic.

**"What's the yield actually doing?"**

`process_yield` accrues into `pending_yield` on `VaultState` daily:
```
daily_yield = total_deposits × (usx_allocation_bps / 10_000) × (apy_bps / 10_000) / 365
accrued     = daily_yield × days_elapsed
```
The eUSX NAV is fetched from Solstice's devnet endpoint on every crank run. The full Solstice CPI — USDC → USX → lock → distribute — is the production path. What's live is the accrual accounting and the eUSX price feed. Be direct about this: the math is real, the distribution mechanism is post-hackathon.

---

## What's Deployed Right Now

| Program | ID | Status |
|---|---|---|
| `oragami-vault` | `ihUcHpWk...` | Deployed, functional, 14 instructions |
| `multi-asset-vault` | `6Mbzwuw8...` | Deployed, GOLD + SILVER vaults live |
| `cvault-transfer-hook` | `965gkqvN...` | Deployed, transfer hook active |

| Backend endpoint | Status |
|---|---|
| `GET /api/vault/nav/current` | Live, returns SIX-priced NAV |
| `GET /api/vault/nav/history` | Live, PostgreSQL snapshots |
| `POST /api/deposits/preflight` | Live, credential + travel rule check |
| `POST /api/deposits/index` | Live, indexes confirmed deposits |
| `GET /api/multi-vault/vaults` | Live, GOLD + SILVER vault state |
| `POST /api/multi-vault/credentials` | Live, issues multi-vault credentials |
| `POST /api/multi-vault/vaults/:mint/preflight` | Live |
| `GET /health/cranks` | Live, shows last NAV crank run |

| Frontend route | Status |
|---|---|
| `/` | Complete |
| `/app` | Complete — NAV live, sparkline live, deposit/redeem/convert wired |
| `/app/vaults` | Complete — deposit + transfer modals, credential issuance, Solscan links |
| `/onboard/register` | Complete — wired to `issueCredential` backend |

---

## What to Skip Mentioning

- `oragami-asset` — scaffold only, not integrated, not relevant
- WebSocket gateway — polling at 30s is fine for a 5-minute demo
- Full Solstice CPI distribution — be honest, it's post-hackathon
- Portfolio page — not built, not needed for the demo

---

## Closing Line

> "One credential. Two products. Zero counterparty risk. The yield vault earns while you hold. The custody vault lets institutions trade positions without moving the underlying asset. Both verified on-chain. Both priced by SIX Exchange. Three programs deployed on Solana devnet. That's Oragami."
