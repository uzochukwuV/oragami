# Oragami (CommoVault) - Project Progress Report

## StableHacks 2026 Submission

**Track:** RWA-Backed Stablecoin & Commodity Vaults  
**Team:** Oragami  
**Status:** MVP Complete - Ready for Demo

---

## Executive Summary

Oragami is an institutional-grade RWA vault system built on Solana that enables regulated entities to deposit assets, receive vault tokens (cVAULT), and earn delta-neutral yield through Solstice USX integration. The system features comprehensive KYC/AML/KYT compliance through a custom Transfer Hook extension on Token-2022.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Dashboard│  │ Terminal │  │ Risk     │  │ Monitor  │   │
│  │          │  │ Transfer │  │ Scanner  │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend (Rust/Actix-web)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ API      │  │ Service  │  │ Worker   │  │ Risk     │   │
│  │ Router   │  │ Layer    │  │ Queue    │  │ Service  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ SIX API  │  │ Range    │  │ Blocklist│  │ Database │   │
│  │ Client   │  │ Protocol │  │ Manager  │  │ Postgres │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Solana Programs (Anchor)                        │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │ oragami-vault        │  │ cvault-transfer-hook │        │
│  │ - initialize         │  │ - transfer_hook      │        │
│  │ - deposit            │  │ - whitelist mgmt     │        │
│  │ - redeem             │  │ - compliance check   │        │
│  │ - convert            │  │ - metadata validation│        │
│  └──────────────────────┘  └──────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## Completed Components

### 1. Solana Programs ✅

#### oragami-vault
- **Location:** `oragami-vault/programs/oragami-vault/`
- **Status:** Complete
- **Features:**
  - Vault initialization with Token-2022
  - Deposit USDC → mint cVAULT (1:1 backing)
  - Redeem cVAULT → withdraw USDC
  - Convert cVAULT ↔ cVAULT-TRADE
  - Fee collection mechanism
  - Admin controls (pause, fee updates)

#### cvault-transfer-hook
- **Location:** `programs/cvault-transfer-hook/`
- **Status:** Complete
- **Features:**
  - Token-2022 Transfer Hook extension
  - Whitelist-based compliance (KYC/AML)
  - Transfer metadata validation
  - Travel Rule support
  - Configurable transfer limits

### 2. Backend Compliance Relayer ✅

- **Location:** `backend/compliance-relayer/`
- **Status:** Complete
- **Stack:** Rust + Actix-web + PostgreSQL

#### Core Features:
- **API Layer:** RESTful endpoints with OpenAPI documentation
- **Rate Limiting:** Per-wallet and per-IP rate limits
- **Risk Scoring:** Range Protocol integration for KYT
- **Blocklist Management:** Database-backed address blocking
- **Wallet Profiling:** Transaction history analysis
- **Worker Queue:** Async blockchain transaction processing
- **Confidential Transfers:** ZK proof generation support

#### SIX API Integration (NEW):
- **Location:** `backend/compliance-relayer/src/infra/six/`
- **Features:**
  - MTLS certificate authentication
  - Forex rates (EUR/USD, CHF/USD, GBP/USD)
  - Precious metals (Gold, Silver, Platinum)
  - Equities (NYSE, NASDAQ, Copenhagen)
  - Vault NAV calculation
  - Price caching

#### API Endpoints:
```
POST /transfer-requests          - Submit transfer request
GET  /transfer-requests          - List transfer requests
GET  /transfer-requests/{id}     - Get transfer request
POST /transfer-requests/{id}/retry - Retry failed transfer
POST /risk-check                 - Check wallet risk
GET  /health                     - Health check
GET  /health/live                - Liveness probe
GET  /health/ready               - Readiness probe
POST /webhooks/helius            - Helius webhook
POST /webhooks/quicknode         - QuickNode webhook
POST /admin/blocklist            - Add to blocklist
GET  /admin/blocklist            - List blocklist
DELETE /admin/blocklist/{addr}   - Remove from blocklist
GET  /six/health                 - SIX API health check
GET  /six/instruments            - List available instruments
GET  /six/forex/{base}/{quote}   - Get forex rate
GET  /six/metal/{metal}          - Get precious metal price
GET  /six/equity/{valor}/{bc}    - Get equity price
POST /six/nav                    - Calculate vault NAV
```

### 3. Frontend Application ✅

- **Location:** `frontend/relayer-frontend/`
- **Status:** Complete
- **Stack:** Next.js 16 + TypeScript + Tailwind CSS

#### Features:
- **Dashboard:** Real-time analytics and metrics
- **Terminal:** Transfer interface with compliance checks
- **Risk Scanner:** Wallet risk analysis
- **Monitor:** Transaction status tracking
- **Admin Panel:** Blocklist and system management
- **WASM Signing:** Client-side transaction signing

