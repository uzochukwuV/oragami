# Oragami — Strategic Decision Document
> Written: March 29, 2026 | Deadline: March 29, 2026 22:00

---

## The Core Question

You have two contracts, a full backend, and a landing page. The question is:
**what do you pitch, what do you build in the remaining hours, and in what order?**

The answer is not "pick one contract." The answer is **pitch both as one system** — the
original vault is the yield product, the multi-asset vault is the custody and exchange
infrastructure. They are complementary, not competing.

---

## What You Have Right Now (Honest Inventory)

### Contract 1 — `oragami-vault` (ihUcHpWk...)
**Status: Deployed on devnet. Backend fully wired.**

What it does:
- Institutions deposit USDC → vault holds USDC → mints cVAULT at SIX-priced NAV
- NAV tracks Gold (50%) + CHF/USD (30%) + Solstice eUSX yield (20%)
- Compliance credential PDA gates every deposit
- Travel Rule enforced for deposits ≥ 1000 USDC
- cVAULT-TRADE for secondary market (transfer hook exists in `programs/cvault-transfer-hook`)
- `process_yield` + `distribute_yield` for on-chain yield accrual
- NAV crank running every 2 minutes pulling live SIX data

What it is: **A synthetic RWA yield vault.** USDC is the collateral, SIX prices
determine the NAV. This is how Ondo works — they hold T-bills, the token tracks
T-bill yield. You hold USDC, the token tracks Gold + CHF.

Track 4 fit: **Strong.** Synthetic RWA backing is legitimate. The judges understand it.

---

### Contract 2 — `multi-asset-vault` (6Mbzwuw8...)
**Status: Deployed on devnet. Factory initialized. GOLD + SILVER vaults live.**

What it does:
- Factory pattern — one program, unlimited asset vaults
- Institutions deposit actual tokenized assets (GOLD-mock, SILVER-mock)
- Vault takes custody of the asset tokens in a PDA token account
- Mints VAULT-GOLD / VAULT-SILVER shares at SIX NAV
- `transfer_shares` — compliance-gated position transfer between institutions
  (both sender AND receiver credentials verified before transfer executes)
- Vault is the central counterparty — underlying asset never moves between institutions

What it is: **True RWA custody + permissioned institutional exchange.**
The vault holds the asset. Institutions hold receipts. Positions transfer through
the vault as escrow. Zero counterparty risk between institutions.

Track 4 fit: **Stronger.** This is what AMINA Bank, Clearstream, and SIX themselves
actually build. The judges from those institutions will recognize the pattern immediately.

---

### Backend — `oragami-backend` (NestJS, port 3210)
**Status: Fully built for Contract 1. Partial for Contract 2.**

Built and working:
- Credentials module (issue, revoke, verify) — `/api/credentials`
- Travel Rule module — `/api/travel-rule`
- Deposits module (preflight, index, history with P&L) — `/api/deposits`
- Vault state module (state, NAV history, yield history, stats) — `/api/vault`
- NAV crank (SIX live data, every 2 min, yield tick stub) — running
- Health endpoints — `/health`, `/health/cranks`
- Multi-asset vault service (read factory, read vaults, set_nav, verify credential,
  preflight deposit) — `/api/multi-vault` — **built but not tested**

Not built:
- Audit log API (`/api/audit`) — ISSUE #12
- WebSocket gateway — ISSUE #13
- Full yield crank (Solstice CPI) — ISSUE #7
- Transfer indexing for multi-asset vault (no DB table for share transfers)

---

### Frontend — `oragami-frontend` (Next.js, port 3000)
**Status: Landing page complete. App dashboard exists but not wired to backend.**

Built:
- Landing page — full, updated with multi-asset vault story
- App dashboard shell (`/app/page.tsx`) — vault stats, deposit/redeem/convert tabs
- `useVaultState` hook — reads on-chain state directly (bypasses backend)
- `VaultPanel` — deposit/redeem/convert UI (calls on-chain directly)
- `WalletButton` — Phantom wallet connection

Not built (from FRONTEND_FLOW.md):
- Onboarding flow (`/onboard/*`) — no credential gate before dashboard
- Deposit wizard with preflight + travel rule + indexing
- Portfolio page with P&L
- NAV history chart wired to backend
- Multi-asset vault UI (any of it)
- Admin panel

---

## The Pitch Strategy

### Do NOT pitch them as separate products.

