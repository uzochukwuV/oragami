# Oragami - Production Transition Plan

> **Goal**: Working devnet demo with real SIX API + Solstice USX
> **Deadline**: March 29, 2026 22:00

---

## Current State Summary

### Contracts (READY)
| Program | Status | Program ID |
|---------|--------|------------|
| oragami-vault | Built | `GRk6Qv4rAzWf1DiKPv5FLKPvGKkk8rEdNGDoK6VMf8sX` |
| cvault-transfer-hook | Built | `3K8V8s8gQtvJVZxW8Z9DvLU4MgginGBx5Yvptb7o6dmT` |

### Frontend Services Analysis

| Service | Mock % | Priority | Notes |
|---------|--------|----------|-------|
| api-client.ts | 0% | - | Base HTTP client (ready) |
| risk-check.ts | 10% | HIGH | Needs Range API key |
| vault-operations.ts | 50% | HIGH | Needs contract connection |
| transfer-hook-client.ts | 70% | HIGH | Needs contract connection |
| solstice-usx.ts | 80% | HIGH | Needs real USX addresses |
| cvault-trade.ts | 40% | MEDIUM | Depends on vault + hook |
| permissioned-pool.ts | 95% | LOW | Post-demo |
| yield-backing.ts | 100% | MEDIUM | Math is real, data is mock |


### Backend (compliance-relayer)
- SIX API: **Integrated** (needs cert activation)
- Risk Service: **Ready** (needs Range API key or stays in mock mode)
- Database: PostgreSQL required
- Transfer Queue: Background worker ready

---

## Phase 1: Deploy to Devnet (NOW)

### 1.1 Get Devnet SOL
```bash
solana config set --url devnet
solana airdrop 5
solana balance
```

### 1.2 Deploy Programs
```bash
# Deploy vault
cd oragami-vault
anchor deploy --provider.cluster devnet

# Deploy transfer hook
cd ../programs/cvault-transfer-hook
anchor deploy --provider.cluster devnet
```

### 1.3 Record Program IDs
After deployment, update these files with the NEW deployed program IDs:

1. **oragami-vault/programs/oragami-vault/src/lib.rs:4**
2. **oragami-vault/Anchor.toml** (programs.devnet section)
3. **programs/cvault-transfer-hook/.../src/lib.rs:5**
4. **programs/cvault-transfer-hook/Anchor.toml**
5. **frontend/relayer-frontend/src/services/transfer-hook-client.ts:11**

---

## Phase 2: Frontend Configuration

### 2.1 Environment Variables

Create `frontend/relayer-frontend/.env.local`:
```bash
# Solana
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet

# Program IDs (from deployment)
NEXT_PUBLIC_VAULT_PROGRAM_ID=<deployed-vault-id>
NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID=<deployed-hook-id>

# Backend
NEXT_PUBLIC_API_URL=http://localhost:8000

# Token Mints (Devnet)
NEXT_PUBLIC_USDC_MINT=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
```

### 2.2 Update Program IDs in Services

**transfer-hook-client.ts:11-12**
```typescript
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID || '<deployed-id>'
);
```

---

## Phase 3: Activate SIX API

### 3.1 Backend Configuration

The SIX API is already integrated in `backend/compliance-relayer/src/infra/six/`.

Update `backend/compliance-relayer/.env`:
```bash
# SIX API (you have access)
SIX_API_BASE_URL=https://api.six-group.com
SIX_CERT_PATH=./certs/six-certificate.p12
SIX_CERT_PASSWORD=<your-password>

# Enable SIX endpoints
ENABLE_SIX_API=true
```

### 3.2 Available SIX Endpoints
- `GET /api/six/forex/{base}/{quote}` - EUR/USD, CHF/USD, etc.
- `GET /api/six/metal/{metal}` - GOLD, SILVER, PLATINUM
- `GET /api/six/nav` - Calculate vault NAV

### 3.3 Frontend Integration

Update `frontend/relayer-frontend/src/services/yield-backing.ts` to call SIX API:

```typescript
// Replace hardcoded prices with real SIX data
export async function getRealTimePrice(asset: string): Promise<number> {
  const response = await fetch(`${API_BASE_URL}/api/six/metal/${asset}`);
  const data = await response.json();
  return data.price;
}
```

---

## Phase 4: Connect Vault Operations

### 4.1 Generate IDL

After deployment, generate the TypeScript IDL:
```bash
cd oragami-vault
anchor build
# IDL is at: target/idl/oragami_vault.json
```

### 4.2 Update vault-operations.ts

Replace mock implementation with real Anchor calls:

```typescript
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { OragamiVault } from '../idl/oragami_vault'; // Generated IDL type

const VAULT_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_VAULT_PROGRAM_ID);

export async function depositToVault(
  connection: Connection,
  wallet: Wallet,
  amount: number
): Promise<string> {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<OragamiVault>(IDL, VAULT_PROGRAM_ID, provider);

  const [vaultState] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_state')],
    VAULT_PROGRAM_ID
  );

  const tx = await program.methods
    .deposit({ amount: new BN(amount), nonce: generateNonce() })
    .accounts({
      vaultState,
      cvaultMint: await getVaultMint(connection, vaultState),
      vaultTokenAccount: await getVaultTokenAccount(connection, vaultState),
      payerDepositAccount: userUsdcAccount,
      payerCvaultAccount: userCvaultAccount,
      payer: wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  return tx;
}
```

---

## Phase 5: Connect Transfer Hook

### 5.1 Update transfer-hook-client.ts

Replace mock implementations with real Anchor calls:

```typescript
import { Program } from '@coral-xyz/anchor';
import { CvaultTransferHook } from '../idl/cvault_transfer_hook';

export async function addToWhitelist(
  connection: Connection,
  payer: Wallet,
  params: AddWhitelistParams
): Promise<string> {
  const provider = new AnchorProvider(connection, payer, {});
  const program = new Program<CvaultTransferHook>(IDL, TRANSFER_HOOK_PROGRAM_ID, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('compliance')],
    TRANSFER_HOOK_PROGRAM_ID
  );

  const [entryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('whitelist'), params.walletAddress.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID
  );

  const tx = await program.methods
    .addToWhitelist({
      kycCompliant: params.kycCompliant,
      amlClear: params.amlClear,
      travelRuleCompliant: params.travelRuleCompliant,
      expiryDays: new BN(params.expiryDays),
    })
    .accounts({
      config: configPda,
      entry: entryPda,
      wallet: params.walletAddress,
      payer: payer.publicKey,
      authority: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}
```

---

## Phase 6: Solstice USX Integration

### 6.1 Get Devnet USX Addresses

You mentioned you have USX devnet access. Update `solstice-usx.ts`:

```typescript
// Replace placeholders with real devnet addresses
export const USX_MINT_ADDRESS = new PublicKey('<real-usx-mint>');
export const SOLSTICE_YIELD_VAULT = new PublicKey('<real-solstice-vault>');
```

### 6.2 Implement Real Yield Allocation

```typescript
export async function allocateToYield(
  connection: Connection,
  params: AllocateParams
): Promise<string> {
  // Build actual Solstice deposit instruction
  // This depends on Solstice SDK/docs
  const instruction = buildSolsticeDepositInstruction(params);

  const tx = new Transaction().add(instruction);
  const signature = await sendAndConfirmTransaction(connection, tx, [params.authority]);

  return signature;
}
```

---

## Phase 7: Demo UI

### 7.1 Key Screens Needed

1. **Dashboard** - Show vault TVL, yield stats, compliance status
2. **Deposit Form** - Deposit USDC → Mint cVAULT
3. **Redeem Form** - Burn cVAULT → Get USDC
4. **Compliance Panel** - Show whitelist status, risk score
5. **Admin Panel** - Manage whitelist, view blocklist

### 7.2 Existing Components to Wire Up

| Component | Location | Status |
|-----------|----------|--------|
| RiskScanner | features/risk-scanner/ | Works (backend) |
| TransferForm | features/terminal/ | Needs vault connection |
| Monitor | features/monitor/ | Mock data |
| AdminOverlay | components/dashboard/ | Works |

---

## Priority Order for Demo

### Must Have (Day 1-2)
1. Deploy contracts to devnet
2. Initialize vault with test USDC
3. Deposit flow working
4. Basic compliance whitelist

### Should Have (Day 2-3)
1. SIX API price feeds live
2. Redeem flow working
3. Yield stats display
4. Admin whitelist management

### Nice to Have (Day 3+)
1. cVAULT-TRADE conversion
2. Full transfer hook enforcement
3. Permissioned pool trading
4. Real-time yield tracking

---

## Quick Start Commands

```bash
# 1. Deploy contracts
cd oragami-vault && anchor deploy --provider.cluster devnet
cd ../programs/cvault-transfer-hook && anchor deploy --provider.cluster devnet

# 2. Start backend
cd backend/compliance-relayer
cargo run --release

# 3. Start frontend
cd frontend/relayer-frontend
pnpm install
pnpm dev

# 4. Initialize vault (via script or frontend)
# - Create cVAULT mint
# - Set treasury
# - Enable deposits
```

---

## Files to Modify (Quick Reference)

| File | Change |
|------|--------|
| `frontend/.env.local` | Add program IDs, RPC URL |
| `transfer-hook-client.ts` | Real program calls |
| `vault-operations.ts` | Real deposit/redeem |
| `solstice-usx.ts` | Real USX addresses |
| `yield-backing.ts` | SIX API integration |
| `backend/.env` | SIX cert, Range API |

---

## Risk Mitigation

1. **If Range API not ready**: Backend works in mock mode (accepts all)
2. **If SIX API issues**: Use cached/fallback prices
3. **If USX not ready**: Show mock yield (already implemented)
4. **If transfer hook fails**: cVAULT still works (non-tradeable)

---

*Created: 2026-03-28*
*Target: StableHacks Demo*