### 4. Mosaic SDK ✅

- **Location:** `frontend/mosaic/`
- **Status:** Complete
- **Features:**
  - Token-2022 creation with RWA template
  - sRFC-37 allowlist support
  - Extension configuration UI
  - Token management interface

---

## Database Schema

### Tables:
1. **transfer_requests** - Transfer request tracking
2. **blocklist** - Blocked addresses
3. **wallet_risk_profiles** - Wallet risk scores
4. **jito_retry_tracking** - Jito bundle retry tracking

### Migrations:
- `20240101000000_create_transfer_requests_table.sql`
- `20240113000000_add_token_mint_to_requests.sql`
- `20250114000000_change_amount_to_bigint.sql`
- `20260115181500_add_confidential_transfers.sql`
- `20260116000000_structured_confidential_proofs.sql`
- `20260121000000_create_blocklist_table.sql`
- `20260124000000_create_wallet_risk_profiles.sql`
- `20260129000000_add_jito_retry_tracking.sql`
- `20260130000000_add_request_nonce.sql`

---

## SIX Data Integration

### Available Data Sources:

| Market | BC Code | Instruments |
|--------|---------|-------------|
| NYSE | 65 | Coca-Cola, Blackrock, Oracle, M&T Bank |
| Forex | 149 | EUR/USD, CHF/USD, CHF/EUR, GBP/USD |
| NASDAQ | 67 | Apple, Microsoft, Walmart, Intel |
| NASDAQ Copenhagen | 12 | Novo Nord, Danske Bank, Carlsberg, Nordea |

### Use Cases:
1. **Vault Collateral Valuation** - Real-time FX rates for multi-currency backing
2. **Commodity Pricing** - Precious metals for commodity-backed stablecoins
3. **Yield Calculation** - Market data for delta-neutral yield strategies
4. **NAV Reporting** - Accurate net asset value calculations

---

## Compliance Features

### KYC (Know Your Customer):
- Blocklist scanning before transfers
- Wallet risk profiling
- Transaction history analysis

### KYT (Know Your Transaction):
- Range Protocol risk scoring
- Real-time transaction monitoring
- Suspicious activity detection

### AML (Anti-Money Laundering):
- Database-backed blocklist
- Transfer amount limits
- Velocity checks

### Travel Rule:
- Metadata validation in transfers
- Sender/receiver information collection
- Threshold-based reporting

---

## Testing

### Test Coverage:
- Unit tests for domain logic
- Integration tests for API endpoints
- Database integration tests
- Blockchain HTTP tests
- Compliance provider tests

### Test Files:
- `tests/api_requests.rs`
- `tests/database_integration.rs`
- `tests/infra_blockchain_http_tests.rs`
- `tests/infra_compliance_tests.rs`
- `tests/integration_test.rs`

---

## Deployment

### Infrastructure:
- **Solana Validator:** Local testnet (port 8899)
- **PostgreSQL:** Docker container (port 5432)
- **Backend:** Rust binary (port 8080)
- **Frontend:** Next.js (port 3000)

### Docker Compose:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: compliance_user
      POSTGRES_PASSWORD: compliance_pass
      POSTGRES_DB: compliance_relayer
    ports:
      - "5432:5432"
```

---

## Competitive Advantages

1. **Institutional-Grade Compliance**
   - Full KYC/AML/KYT pipeline
   - Rust backend with production patterns
   - Database persistence with migrations

2. **Token-2022 Transfer Hook**
   - On-chain compliance enforcement
   - Only teams with deep Solana expertise implement this

3. **SIX Data Partner**
   - Real market data for yield backing
   - Institutional-grade pricing feeds

4. **Dual Token Model**
   - cVAULT (non-tradable, 1:1 backing)
   - cVAULT-TRADE (secondary market)

5. **Comprehensive Architecture**
   - Backend, Frontend, Smart Contracts
   - Full-stack implementation

---

## Next Steps for Production

1. **Deploy to Devnet**
   - Deploy Solana programs
   - Configure backend for devnet
   - Deploy frontend to Vercel

2. **SIX API Live Integration**
   - Test MTLS certificate
   - Fetch real market data
   - Display in frontend

3. **Video Demo**
   - 2-minute technical walkthrough
   - Show compliance flow
   - Demonstrate SIX integration

4. **Documentation**
   - API reference
   - Integration guide
   - Architecture diagrams

---

## Contact

**Project:** Oragami (CommoVault)  
**Hackathon:** StableHacks 2026  
**Track:** RWA-Backed Stablecoin & Commodity Vaults

---

*Built with ❤️ for StableHacks 2026*