Pitch them as **two layers of the same institutional infrastructure:**

```
Layer 1 — Yield Vault (Contract 1)
  "Institutions deposit USDC. The vault allocates to Solstice USX for yield.
   NAV is priced against Gold + CHF via SIX Exchange. cVAULT is the receipt.
   This is the yield product — institutions earn while holding."

Layer 2 — Asset Custody & Exchange (Contract 2)
  "Institutions deposit actual tokenized assets — Gold, Silver, T-bills.
   The vault holds custody. VAULT-GOLD is the receipt. Institutions transfer
   positions between each other through the vault as central counterparty.
   Both sides are KYC-verified before any transfer executes.
   This is the custody and exchange product — institutions trade without
   taking counterparty risk on each other."

The bridge:
  "Both layers share the same compliance infrastructure — one credential
   PDA gates access to both. One backend indexes both. One frontend shows both.
   In production, a single institution credential issued by AMINA Bank would
   give access to the yield vault AND the asset exchange."
```

This is a stronger story than either contract alone. It shows you understand
that institutional infrastructure has two distinct needs: yield and liquidity.

---

## What to Build in the Remaining Time

### Priority 1 — Wire the frontend to the backend (2 hours)
**This is the most important thing. A demo that shows live data beats a demo that shows static UI.**

The current dashboard reads on-chain state directly and calls broken SIX endpoints.
Replace with backend calls:

1. `useVaultState` hook — replace direct chain read with:
   - `GET /api/vault/nav/current` for the price ticker (fast, DB-only)
   - `GET /api/vault/state` on mount (full state)
   - `GET /api/vault/stats` for TVL and institution count

2. Deposit flow — add preflight call before showing the deposit button:
   - `POST /api/deposits/preflight` → show `estimatedCvault`, `requiresTravelRule`
   - After tx confirms → `POST /api/deposits/index`

3. NAV chart — add a sparkline below VaultStatsBar:
   - `GET /api/vault/nav/history?limit=48`
   - Use the `chart` component already in shadcn/ui

**Files to change:**
- `features/vault/useVaultState.ts` — replace SIX fetch with `/api/vault/nav/current`
- `features/vault/VaultPanel.tsx` — add preflight before deposit
- `app/app/page.tsx` — add NAV chart

---

### Priority 2 — Multi-asset vault dashboard (1.5 hours)
**This is what makes the demo memorable. Judges see two live vaults with real prices.**

Create `app/app/vaults/page.tsx`:

```
GET /api/multi-vault/vaults
→ Show GOLD vault card: ticker, NAV, total deposits, total supply
→ Show SILVER vault card: same
→ Each card has "Deposit" and "Transfer" buttons

Deposit flow:
  POST /api/multi-vault/vaults/:mint/preflight
  → on-chain deposit tx (user signs in Phantom)

Transfer flow:
  Enter receiver wallet address
  POST /api/multi-vault/credentials/:wallet (verify receiver)
  → on-chain transfer_shares tx (user signs)
```

This is the demo moment: judge watches Institution A deposit GOLD-mock,
then transfer VAULT-GOLD to Institution B, with both credential checks
shown in the UI. The underlying gold never moves.

---

### Priority 3 — Onboarding gate (45 min)
**Without this, judges hit the dashboard without credentials and see errors.**

The middleware.ts already exists in the frontend. Wire it:

1. `app/onboard/connect/page.tsx` — connect wallet, check credential
2. `app/onboard/register/page.tsx` — issue credential (calls backend with admin key)
3. `app/onboard/pending/page.tsx` — poll until active

This is 3 simple pages. The backend endpoints already exist.

---

### Priority 4 — Audit log API (30 min)
**Judges from AMINA Bank and SIX will ask "where's the audit trail?"**

Add `GET /api/audit` to the backend — it's one Prisma query with filters.
The `AuditEvent` table is already populated by every operation.

---

### What to Skip

