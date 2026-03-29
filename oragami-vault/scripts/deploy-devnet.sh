#!/usr/bin/env bash
# Deploy oragami_vault to devnet (run from Git Bash: bash scripts/deploy-devnet.sh)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

FEE_PAYER="${FEE_PAYER:-$HOME/solana-wallet/id.json}"
if [[ ! -f "$FEE_PAYER" ]]; then
  FEE_PAYER="/c/solana-wallet/id.json"
fi

exec solana program deploy \
  target/deploy/oragami_vault.so \
  --program-id target/deploy/oragami_vault-keypair.json \
  --fee-payer "$FEE_PAYER" \
  --url devnet \
  --with-compute-unit-price 50000
