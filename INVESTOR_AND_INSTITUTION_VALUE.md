# Oragami: Investor & Institution Value, SIX / USX Usage, and Economics

This document explains **what each major feature is for**, how **SIX** and **Solstice USX** fit the real workflow, and **what participants can expect to gain** (economically and operationally). It is written for allocators, risk, compliance, and product reviewers—not as financial advice.

---

## 1. Features and why they matter

### NAV-priced deposits and redemptions (`nav_price_bps`, deposit / redeem)

- **What it does:** Depositors bring stablecoin; the program mints **cVAULT** at the current NAV. Redemption burns cVAULT and returns stablecoin at NAV.
- **Why investors care:** Exposure is **marked to a defined price** (basis points per 1 USDC), not an opaque pool share. That supports **fairness**, **valuation discussions with auditors**, and **reporting** (“what is one unit worth today?”).
- **Why institutions care:** Fits **fund accounting** mental models (NAV per share) and makes **internal risk** and **liquidity** conversations clearer than a pure AMM or opaque vault receipt.

### RWA asset registry (`RwaAssetRegistry`)

- **What it does:** On-chain record tying the vault to a **declared** backing story: asset identifiers, ISIN-style codes, custodian, optional attestation hash, and timestamps when NAV is updated alongside it.
- **Why investors care:** Reduces “random admin price” anxiety—you can see **what class of risk** NAV is *intended* to represent and that updates are **anchored to that declaration**.
- **Why institutions care:** Supports **due diligence packs**, **board / IC memos**, and **regulatory narrative** (“we only update NAV in line with this registered sleeve”).

### Vault mandate (`VaultMandate`)

- **What it does:** Policy envelope: minimum liquidity buffer, max strategy allocation, minimum collateral ratio checks (used with proof-of-reserve style instructions), allowed asset types, leverage flag, and optional liquidity enforcement flags.
- **Why investors care:** **Bounded manager discretion**—not “anything goes” with pooled funds.
- **Why institutions care:** Aligns with **investment policy statements (IPS)**, **risk limits**, and **third-party oversight** (risk can verify on-chain or via crank/audit jobs).

### Proof of reserve (`verify_proof_of_reserve`)

- **What it does:** Compares **token balances** the vault points at (USDC + USX + eUSX, with documented 1:1 unit assumptions where used) against **liabilities** (`total_deposits`) and a **mandated** minimum collateral ratio.
- **Why investors care:** A **repeatable sanity check** that assets vs. claims is not wildly off—closer to “show me the money” than narrative alone.
- **Why institutions care:** Supports **control testing**, **SOC-style evidence**, and **counterparty comfort** without trusting a single spreadsheet.

### Liquidity allocation assertion (`assert_liquidity_allocation`)

- **What it does:** Checks that idle USDC in the vault sits within the band implied by **`usx_allocation_bps`** and **minimum liquidity**—typically run by a **crank or auditor**, not inside every deposit (stack limits).
- **Why investors care:** Evidence that **strategy mix** (liquid vs. deployed) is not silently drifting.
- **Why institutions care:** Matches **treasury policy** and **liquidity risk** monitoring.

### Compliance credentials & Travel Rule (`ComplianceCredential`, `TravelRuleData`, thresholds)

- **What it does:** Deposits require an **active** credential for the wallet; large deposits require **Travel Rule** metadata that matches the transaction.
- **Why investors care:** Pool is **not anonymously callable** for size in the same way as a public DeFi tap—reduces **illicit flow** reputation risk.
- **Why institutions care:** Moves the product toward **AML / Travel Rule** expectations for **real money** and **correspondent-bank-grade** workflows.

### Secondary market path (cVAULT ↔ tradeable tranche)

- **What it does:** Optional conversion between **restricted-style** and **tradeable** representations where enabled.
- **Why investors care:** **Liquidity optionality** without forcing everyone into the same transfer rules.
- **Why institutions care:** Supports **different client types** (hold-to-maturity vs. trading desks) under one vault design.

### On-chain yield accounting (`process_yield`, `distribute_yield`)

- **What it does:** Accrues **pending yield** from policy parameters; distribution may be paired with **off-chain** Solstice flows depending on deployment (see section 2).
- **Why investors care:** **Transparent accrual rules** (what drives yield math) vs. black box.
- **Why institutions care:** **Operations and finance** can reconcile **on-chain state** to **external yield programs**.

### Operator vs. authority

- **What it does:** **Authority** typically governs (pause, config, credentials, registry/mandate). **Operator** runs day-to-day ops (NAV updates, yield hooks, USX account registration) unless `operator` is unset—in which case authority acts as operator.
- **Why investors care:** **Separation of duties** reduces single-key catastrophe scenarios when deployed with multisig / custody.
- **Why institutions care:** Mirrors **maker/checker**, **trading vs. legal sign-off**, and **custodian integration** patterns.