- **Full yield crank (ISSUE #7)** — the minimal stub in the NAV crank already
  calls `process_yield` and records `YieldEvent`. The dashboard shows yield data.
  The full Solstice CPI is a production concern.

- **WebSocket gateway (ISSUE #13)** — polling every 30s is fine for a demo.
  WebSockets add complexity without visible benefit in a 5-minute demo.

- **Portfolio page** — nice to have, not critical. The dashboard shows TVL and NAV.

- **Admin panel** — judges don't need to see this. The credential issuance
  happens through the onboarding flow.

---

## The Demo Script (5 minutes)

```
0:00 — Open landing page
  "Oragami is institutional RWA infrastructure on Solana. Two products, one
   compliance layer."

0:30 — Show the NAV ticker moving
  "The NAV crank runs every 2 minutes. It fetches live Gold and CHF/USD prices
   from SIX Exchange — real mTLS-authenticated API calls — and updates the
   on-chain NAV. Watch it tick."

1:00 — Connect wallet, go through onboarding
  "Every institution needs a soulbound credential. KYC level, AML score,
   jurisdiction — stored on-chain. No credential, no entry."

1:30 — Deposit USDC into cVAULT
  "100 USDC at NAV $1.043 → 95.78 cVAULT. The backend calls preflight,
   checks the credential, estimates the shares. User signs once."

2:00 — Show NAV chart
  "30 days of NAV history. Gold moved, NAV moved. This is what RWA-backed means."

2:30 — Switch to multi-asset vault
  "Now the custody product. Institution A deposits 1000 GOLD-mock tokens.
   The vault takes custody. VAULT-GOLD shares minted at current NAV."

3:00 — Transfer shares to Institution B
  "Institution A transfers 500 VAULT-GOLD to Institution B. Watch what happens:
   the contract checks BOTH credentials before executing. Institution B's KYC
   is verified on-chain. The gold never moves — it stays in the vault.
   Zero counterparty risk."

3:30 — Show the on-chain events on Solscan
  "DepositMade. TransferMade. Both events on-chain. Full audit trail.
   FATF Travel Rule tracked for large positions."

4:00 — Show the compliance dashboard
  "Every operation indexed. Credential status, deposit history, transfer history.
   Exportable for regulatory reporting."

4:30 — Close
  "One credential. Two products. Yield vault for returns, custody vault for
   institutional asset exchange. Built on Solana, priced by SIX Exchange,
   compliant by design."
```

---

## Remaining Implementation Issues

### ISSUE #FE-W1 — Wire useVaultState to backend
**Estimate:** 45 min | **Priority:** CRITICAL

Replace the broken SIX direct fetch in `useVaultState.ts`:
- Remove `fetch('/six/metal/GOLD')` and `fetch('/six/forex/CHF/USD')` — these routes don't exist
- Replace with `GET /api/vault/nav/current` → `{ navBps, goldPrice, chfUsd, eusxNav, timestamp }`
- Replace vault state fetch with `GET /api/vault/state`
- Add `GET /api/vault/stats` for TVL and institution count
- Poll `nav/current` every 30s for the live ticker

---

### ISSUE #FE-W2 — Add NAV sparkline chart to dashboard
**Estimate:** 30 min | **Priority:** HIGH

Below `VaultStatsBar`, add a small line chart:
- `GET /api/vault/nav/history?limit=48`
- Use `recharts` via the existing shadcn `chart` component
- X-axis: timestamp, Y-axis: `navBps / 100` as USD price
- Tooltip shows `goldPrice` and `chfUsd` from `rawPayload`
- Label: "NAV · 48h · via SIX Exchange"

---

### ISSUE #FE-W3 — Wire deposit preflight and indexing
**Estimate:** 45 min | **Priority:** HIGH

In `VaultPanel.tsx` `DepositTab`:
1. On amount change: call `POST /api/deposits/preflight` → show `estimatedCvault`, warn if `requiresTravelRule`
2. After on-chain tx confirms: call `POST /api/deposits/index`
3. If `requiresTravelRule`: show travel rule form before deposit button

---

### ISSUE #FE-W4 — Onboarding flow (3 pages)
**Estimate:** 1 hour | **Priority:** HIGH

`/onboard/connect` → `/onboard/register` → `/onboard/pending` → `/app`

- Connect: `WalletMultiButton` + check `GET /api/credentials/:wallet/verify`
- Register: form → `POST /api/credentials` with `NEXT_PUBLIC_ADMIN_API_KEY`
- Pending: poll verify every 3s until `status === 'active'`

The middleware.ts already redirects uncredentialed wallets to `/onboard/connect`.

---

### ISSUE #FE-W5 — Multi-asset vault page
**Estimate:** 1.5 hours | **Priority:** HIGH

`app/app/vaults/page.tsx`:

```
GET /api/multi-vault/vaults
→ VaultCard per asset (GOLD, SILVER)
  - ticker, NAV display, total deposits, total supply, paused status
  - "Deposit" button → deposit modal
  - "Transfer" button → transfer modal

Deposit modal:
  - Amount input
  - POST /api/multi-vault/vaults/:mint/preflight → show estimated shares
  - On-chain deposit tx (user signs)

Transfer modal:
  - Receiver wallet input
  - GET /api/multi-vault/credentials/:wallet → show receiver credential status
  - Amount input
  - On-chain transfer_shares tx (user signs)
  - Show TransferMade event on Solscan
```

---

### ISSUE #BE-W1 — Audit log API
**Estimate:** 30 min | **Priority:** MEDIUM

`src/audit/audit.controller.ts` + `audit.service.ts` + `audit.module.ts`

```
GET /api/audit?wallet=&action=&from=&to=&page=&limit=
```

One Prisma query with optional filters. The `AuditEvent` table is already populated.
Register in AppModule. No new DB migrations needed.

---

### ISSUE #BE-W2 — Multi-asset transfer indexing
**Estimate:** 30 min | **Priority:** MEDIUM

Add `AssetTransfer` table to Prisma schema:

```prisma
model AssetTransfer {
  id              String   @id @default(cuid())
  txSignature     String   @unique
  assetMint       String
  senderWallet    String
  receiverWallet  String
  shareAmount     BigInt
  navAtTransfer   BigInt
  timestamp       DateTime
  createdAt       DateTime @default(now())
}
```

Add `POST /api/multi-vault/transfers/index` endpoint — called by frontend after
`transfer_shares` tx confirms. Mirrors the pattern of `POST /api/deposits/index`.

---

### ISSUE #BE-W3 — Multi-asset NAV crank
**Estimate:** 30 min | **Priority:** MEDIUM

Extend the existing NAV crank to also update multi-asset vault NAVs.

In `nav-crank.service.ts`, after the main `set_nav` call, add:

```typescript
// Also update multi-asset vault NAVs with the same SIX prices
await this.updateMultiAssetNavs(goldPrice, chfUsd);
```

`updateMultiAssetNavs`:
- GOLD vault: `set_nav` with `goldPrice / baselineGoldPrice * 10000`
- SILVER vault: use a silver price feed (SIX VALOR for silver) or a fixed ratio for demo

This means the VAULT-GOLD NAV moves in real time with gold prices — the demo
shows the judge watching VAULT-GOLD NAV tick up as gold appreciates.

---

## Build Order for Remaining Time

```
Hour 1:
  ISSUE #FE-W1  Wire useVaultState to backend (45 min)
  ISSUE #FE-W2  NAV sparkline chart (30 min)

Hour 2:
  ISSUE #FE-W3  Deposit preflight + indexing (45 min)
  ISSUE #FE-W4  Onboarding flow (1 hour)

Hour 3:
  ISSUE #FE-W5  Multi-asset vault page (1.5 hours)

Hour 4:
  ISSUE #BE-W1  Audit log API (30 min)
  ISSUE #BE-W3  Multi-asset NAV crank (30 min)
  ISSUE #BE-W2  Transfer indexing (30 min)

Final 30 min:
  End-to-end demo run
  Fix any broken flows
  Verify Solscan links work
```

---

## The One Thing That Makes or Breaks the Demo

**The NAV must be moving when the judge is watching.**

Everything else is secondary. If the judge opens the dashboard and sees a static
`$1.0000` NAV that never changes, the whole story falls apart. If they see
`$1.0432` ticking up in real time because gold moved, the story is real.

The NAV crank is running. The SIX data is live. The `set_nav` instruction works.
The only thing needed is the frontend reading from `/api/vault/nav/current` instead
of the broken SIX direct fetch.

That is ISSUE #FE-W1. Do it first.

---

## Answer to the Original Question

**Should you pitch the asset vault or the first contract?**
Both. They are one system. The first contract is the yield layer. The second is
the custody and exchange layer. Pitch them together.

**Should you improve the contract to have escrow function?**
It already has it. `transfer_shares` validates both credentials and the vault
holds the underlying asset throughout. That IS the escrow function. No contract
changes needed.

**Should you implement the backend and frontend?**
Yes — in the order above. The backend for Contract 2 is mostly done
(`/api/multi-vault/*` exists). The frontend is the gap. Start with wiring
the existing dashboard to the backend (FE-W1), then build the multi-asset
vault page (FE-W5). Those two things are what the demo needs.
