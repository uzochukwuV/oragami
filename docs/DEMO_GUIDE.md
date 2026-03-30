# Oragami Protocol - Devnet Demo Guide

> **Target: Solana Devnet Demo**
> Last Updated: 2026-03-28

---

## Project Structure (After Cleanup)

```
Oragami/
├── backend/
│   └── compliance-relayer/     # Rust compliance backend
├── frontend/
│   └── relayer-frontend/       # Next.js frontend
├── oragami-vault/              # Core vault Solana program
├── programs/
│   └── cvault-transfer-hook/   # Compliance transfer hook
├── SPEC.md                     # Technical specification
└── DEMO_GUIDE.md              # This file
```

---

## Prerequisites

### 1. Install Solana CLI

```bash
# Install Solana CLI (v2.1+)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Add to PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Verify
solana --version
```

### 2. Install Anchor CLI

```bash
# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1
avm use 0.30.1

# Verify
anchor --version
```

### 3. Install Node.js & pnpm

```bash
# Node.js 20+
# Install via nvm or download from nodejs.org

# Install pnpm
npm install -g pnpm
```

---

## Devnet Setup

### Step 1: Configure Solana for Devnet

```bash
# Switch to devnet
solana config set --url devnet

# Create/use wallet
solana-keygen new --no-passphrase -o ~/.config/solana/id.json
# OR use existing: solana config set --keypair ~/.config/solana/id.json

# Get devnet SOL (airdrop)
solana airdrop 5

# Verify balance
solana balance
```

### Step 2: Build Programs

```bash
# Build vault program
cd oragami-vault
anchor build

# Build transfer hook program
cd ../programs/cvault-transfer-hook
anchor build
```

### Step 3: Deploy to Devnet

```bash
# Deploy vault program
cd oragami-vault
anchor deploy --provider.cluster devnet

# Note the Program ID output, e.g.:
# Program Id: <NEW_VAULT_PROGRAM_ID>

# Deploy transfer hook
cd ../programs/cvault-transfer-hook
anchor deploy --provider.cluster devnet

# Note the Program ID output
```

### Step 4: Update Program IDs

After deployment, update these files with the new program IDs:

**oragami-vault/programs/oragami-vault/src/lib.rs:4**
```rust
declare_id!("<NEW_VAULT_PROGRAM_ID>");
```

**oragami-vault/Anchor.toml**
```toml
[programs.devnet]
oragami_vault = "<NEW_VAULT_PROGRAM_ID>"
```

**programs/cvault-transfer-hook/programs/cvault-transfer-hook/src/lib.rs:12**
```rust
declare_id!("<NEW_HOOK_PROGRAM_ID>");
```

**programs/cvault-transfer-hook/Anchor.toml**
```toml
[programs.devnet]
cvault-transfer-hook = "<NEW_HOOK_PROGRAM_ID>"
```

**frontend/relayer-frontend/src/services/transfer-hook-client.ts:11**
```typescript
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey('<NEW_HOOK_PROGRAM_ID>');
```

### Step 5: Rebuild After ID Update

```bash
# Rebuild with correct IDs
cd oragami-vault && anchor build
cd ../programs/cvault-transfer-hook && anchor build

# Redeploy (same IDs will be used)
anchor deploy --provider.cluster devnet
```

---

## Frontend Setup

```bash
cd frontend/relayer-frontend

# Install dependencies
pnpm install

# Create .env.local
cat > .env.local << EOF
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_VAULT_PROGRAM_ID=<NEW_VAULT_PROGRAM_ID>
NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID=<NEW_HOOK_PROGRAM_ID>
EOF

# Run development server
pnpm dev
```

---

## Backend Setup (Optional for Demo)

The compliance-relayer backend requires PostgreSQL:

```bash
cd backend/compliance-relayer

# Create .env
cat > .env << EOF
DATABASE_URL=postgres://user:pass@localhost:5432/oragami
SOLANA_RPC_URL=https://api.devnet.solana.com
RUST_LOG=info
EOF

# Build and run
cargo build --release
./target/release/compliance-relayer
```

