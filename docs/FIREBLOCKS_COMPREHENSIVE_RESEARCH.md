Oragami is an institutional-grade RWA vault system built on Solana that enables regulated entities to deposit assets, receive vault tokens (cVAULT), and earn delta-neutral yield through Solstice USX integration. The system features comprehensive KYC/AML/KYT compliance through a custom Transfer Hook extension on Token-2022.# Fireblocks Comprehensive Research Report
## Oragami Project Integration Analysis

**Date:** March 27, 2026  
**Project:** Oragami - Institutional RWA Vault System on Solana  
**Purpose:** Deep dive into Fireblocks features, documentation examples, and integration strategy

---

## Executive Summary

Fireblocks is an enterprise-grade digital asset custody, transfer, and settlement platform that provides institutional-level security and compliance infrastructure. This research analyzes how Fireblocks Solana integration can significantly enhance the Oragami project's institutional readiness, security posture, and compliance capabilities.

---

## 1. Fireblocks Platform Overview

### 1.1 Core Platform Components

Fireblocks provides a comprehensive suite of digital asset infrastructure:

- **MPC (Multi-Party Computation) Custody**: Military-grade key management using threshold cryptography
- **Policy Engine**: Programmable transaction approval workflows
- **Transfer Network**: Secure asset transfers across 1,300+ institutions
- **Compliance Suite**: Built-in KYC/AML/KYT tools
- **Solana Support**: Native integration with Solana blockchain

### 1.2 Key Differentiators

1. **Institutional Trust**: Used by 1,300+ financial institutions including banks, hedge funds, and market makers
2. **Security**: Zero security breaches since inception (2018)
3. **Compliance**: SOC 2 Type II, ISO 27001 certified
4. **Solana Native**: Full support for Solana programs, Token-2022, and DeFi protocols

---

## 2. Fireblocks Solana Capabilities

### 2.1 Solana Web3 Connection Adapter

The **Fireblocks Solana Web3 Connection Adapter** is a critical integration component that facilitates interactions between the Fireblocks API and the Solana blockchain.

**Key Features:**
- Simplifies transaction sending through Fireblocks
- Handles complex authentication and transaction signing
- Utilizes Fireblocks Program Call API for all transactions
- Provides seamless integration with Solana blockchain

