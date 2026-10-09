import {
  TOKEN_2022_PROGRAM_ID, getMetadataPointerState, getMint, getTokenGroupMemberState,
} from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import { env } from '../../config/env';
import { Result } from '../../core/status';

// Metadata address and group address are the same by design.
const SGT_ADDRESS = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
const MAX_MINTS = 50;

/** Returns the SGT mint address if the wallet currently holds one, otherwise null. */
export async function findSgtMint(wallet: string): Promise<Result<string | null>> {
  let owner: PublicKey;
  try {
    owner = new PublicKey(wallet.trim());
  } catch {
    return { ok: false, error: { code: 'UNKNOWN', message: 'That is not a valid Solana address.' } };
  }

  const conn = new Connection(env.sgtRpcUrl, 'confirmed');
  try {
    const res = await conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID });
    // Skip zero balances: a transferred-out SGT leaves an empty account behind.
    const mints = res.value
      .map((v) => v.account.data.parsed?.info)
      .filter((i) => i?.mint && i.tokenAmount?.amount !== '0')
      .map((i) => i.mint as string)
      .slice(0, MAX_MINTS);

    for (const m of mints) {
      try {
        const mint = await getMint(conn, new PublicKey(m), 'confirmed', TOKEN_2022_PROGRAM_ID);
        const pointer = getMetadataPointerState(mint);
        const member = getTokenGroupMemberState(mint);
        if (
        pointer?.metadataAddress?.toBase58() === SGT_ADDRESS &&
        member?.group?.toBase58() === SGT_ADDRESS
        ) {
        return { ok: true, value: m };
        }
      } catch {
        // Not a readable mint; skip it.
      }
    }
    return { ok: true, value: null };
  } catch {
    return {
      ok: false,
      error: { code: 'RPC_UNAVAILABLE', message: 'Could not check Seeker verification right now.' },
    };
  }
}