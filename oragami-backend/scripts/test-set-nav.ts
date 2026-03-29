import 'dotenv/config';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN, Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.VAULT_AUTHORITY_KEYPAIR!)));
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/solana/oragami_vault.idl.json'), 'utf-8'));
  const provider = new AnchorProvider(connection, new Wallet(kp), { commitment: 'confirmed' });
  const program = new Program(idl as Idl, provider);
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('vault_state')], program.programId);

  console.log('Calling set_nav 10001 bps...');
  const tx = await (program.methods as any)
    .setNav({ navPriceBps: new BN(10001) })
    .accounts({ vaultState: pda, authority: kp.publicKey })
    .rpc();
  console.log('OK tx=' + tx);

  const vs = await (program.account as any).vaultState.fetch(pda);
  console.log('navPriceBps now:', vs.navPriceBps.toString());
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