---

## Demo Flow

### 1. Initialize Vault (Admin)

Using Anchor TypeScript client or CLI:

```typescript
// Initialize vault on devnet
const tx = await program.methods
  .initializeVault({
    treasury: treasuryPubkey,
    authority: adminPubkey,
    minDeposit: new BN(1_000_000),  // 1 USDC
    maxDeposit: new BN(1_000_000_000_000), // 1M USDC
    usxAllocationBps: 2000,  // 20% to yield
    cvaultTradeMint: tradeMintPubkey,
    secondaryMarketEnabled: true,
  })
  .accounts({
    vaultState: vaultStatePda,
    cvaultMint: cvaultMintPda,
    tokenAccount: vaultTokenPda,
    payer: admin.publicKey,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([admin])
  .rpc();
```

### 2. Add User to Whitelist (Compliance)

```typescript
// Add wallet to compliance whitelist
const tx = await hookProgram.methods
  .addToWhitelist({
    kycCompliant: true,
    amlClear: true,
    travelRuleCompliant: true,
    expiryDays: new BN(365),
  })
  .accounts({
    config: complianceConfigPda,
    entry: whitelistEntryPda,
    wallet: userWallet,
    payer: admin.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([admin])
  .rpc();
```

### 3. User Deposits USDC

```typescript
// User deposits 100 USDC
const tx = await program.methods
  .deposit({
    amount: new BN(100_000_000),  // 100 USDC (6 decimals)
    nonce: uuid(),
  })
  .accounts({
    vaultState: vaultStatePda,
    cvaultMint: cvaultMintPda,
    vaultTokenAccount: vaultTokenPda,
    treasury: treasuryPubkey,
    payerTokenAccount: userUsdcAccount,
    depositTokenMint: usdcMint,
    payer: user.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([user])
  .rpc();

// User now has 100 cVAULT tokens
```

### 4. Convert to Tradeable

```typescript
// Convert cVAULT to cVAULT-TRADE for secondary market
const tx = await program.methods
  .convertToTradeable({ amount: new BN(50_000_000) })
  .accounts({
    vaultState: vaultStatePda,
    cvaultMint: cvaultMintPda,
    cvaultTradeMint: tradeMintPda,
    userCvaultAccount: userCvaultAccount,
    userCvaultTradeAccount: userTradeAccount,
    authority: user.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([user])
  .rpc();
```

### 5. Transfer (With Compliance Check)

When transferring cVAULT-TRADE, the transfer hook automatically:
1. Validates sender is KYC/AML compliant
2. Validates recipient is whitelisted
3. Checks expiry dates
4. Logs compliance event

If any check fails, the transfer is rejected on-chain.

---

## Key Demo Points

1. **Institutional-Grade Compliance**: Every transfer validated on-chain
2. **1:1 Backing**: cVAULT tokens fully backed by deposited assets
3. **Secondary Market Ready**: cVAULT-TRADE enables compliant trading
4. **Yield Generation**: USX integration for delta-neutral yield
5. **Token-2022**: Uses latest Solana token standard with transfer hooks

---

## Useful Commands

| Command | Purpose |
|---------|---------|
| `solana config get` | Show current config |
| `solana balance` | Check wallet balance |
| `solana airdrop 5` | Get devnet SOL |
| `anchor build` | Build programs |
| `anchor deploy --provider.cluster devnet` | Deploy to devnet |
| `anchor test --provider.cluster devnet` | Run tests on devnet |
| `pnpm dev` | Run frontend |

---

## Troubleshooting

### "Insufficient funds"
```bash
solana airdrop 5  # Get more devnet SOL
```

### "Program not found"
- Ensure program is deployed: `solana program show <PROGRAM_ID>`
- Check cluster: `solana config get`

### "IDL doesn't exist"
```bash
anchor build  # Rebuild to generate IDL
```

### Transfer Hook Fails
- Check whitelist entry exists for both sender and recipient
- Verify KYC/AML flags are true
- Check expiry hasn't passed
