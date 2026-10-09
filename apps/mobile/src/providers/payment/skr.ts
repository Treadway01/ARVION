import {
  createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction,
  getAssociatedTokenAddressSync, getMint,
} from '@solana/spl-token';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import type { AuthorizationTerms } from '@seeker/shared';
import { env } from '../../config/env';
import { AppError, Result } from '../../core/status';
import { formatAmount } from '../../utils/amount';
import { paymentChain, withWallet } from '../wallet/mwa';

type SkrInfo = { programId: PublicKey; decimals: number };

const fail = (code: AppError['code'], message: string): Result<never> => ({ ok: false, error: { code, message } });
const connection = () => new Connection(env.paymentRpcUrl, 'confirmed');

let cached: SkrInfo | undefined;

/** Reads the token program and decimals from the mint account itself; nothing is assumed. */
export async function getSkrInfo(): Promise<Result<SkrInfo>> {
  if (cached) return { ok: true, value: cached };
  try {
    const conn = connection();
    const mint = new PublicKey(env.skrMint);
    const acct = await conn.getAccountInfo(mint);
    if (!acct) return fail('UNKNOWN', 'The SKR mint was not found on this network.');
    const info = await getMint(conn, mint, 'confirmed', acct.owner);
    cached = { programId: acct.owner, decimals: info.decimals };
    return { ok: true, value: cached };
  } catch {
    return fail('RPC_UNAVAILABLE', 'Could not read the SKR token from Solana.');
  }
}

/** Sends a real SKR transfer from the holder to the issuer. Returns the transaction signature. */
export async function paySkr(terms: AuthorizationTerms): Promise<Result<{ signature: string }>> {
  const price = terms.price;
  if (!price) return fail('UNKNOWN', 'This authorization has no price.');
  if (price.mint !== env.skrMint) return fail('UNKNOWN', 'This price uses a different token than this app is set to.');

  const infoR = await getSkrInfo();
  if (!infoR.ok) return infoR;
  const { programId, decimals } = infoR.value;

  const conn = connection();
  const mint = new PublicKey(price.mint);
  const payer = new PublicKey(terms.subject);
  const payTo = new PublicKey(price.payTo);
  const amount = BigInt(price.amount);
  const src = getAssociatedTokenAddressSync(mint, payer, false, programId);

  try {
    const bal = await conn.getTokenAccountBalance(src);
    if (BigInt(bal.value.amount) < amount)
      return fail('TX_FAILED', `Not enough SKR. You need ${formatAmount(price.amount, decimals)} SKR.`);
  } catch (e) {
    const m = String(e).toLowerCase();
    if (m.includes('could not find') || m.includes('invalid param'))
      return fail('TX_FAILED', `This wallet holds no SKR. You need ${formatAmount(price.amount, decimals)} SKR.`);
    return fail('RPC_UNAVAILABLE', 'Could not check your SKR balance right now.');
  }

  const sent = await withWallet<string | null>(async (wallet, owner) => {
    if (owner.toBase58() !== terms.subject) return null;
    const dst = getAssociatedTokenAddressSync(mint, payTo, true, programId);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(
      createAssociatedTokenAccountIdempotentInstruction(owner, dst, payTo, mint, programId),
      createTransferCheckedInstruction(src, mint, dst, owner, amount, decimals, [], programId),
    );
    const [signature] = await wallet.signAndSendTransactions({ transactions: [tx] });
    return signature;
  }, paymentChain);

  if (!sent.ok) return sent;
  if (sent.value === null)
    return fail('UNAUTHORIZED', 'Switch your wallet to the holder account for this authorization.');
  return { ok: true, value: { signature: sent.value } };
}