---

## 2. Real use of USX and the SIX API in this use case

### Solstice USX / eUSX (yield rail)

- **Role in the product:** USX is the **on-chain stablecoin** used to access Solstice’s **yield mechanics** (including locking USX to **eUSX** where that fits your deployment). The vault stores **mint and ATA addresses** (`register_usx_accounts`) so the **same vault** can hold USDC, USX, and eUSX positions as designed.
- **Real integration pattern (as implemented in this repo’s direction):** The **Solstice Instructions API** (HTTP) is used to build and submit flows such as **minting USX from USDC**, **locking USX for eUSX**, and reading **NAV / position** context for reconciliation—not a fictional CPI inside the vault program for every step.
- **Why that matters:** USX/eUSX is how this stack **plugs into Solstice’s yield** without pretending the entire yield curve is computed inside one custom Solana program.

### SIX (pricing / RWA reference)

- **Role in the product:** **Commodity / reference pricing** (e.g. gold-linked or basket context, depending on your SIX product choice) feeds **off-chain or service-layer** logic that decides **what NAV update to propose**. The **on-chain `set_nav`** instruction applies that NAV with **guardrails** (e.g. max move per step) and ties the update to the **RWA registry** so the number is **not anonymous**.
- **Real integration pattern:** Backend or operator workflow calls **SIX APIs** for **reference prices**, stores **audit payload** where your architecture requires (see `ISSUE.md` / backend patterns: `source: "SIX"`, raw payload retention), then **signs `set_nav`** as the **operator**.
- **Why that matters:** SIX answers “**what is the world price / reference?**” while the chain answers “**what NAV did we officially record, when, tied to which asset declaration?**”

### How the pieces fit

| Layer | Job |
|--------|-----|
| **SIX API** | Authoritative **market / reference inputs** for RWA-linked NAV decisions. |
| **Solstice USX / eUSX** | **On-chain stablecoin + yield position** for the slice of the portfolio allocated to that strategy (`usx_allocation_bps` drives **accrual math**; actual token movements are operational / CPI/API-backed). |
| **Oragami vault program** | **Accounting, compliance gates, NAV updates tied to registry, mandates, and investor protections**—not a full commodities exchange inside one program. |

---

## 3. Profit margin and what participants gain

### What end investors gain

- **Economic:** Exposure to a **rules-based** NAV path and (where deployed) **yield linked to USX/eUSX** and **reference-driven** updates—aiming for **stablecoin convenience** plus **RWA / carry** that pure cash does not offer.
- **Non-economic:** **Transparency** (NAV, registry, optional reserve checks), **compliance gating**, and **clear roles** (operator vs. authority)—reducing **fraud and governance** tail risk versus anonymous pools.

### What institutions gain

- **Risk & governance:** **Mandates**, **credentials**, **Travel Rule**, and **audit-friendly** events/logs align with **internal policy** and **external review**.
- **Operations:** Clear split between **pricing inputs** (SIX), **yield execution** (Solstice), and **on-chain investor accounting** (Oragami)—each layer can be owned by a different team or vendor.
- **Business development:** A **differentiated story**: RWA-linked NAV + compliant deposits + optional **secondary liquidity**—closer to **capital markets** than to generic DeFi.

### What the protocol / issuer / service provider can gain (high level)

Exact **fees** and **spreads** are a **product and legal choice** (management fee, performance fee, mint/redeem spread, custody fees). In principle:

- **Revenue levers:** **AUM-based fees**, **performance share**, **spread** on mint/redeem, **API / integration** or **white-label** fees to banks and asset managers.
- **Value capture:** If the product **aggregates institutional flow** and **sources yield** efficiently (SIX + Solstice + compliant rail), margin comes from **scale**, **risk selection**, and **operational excellence**—not from hiding leverage inside the contract.

### What this document does *not* claim

- It does **not** guarantee **returns**, **APY**, or **arbitrage**; those depend on **markets**, **Solstice parameters**, **SIX data**, and **how the vault is operated**.
- It does **not** replace **legal**, **tax**, or **securities** advice for any jurisdiction.

---

## Summary

Oragami is positioned as a **compliance-aware, NAV-based vault** that combines **reference pricing (SIX)**, **on-chain yield access (Solstice USX/eUSX)**, and **transparent accounting and policy (mandates, registry, checks)**—so **investors get clarity** and **institutions get controls**, while **economic upside** comes from **yield and scale** under a **disclosed** rule set, not from opaque mechanics.
