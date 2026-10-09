async function rpc(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json()) as { result?: unknown; error?: unknown };
  if (j.error || j.result === undefined) throw new Error('rpc');
  return j.result;
}

// Reads the current holder of a 1-of-1 token straight from the chain.
export function makeHolderOf(rpcUrl: string) {
  return async (mint: string): Promise<string | null> => {
    const largest = (await rpc(rpcUrl, 'getTokenLargestAccounts', [mint])) as {
      value: { address: string; amount: string }[];
    };
    const top = largest.value.find((v) => v.amount === '1');
    if (!top) return null;
    const info = (await rpc(rpcUrl, 'getAccountInfo', [top.address, { encoding: 'jsonParsed' }])) as {
      value: { data: { parsed?: { info?: { owner?: string } } } } | null;
    };
    return info.value?.data?.parsed?.info?.owner ?? null;
  };
}

export type TokenDelta = { owner: string; mint: string; change: bigint };
export type PaymentTx = { failed: boolean; blockTimeMs: number | null; deltas: TokenDelta[] };

type Bal = { mint: string; owner?: string; uiTokenAmount: { amount: string } };
type RpcTx = {
  blockTime: number | null;
  meta: { err: unknown; preTokenBalances?: Bal[]; postTokenBalances?: Bal[] } | null;
} | null;

// Reads a confirmed transaction and reduces it to net token balance changes per owner.
export function makePaymentTx(rpcUrl: string) {
  return async (signature: string): Promise<PaymentTx | null> => {
    const tx = (await rpc(rpcUrl, 'getTransaction', [
      signature,
      { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ])) as RpcTx;
    if (!tx) return null;
    if (!tx.meta) return { failed: true, blockTimeMs: null, deltas: [] };

    const totals = new Map<string, bigint>();
    const add = (list: Bal[] | undefined, sign: bigint) => {
      for (const b of list ?? []) {
        if (!b.owner) continue;
        const key = `${b.owner}|${b.mint}`;
        totals.set(key, (totals.get(key) ?? 0n) + sign * BigInt(b.uiTokenAmount.amount));
      }
    };
    add(tx.meta.preTokenBalances, -1n);
    add(tx.meta.postTokenBalances, 1n);

    const deltas: TokenDelta[] = [...totals.entries()].map(([key, change]) => {
      const [owner, mint] = key.split('|');
      return { owner, mint, change };
    });
    return {
      failed: tx.meta.err !== null,
      blockTimeMs: tx.blockTime ? tx.blockTime * 1000 : null,
      deltas,
    };
  };
}