**Repository:** [fireblocks/solana-web3-adapter](https://github.com/fireblocks/solana-web3-adapter)

**Installation:**
```bash
npm install @fireblocks/solana-web3-adapter
```

**Usage Example:**
```typescript
import { FireblocksConnectionAdapter } from '@fireblocks/solana-web3-adapter';

// Initialize the adapter
const connection = new FireblocksConnectionAdapter({
  apiKey: process.env.FIREBLOCKS_API_KEY,
  apiSecret: process.env.FIREBLOCKS_API_SECRET,
  vaultAccountId: '0',
  assetId: 'SOL'
});

// Use like a standard Solana web3.js connection
const balance = await connection.getBalance(publicKey);
```

### 2.2 @solana/keychain-fireblocks

The **@solana/keychain-fireblocks** package provides Fireblocks-based signer for Solana transactions using Fireblocks' institutional custody API.

**Repository:** [solana-foundation/solana-keychain](https://github.com/solana-foundation/solana-keychain)

**Installation:**
```bash
pnpm add @solana/keychain-fireblocks
```

**Prerequisites:**
1. A Fireblocks account with API access
2. A vault account with Solana (SOL) asset configured
3. An API user with appropriate permissions

**Usage Example:**
```typescript
import { FireblocksSigner } from '@solana/keychain-fireblocks';

const signer = new FireblocksSigner({
  apiKey: process.env.FIREBLOCKS_API_KEY,
  apiSecret: process.env.FIREBLOCKS_API_SECRET,
  vaultAccountId: '0'
});

// Sign a transaction
const signedTx = await signer.signTransaction(transaction);
```

### 2.3 Fireblocks TypeScript SDK

The official **Fireblocks TypeScript SDK** provides comprehensive API access for managing vault accounts and executing transactions securely.

**Installation:**
```bash
npm install @fireblocks/ts-sdk
```

**Key Features:**
- Vault account creation and management
- Transaction creation and monitoring
- Asset management across multiple blockchains
- Policy engine configuration
- Webhook management

**Usage Example:**
```typescript
import { FireblocksSDK } from '@fireblocks/ts-sdk';

const fireblocks = new FireblocksSDK({
  apiKey: process.env.FIREBLOCKS_API_KEY,
  apiSecret: process.env.FIREBLOCKS_API_SECRET,
  baseUrl: 'https://api.fireblocks.io' // or sandbox
});

// Create a vault account
const vault = await fireblocks.vaults.createVaultAccount({
  name: 'Oragami Institutional Vault',
  hiddenOnUI: false,
  autoFuel: true
});

// Get vault balance
const balance = await fireblocks.vaults.getVaultAccountAsset({
  vaultAccountId: vault.id,
  assetId: 'SOL'
});
```

### 2.4 Solana Program Interaction

Fireblocks supports **Native Program Calls** for Solana, enabling direct interaction with Solana programs.

**Key Capabilities:**
- Direct program execution through Fireblocks
- Support for SPL tokens and Token-2022
- Program-derived address (PDA) management
- Transaction signing for complex Solana programs

**Example: Interacting with Oragami Vault Program**
```typescript
import { FireblocksConnectionAdapter } from '@fireblocks/solana-web3-adapter';
import { Program } from '@coral-xyz/anchor';

// Initialize Fireblocks connection
const connection = new FireblocksConnectionAdapter({
  apiKey: process.env.FIREBLOCKS_API_KEY,
  apiSecret: process.env.FIREBLOCKS_API_SECRET,
  vaultAccountId: '0'
});

// Load Oragami vault program
const program = new Program(IDL, PROGRAM_ID, { connection });

// Execute deposit instruction
const tx = await program.methods
  .deposit(new BN(100000))
  .accounts({
    vault: vaultPda,
    user: userAccount,
    tokenAccount: userTokenAccount,
    // ... other accounts
  })
  .rpc();
```

### 2.5 Gasless Transactions

Fireblocks provides **Gasless Transactions** for Solana, eliminating the need for users to hold SOL for gas fees.

**Key Benefits:**
- No need for users to pre-fund SOL
- Simplified user experience
- Reduced operational complexity
- Scalable transaction processing

**Implementation:**
```typescript
const transaction = await fireblocks.transactions.createTransaction({
  operation: 'PROGRAM_CALL',
  assetId: 'SOL',
  source: {
    type: 'VAULT_ACCOUNT',
    id: vaultId
  },
  destination: {
    type: 'ONE_TIME_ADDRESS',
    address: destinationAddress
  },
  amount: '0', // Gasless transaction
  extraParameters: {
    programCallData: {
      instructions: [/* your instructions */]
    }
  }
});
```

---

## 3. Policy Engine & Governance

### 3.1 Policy Engine Overview

The **Fireblocks Policy Engine** is a workflow authorization solution that automates governance policies for user and transaction rules.

**Key Features:**
- Configurable user roles and permissions
- Transaction approval workflows
- Amount-based approval thresholds
- Address whitelisting/blacklisting
- Time-based restrictions
- Velocity limits

### 3.2 Policy Configuration Examples

**Example 1: Large Transfer Approval**
```json
{
  "name": "Large Transfer Approval",
  "description": "Require multi-sig approval for transfers > $100K",
  "rules": [
    {
      "type": "TRANSACTION",
      "conditions": [
        {
          "attribute": "AMOUNT",
          "operator": "GREATER_THAN",
          "value": "100000"
        }
      ],
      "actions": [
        {
          "type": "REQUIRE_APPROVAL",
          "approvers": ["compliance_officer", "cfo"]
        }
      ]
    }
  ]
}
```

**Example 2: Whitelisted Address Only**
```json
{
  "name": "Whitelisted Address Only",
  "description": "Auto-approve transfers to whitelisted addresses",
  "rules": [
    {
      "type": "TRANSACTION",
      "conditions": [
        {
          "attribute": "DESTINATION_ADDRESS",
          "operator": "IN_LIST",
          "value": "institutional_whitelist"
        }
      ],
      "actions": [
        {
          "type": "AUTO_APPROVE"
        }
      ]
    }
  ]
}
```

**Example 3: Compliance Check Integration**
```json
{
  "name": "Compliance Check",
  "description": "Webhook to Oragami compliance API",
  "rules": [
    {
      "type": "TRANSACTION",
      "conditions": [
        {
          "attribute": "OPERATION",
          "operator": "EQUALS",
          "value": "TRANSFER"
        }
      ],
      "actions": [
        {
          "type": "WEBHOOK",
          "url": "https://api.oragami.com/compliance/check",
          "method": "POST"
        },
        {
          "type": "REQUIRE_APPROVAL",
          "until": "webhook_response.approved == true"
        }
      ]
    }
  ]
}
```

### 3.3 Policy Management via API

**Get Active Policy:**
```typescript
const activePolicy = await fireblocks.policyEngine.getActivePolicy();
console.log('Active Policy:', activePolicy);
```

**Publish New Policy:**
```typescript
const newPolicy = await fireblocks.policyEngine.publishPolicy({
  rules: [
    // Your policy rules
  ]
});
```

**Work with Policy Drafts:**
```typescript
// Get current draft
const draft = await fireblocks.policyEngine.getDraft();

// Update draft
await fireblocks.policyEngine.updateDraft({
  rules: [/* updated rules */]
});

// Publish draft
await fireblocks.policyEngine.publishDraft();
```

---

## 4. Travel Rule Compliance

### 4.1 Travel Rule Overview

Fireblocks provides **Travel Rule** compliance through integration with Notabene, enabling VASPs to share originator and beneficiary information for transactions.

**Key Features:**
- IVMS101-compliant PII data handling
- Automatic Travel Rule message generation
- Integration with Notabene for Travel Rule messaging
- Support for multiple jurisdictions

### 4.2 Travel Rule API Examples

**Create Travel Rule Message:**
```typescript
const travelRuleMessage = await fireblocks.travelRule.createMessage({
  originator: {
    originatorPersons: [{
      naturalPerson: {
        name: [{
          nameIdentifier: [{
            primaryIdentifier: "John",
            secondaryIdentifier: "Doe"
          }]
        }],
        dateOfBirth: "1990-01-01",
        placeOfBirth: "New York",
        address: [{
          addressLine: "123 Main St",
          country: "US"
        }]
      }
    }],
    accountNumber: ["ACC-123456"]
  },
  beneficiary: {
    beneficiaryPersons: [{
      naturalPerson: {
        name: [{
          nameIdentifier: [{
            primaryIdentifier: "Jane",
            secondaryIdentifier: "Smith"
          }]
        }]
      }
    }],
    accountNumber: ["ACC-789012"]
  },
  originatingVasp: {
    originatorVasp: {
      legalPerson: {
        name: [{
          nameIdentifier: [{
            legalPersonName: "Oragami Finance",
            legalPersonNameIdentifierType: "LEGL"
          }]
        }],
        address: [{
          addressLine: "456 Crypto Ave",
          country: "US"
        }]
      }
    }
  },
  beneficiaryVasp: {
    beneficiaryVasp: {
      legalPerson: {
        name: [{
          nameIdentifier: [{
            legalPersonName: "Partner VASP",
            legalPersonNameIdentifierType: "LEGL"
          }]
        }]
      }
    }
  },
  transferAmount: {
    amount: 500000,
    currency: "USDC"
  }
});
```

**Update Travel Rule Configuration:**
```typescript
await fireblocks.travelRule.updateConfig({
  bypassScreening: false,
  inboundDelay: 0,
  outboundDelay: 0
});
```

---

## 5. Webhooks & Event Notifications

### 5.1 Webhook Overview

Fireblocks provides **Webhooks** for real-time notifications about events in your workspace, enabling event-driven architecture.

**Key Event Types:**
- `TRANSACTION_CREATED`: New transaction initiated
- `TRANSACTION_STATUS_UPDATED`: Transaction status changed
- `VAULT_ACCOUNT_CREATED`: New vault account created
- `VAULT_ASSET_CREATED`: New asset added to vault
- `POLICY_ENGINE_APPROVAL`: Policy approval required

### 5.2 Webhook Configuration

**Create Webhook:**
```typescript
const webhook = await fireblocks.webhooks.createWebhook({
  url: "https://api.oragami.com/fireblocks/webhook",
  events: [
    "TRANSACTION_CREATED",
    "TRANSACTION_STATUS_UPDATED",
    "POLICY_ENGINE_APPROVAL"
  ],
  enabled: true
});
```

**Webhook Handler Example (Rust/Actix-web):**
```rust
use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct FireblocksWebhook {
    pub event_type: String,
    pub transaction_id: String,
    pub status: String,
    pub policy_engine: Option<PolicyEngineResult>,
}

#[derive(Deserialize)]
pub struct PolicyEngineResult {
    pub approved: bool,
    pub approvers: Vec<String>,
    pub reason: Option<String>,
}

pub async fn handle_fireblocks_webhook(
    webhook: web::Json<FireblocksWebhook>,
) -> Result<HttpResponse> {
    match webhook.event_type.as_str() {
        "TRANSACTION_CREATED" => {
            log::info!("Fireblocks transaction created: {}", webhook.transaction_id);
        }
        "POLICY_ENGINE_APPROVAL" => {
            if let Some(policy) = &webhook.policy_engine {
                if policy.approved {
                    log::info!("Transaction approved by: {:?}", policy.approvers);
                } else {
                    log::warn!("Transaction rejected: {:?}", policy.reason);
                }
            }
        }
        "TRANSACTION_STATUS_UPDATED" => {
            log::info!("Transaction {} status: {}", 
                webhook.transaction_id, webhook.status);
        }
        _ => {
            log::debug!("Unhandled Fireblocks event: {}", webhook.event_type);
        }
    }
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "received"
    })))
}
```

---

## 6. Vault Account Management

### 6.1 Vault Account Types

Fireblocks supports multiple vault account types:

- **Hot Wallet**: Third MPC key share held by API user on API co-signer
- **Warm Wallet**: Third MPC key share held on internet-connected mobile device
- **Cold Wallet**: Third MPC key share held on air-gapped (offline) mobile device

### 6.2 Vault Account Operations

**Create Vault Account:**
```typescript
const vault = await fireblocks.vaults.createVaultAccount({
  name: 'Oragami Institutional Vault',
  hiddenOnUI: false,
  customerRefId: 'ORAGAMI-001',
  autoFuel: true,
  vaultType: 'MPC'
});
```

**Add Asset to Vault:**
```typescript
const asset = await fireblocks.vaults.createVaultAsset({
  vaultAccountId: vault.id,
  assetId: 'SOL'
});
```

**Get Vault Balance:**
```typescript
const balance = await fireblocks.vaults.getVaultAccountAsset({
  vaultAccountId: vault.id,
  assetId: 'SOL'
});
```

**Generate Deposit Address:**
```typescript
const address = await fireblocks.vaults.generateNewAddress({
  vaultAccountId: vault.id,
  assetId: 'SOL',
  description: 'Oragami deposit address'
});
```

---

## 7. Transaction Management

### 7.1 Transaction Types

Fireblocks supports multiple transaction operations:

- **TRANSFER**: Standard asset transfers
- **CONTRACT_CALL**: Smart contract interactions (EVM)
- **PROGRAM_CALL**: Solana program interactions
- **TYPED_MESSAGE**: Off-chain message signing
- **RAW**: Raw transaction signing

### 7.2 Transaction Examples

**Create Transfer Transaction:**
```typescript
const transaction = await fireblocks.transactions.createTransaction({
  operation: 'TRANSFER',
  assetId: 'SOL',
  source: {
    type: 'VAULT_ACCOUNT',
    id: sourceVaultId
  },
  destination: {
    type: 'VAULT_ACCOUNT',
    id: destinationVaultId
  },
  amount: '1000000000', // 1 SOL in lamports
  note: 'Oragami vault deposit'
});
```

**Create Program Call Transaction:**
```typescript
const transaction = await fireblocks.transactions.createTransaction({
  operation: 'PROGRAM_CALL',
  assetId: 'SOL',
  source: {
    type: 'VAULT_ACCOUNT',
    id: vaultId
  },
  destination: {
    type: 'ONE_TIME_ADDRESS',
    address: programAddress
  },
  amount: '0',
  extraParameters: {
    programCallData: {
      instructions: [
        {
          programId: 'YourProgramId11111111111111111111111111111',
          keys: [
            { pubkey: 'Key1111111111111111111111111111111111111', isSigner: true, isWritable: true },
            { pubkey: 'Key2222222222222222222222222222222222222', isSigner: false, isWritable: true }
          ],
          data: Buffer.from([/* instruction data */]).toString('base64')
        }
      ]
    }
  }
});
```

**Monitor Transaction Status:**
```typescript
const transaction = await fireblocks.transactions.getTransaction({
  txId: transactionId
});

console.log('Status:', transaction.status);
console.log('Sub-status:', transaction.subStatus);
```

---

## 8. Compliance Integrations

### 8.1 Compliance Partners

Fireblocks integrates with leading compliance providers:

- **Chainalysis**: Transaction monitoring and risk scoring
- **Elliptic**: Wallet screening and compliance
- **Notabene**: Travel Rule compliance
- **ComplyAdvantage**: AML screening

### 8.2 Transaction Screening

```typescript
// Enable transaction screening
const screening = await fireblocks.compliance.enableScreening({
  provider: 'chainalysis',
  config: {
    apiKey: process.env.CHAINALYSIS_API_KEY,
    riskThreshold: 7.0
  }
});
```

### 8.3 Wallet Screening

```typescript
// Screen a wallet address
const riskScore = await fireblocks.compliance.screenWallet({
  address: 'SolanaAddressHere',
  assetId: 'SOL',
  provider: 'chainalysis'
});
```

---

## 9. Network Connections

### 9.1 Fireblocks Network

The **Fireblocks Network** enables secure, instant settlement between 1,300+ institutions.

**Create Network Connection:**
```typescript
const connection = await fireblocks.networkConnections.createNetworkConnection({
  remoteNetworkId: 'partner-network-id',
  routingPolicy: {
    scheme: 'CUSTOM',
    destinationAccountId: 'your-vault-id'
  }
});
```

---

## 10. How Fireblocks Improves Oragami

### 10.1 Current Oragami Limitations

| Limitation | Impact |
|------------|--------|
| Browser wallet dependency | Not institutional-grade |
| Manual key management | Security risk |
| Limited approval workflows | Compliance gap |
| No Travel Rule messaging | Regulatory risk |
| No institutional network | Limited liquidity |

### 10.2 Fireblocks Solutions

| Oragami Need | Fireblocks Solution |
|--------------|---------------------|
| Institutional custody | MPC wallets with HSM |
| Transaction approval | Policy Engine |
| Travel Rule compliance | Notabene integration |
| Institutional liquidity | Fireblocks Network |
| Solana program interaction | Native Program Calls |
| Gas management | Gasless Transactions |

### 10.3 Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Dashboard│  │ Terminal │  │ Risk     │  │ Monitor  │   │
│  │          │  │ Transfer │  │ Scanner  │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                      │                                      │
│                      ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Fireblocks SDK Integration                  │  │
│  │  - MPC Wallet Management                              │  │
│  │  - Policy Engine                                      │  │
│  │  - Travel Rule Messaging                              │  │
│  │  - Transaction Signing                                │  │
│  └──────────────────────────────────────────────────────┘  │
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
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Fireblocks Webhook Handler                  │  │
│  │  - Policy approval callbacks                          │  │
│  │  - Transaction status updates                         │  │
│  │  - Travel Rule validation                             │  │
│  └──────────────────────────────────────────────────────┘  │
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
│                      │                                      │
│                      ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Fireblocks Vault Accounts                   │  │
│  │  - Institutional custody                              │  │
│  │  - Multi-sig approval                                 │  │
│  │  - Policy enforcement                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Tasks:**
1. **Fireblocks Account Setup**
   - Create Fireblocks sandbox account
   - Configure vault accounts for Oragami
   - Set up API credentials

2. **SDK Integration**
   - Install Fireblocks TypeScript SDK
   - Install @fireblocks/solana-web3-adapter
   - Configure environment variables
   - Create Fireblocks service wrapper

3. **Basic Custody**
   - Implement Fireblocks wallet connection
   - Test basic transaction signing
   - Verify Solana program interaction

**Deliverables:**
- ✅ Fireblocks sandbox environment
- ✅ Basic SDK integration
- ✅ Transaction signing working

### Phase 2: Policy Engine (Week 3-4)

**Tasks:**
1. **Policy Configuration**
   - Define approval workflows
   - Configure amount-based rules
   - Set up address whitelisting

2. **Webhook Handler**
   - Implement backend webhook endpoint
   - Integrate with compliance API
   - Add policy approval logic

3. **Frontend Integration**
   - Add Fireblocks wallet option
   - Display policy approval status
   - Show transaction approval flow

**Deliverables:**
- ✅ Policy engine configured
- ✅ Webhook handler working
- ✅ Frontend showing approval flow

### Phase 3: Travel Rule (Week 5-6)

**Tasks:**
1. **Travel Rule Integration**
   - Implement IVMS101 message generation
   - Integrate with Fireblocks Travel Rule
   - Test with institutional counterparties

2. **Compliance Enhancement**
   - Enhance compliance API with Travel Rule
   - Add regulatory reporting
   - Implement audit trail

3. **Testing**
   - End-to-end Travel Rule testing
   - Compliance validation
   - Security audit

**Deliverables:**
- ✅ Travel Rule compliance
- ✅ Enhanced compliance reporting
- ✅ Audit trail complete

### Phase 4: Production (Week 7-8)

**Tasks:**
1. **Production Setup**
   - Migrate to production Fireblocks account
   - Configure production policies
   - Set up monitoring and alerting

2. **Security Hardening**
   - Security audit
   - Penetration testing
   - Compliance certification

3. **Documentation**
   - Integration guide
   - API documentation
   - Compliance documentation

**Deliverables:**
- ✅ Production-ready integration
- ✅ Security audit passed
- ✅ Documentation complete

---

## 12. Cost Analysis

### Fireblocks Pricing (Estimated)

| Component | Cost | Notes |
|-----------|------|-------|
| **Sandbox** | Free | For development and testing |
| **Production** | $2,000-5,000/month | Based on transaction volume |
| **Vault Accounts** | $500-1,000/month | Per institutional vault |
| **Policy Engine** | Included | Part of platform |
| **Travel Rule** | $0.10-0.50/message | Per Travel Rule message |
| **Transfer Network** | Free | For Fireblocks-to-Fireblocks |

**Total Estimated Cost:**
- **Development**: Free (sandbox)
- **Production**: $3,000-7,000/month
- **Per Transaction**: $0.10-0.50 (Travel Rule only)

### ROI Analysis

**Benefits:**
- ✅ Access to institutional investors (banks, hedge funds)
- ✅ Insurance coverage for digital assets
- ✅ Regulatory compliance (Travel Rule, KYC/AML)
- ✅ Reduced security risk
- ✅ Audit-ready infrastructure

**Value:**
- Institutional AUM potential: $10M-100M+
- Insurance coverage: Up to $150M per vault
- Compliance cost savings: $50K-100K/year
- Security incident prevention: Priceless

---

## 13. Competitive Analysis

### Oragami vs. Competitors with Fireblocks

| Feature | Oragami (Current) | Oragami + Fireblocks | Ondo Finance | Maple Finance |
|---------|-------------------|----------------------|--------------|---------------|
| **Custody** | Browser wallets | Fireblocks MPC | Institutional | Institutional |
| **Compliance** | API-based | API + Policy Engine | Basic | Basic |
| **Travel Rule** | Basic metadata | Full IVMS101 | None | None |
| **Transfer Network** | None | Fireblocks Network | None | None |
| **Security** | Browser wallet | MPC + HSM | Institutional | Institutional |
| **Insurance** | None | Up to $150M | Yes | Yes |
| **Solana Support** | Native | Native | Limited | None |

**Competitive Advantage:**
- ✅ First Solana RWA vault with Fireblocks integration
- ✅ Full Travel Rule compliance
- ✅ Institutional-grade custody
- ✅ Programmable policy engine

---

## 14. Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **SDK Integration Complexity** | Medium | Medium | Use Fireblocks sandbox, extensive testing |
| **Policy Engine Performance** | Low | Medium | Optimize webhook handlers, caching |
| **Travel Rule Interoperability** | Medium | High | Use IVMS101 standard, test with multiple providers |
| **Solana Program Compatibility** | Low | High | Fireblocks supports Token-2022, test thoroughly |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Fireblocks Cost** | Medium | Medium | Start with sandbox, scale gradually |
| **Regulatory Changes** | Low | High | Fireblocks handles compliance updates |
| **Competition** | Medium | Medium | First-mover advantage on Solana |
| **Adoption** | Medium | High | Partner with AMINA Bank, UBS |

---

## 15. Recommendations

### Immediate Actions (Post-Hackathon)

1. **Create Fireblocks Sandbox Account**
   - Sign up for Fireblocks sandbox
   - Configure vault accounts
   - Test basic integration

2. **Proof of Concept**
   - Implement Fireblocks wallet connection
   - Test transaction signing
   - Verify policy engine integration

3. **Partner Engagement**
   - Discuss Fireblocks integration with AMINA Bank
   - Get feedback on policy requirements
   - Validate Travel Rule needs

### Short-Term (1-3 Months)

1. **Full Integration**
   - Complete Phase 1-2 implementation
   - Deploy to devnet with Fireblocks
   - Test with institutional partners

2. **Compliance Validation**
   - Travel Rule testing
   - Regulatory review
   - Security audit

3. **Documentation**
   - Integration guide
   - API documentation
   - Compliance documentation

### Long-Term (3-6 Months)

1. **Production Deployment**
   - Migrate to production Fireblocks
   - Launch with institutional partners
   - Scale to multiple vaults

2. **Feature Enhancement**
   - Advanced policy workflows
   - Multi-chain support
   - Enhanced reporting

3. **Market Expansion**
   - Onboard additional institutions
   - Expand to new asset classes
   - Geographic expansion

---

## 16. Conclusion

Fireblocks Solana integration is a **strategic imperative** for Oragami's institutional adoption. The combination of:

- **Institutional Custody** (MPC + HSM)
- **Programmable Policy Engine** (approval workflows)
- **Travel Rule Compliance** (IVMS101)
- **Transfer Network** (1,300+ institutions)
- **Enhanced Security** (zero breaches)

...positions Oragami as the **first institutional-grade RWA vault on Solana** with full compliance infrastructure.

### Key Takeaways

1. **Fireblocks solves the #1 barrier to institutional adoption**: Custody and security
2. **Policy engine enhances existing compliance**: Programmatic approval workflows
3. **Travel Rule compliance is critical**: Required for institutional transfers
4. **Transfer network enables liquidity**: Connect to 1,300+ institutions
5. **Competitive advantage**: First Solana RWA vault with Fireblocks integration

### Next Steps

1. ✅ Create Fireblocks sandbox account (Week 1)
2. ✅ Implement basic SDK integration (Week 2)
3. ✅ Configure policy engine (Week 3)
4. ✅ Test Travel Rule integration (Week 4)
5. ✅ Deploy to devnet (Week 5)
6. ✅ Partner validation (Week 6)
7. ✅ Production deployment (Week 7-8)

---

## Appendix

### A. Fireblocks Resources

- **Documentation**: https://developers.fireblocks.com
- **Solana Web3 Adapter**: https://github.com/fireblocks/solana-web3-adapter
- **TypeScript SDK**: https://github.com/fireblocks/ts-sdk
- **Developers Hub**: https://github.com/fireblocks/developers-hub
- **API Reference**: https://developers.fireblocks.com/reference
- **Support**: https://support.fireblocks.com

### B. Oragami Integration Files

**Files to Create/Modify:**
- `frontend/mosaic/apps/app/src/features/wallet/hooks/use-fireblocks.ts`
- `frontend/mosaic/apps/app/src/features/wallet/components/fireblocks-connect-button.tsx`
- `backend/compliance-relayer/src/api/fireblocks.rs`
- `backend/compliance-relayer/src/infra/fireblocks/mod.rs`
- `backend/compliance-relayer/src/infra/fireblocks/policy.rs`
- `backend/compliance-relayer/src/infra/fireblocks/travel_rule.rs`

### C. Environment Variables

```bash
# Fireblocks Configuration
FIREBLOCKS_API_KEY=your_api_key
FIREBLOCKS_API_SECRET=your_api_secret
FIREBLOCKS_VAULT_ID=your_vault_id
FIREBLOCKS_SANDBOX=true  # Set to false for production

# Fireblocks Webhook
FIREBLOCKS_WEBHOOK_SECRET=your_webhook_secret
FIREBLOCKS_WEBHOOK_URL=https://api.oragami.com/fireblocks/webhook

# Policy Engine
FIREBLOCKS_POLICY_ID=your_policy_id
FIREBLOCKS_APPROVAL_THRESHOLD=100000  # USDC
```

### D. Example Policy Configuration

```json
{
  "name": "Oragami Institutional Policy",
  "description": "Policy for Oragami vault operations",
  "rules": [
    {
      "name": "Small Transfers",
      "conditions": [
        {
          "attribute": "AMOUNT",
          "operator": "LESS_THAN_OR_EQUAL",
          "value": "10000"
        }
      ],
      "actions": [
        {
          "type": "AUTO_APPROVE"
        }
      ]
    },
    {
      "name": "Medium Transfers",
      "conditions": [
        {
          "attribute": "AMOUNT",
          "operator": "GREATER_THAN",
          "value": "10000"
        },
        {
          "attribute": "AMOUNT",
          "operator": "LESS_THAN_OR_EQUAL",
          "value": "100000"
        }
      ],
      "actions": [
        {
          "type": "REQUIRE_APPROVAL",
          "approvers": ["compliance_officer"]
        }
      ]
    },
    {
      "name": "Large Transfers",
      "conditions": [
        {
          "attribute": "AMOUNT",
          "operator": "GREATER_THAN",
          "value": "100000"
        }
      ],
      "actions": [
        {
          "type": "REQUIRE_APPROVAL",
          "approvers": ["compliance_officer", "cfo"]
        },
        {
          "type": "WEBHOOK",
          "url": "https://api.oragami.com/fireblocks/webhook"
        }
      ]
    }
  ]
}
```

---

*Research conducted for Oragami (CommoVault) - StableHacks 2026*  
*Date: March 27, 2026*
