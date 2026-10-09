import {
  AuthorityType, MINT_SIZE, TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction, createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction, createMintToInstruction, createSetAuthorityInstruction,
  createTransferInstruction, getAssociatedTokenAddressSync, getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { AppError, Result } from '../../core/status';
import { getConnection } from '../../services/solana';
import { withWallet } from '../wallet/mwa';

export type OwnedAsset = { mint: string };

const fail = (code: AppError['code'], message: string): Result<never> => ({ ok: false, error: { code, message } });
const notConfigured = () => fail('NOT_CONFIGURED', 'Solana RPC URL is not configured.');

type Sent = { signature: string; blockhash: string; lastValidBlockHeight: number; extra?: string };

async function confirm(sent: Sent): Promise<Result<{ signature: string; mint?: string }>> {
  const conn = getConnection();
  if (!conn) return notConfigured();
  try {
    const res = await conn.confirmTransaction(
      { signature: sent.signature, blockhash: sent.blockhash, lastValidBlockHeight: sent.lastValidBlockHeight },
      'confirmed',
    );
    if (res.value.err) return fail('TX_FAILED', 'The transaction failed on-chain.');
    return { ok: true, value: { signature: sent.signature, mint: sent.extra } };
  } catch {
    return fail('TIMEOUT', 'Could not confirm the transaction. Check the explorer before retrying.');
  }
}

export async function listAssets(owner: string): Promise<Result<OwnedAsset[]>> {
  const conn = getConnection();
  if (!conn) return notConfigured();
  try {
    const res = await conn.getParsedTokenAccountsByOwner(new PublicKey(owner), { programId: TOKEN_PROGRAM_ID });
    const assets = res.value
      .map((v) => v.account.data.parsed.info)
      .filter((i) => i.tokenAmount.decimals === 0 && i.tokenAmount.amount === '1')
      .map((i) => ({ mint: i.mint as string }));
    return { ok: true, value: assets };
  } catch {
    return fail('RPC_UNAVAILABLE', 'Could not read assets from Solana.');
  }
}

/** Creates a 1-of-1 SPL token owned by the connected wallet; mint authority is removed. */
export async function createAsset(): Promise<Result<{ signature: string; mint?: string }>> {
  const conn = getConnection();
  if (!conn) return notConfigured();
  const sent = await withWallet<Sent>(async (wallet, owner) => {
    const mint = Keypair.generate(); // one-time signer, kept in memory only, never stored
    const lamports = await getMinimumBalanceForRentExemptMint(conn);
    const ata = getAssociatedTokenAddressSync(mint.publicKey, owner);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(
      SystemProgram.createAccount({
        fromPubkey: owner, newAccountPubkey: mint.publicKey, space: MINT_SIZE, lamports, programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(mint.publicKey, 0, owner, null),
      createAssociatedTokenAccountInstruction(owner, ata, owner, mint.publicKey),
      createMintToInstruction(mint.publicKey, ata, owner, 1),
      createSetAuthorityInstruction(mint.publicKey, owner, AuthorityType.MintTokens, null),
    );
    tx.partialSign(mint);
    const [signature] = await wallet.signAndSendTransactions({ transactions: [tx] });
    return { signature, blockhash, lastValidBlockHeight, extra: mint.publicKey.toBase58() };
  });
  if (!sent.ok) return sent;
  return confirm(sent.value);
}

export async function transferAsset(mint: string, to: string): Promise<Result<{ signature: string }>> {
  const conn = getConnection();
  if (!conn) return notConfigured();
  let mintPk: PublicKey, dest: PublicKey;
  try {
    mintPk = new PublicKey(mint);
    dest = new PublicKey(to.trim());
  } catch {
    return fail('UNKNOWN', 'That is not a valid Solana address.');
  }
  const sent = await withWallet<Sent>(async (wallet, owner) => {
    const src = getAssociatedTokenAddressSync(mintPk, owner);
    const dst = getAssociatedTokenAddressSync(mintPk, dest, true);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(
      createAssociatedTokenAccountIdempotentInstruction(owner, dst, dest, mintPk),
      createTransferInstruction(src, dst, owner, 1),
    );
    const [signature] = await wallet.signAndSendTransactions({ transactions: [tx] });
    return { signature, blockhash, lastValidBlockHeight };
  });
  if (!sent.ok) return sent;
  const done = await confirm(sent.value);
  return done.ok ? { ok: true, value: { signature: done.value.signature } } : done;
}