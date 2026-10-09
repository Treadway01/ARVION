import { TldParser } from '@onsol/tldparser';
import { Connection, PublicKey } from '@solana/web3.js';
import { env } from '../../config/env';
import { Result } from '../../core/status';

const TLD = 'skr';

const asSkr = (domain: unknown): string | null =>
  typeof domain === 'string' && domain.length > 0
    ? `${domain.replace(/\.skr$/i, '')}.skr`
    : null;

/** Returns the wallet's .skr name from AllDomains, or null if it has none. */
export async function findSkrName(wallet: string): Promise<Result<string | null>> {
  let owner: PublicKey;
  try {
    owner = new PublicKey(wallet.trim());
  } catch {
    return { ok: false, error: { code: 'UNKNOWN', message: 'That is not a valid Solana address.' } };
  }

  const parser = new TldParser(new Connection(env.sgtRpcUrl, 'confirmed'));
  try {
    try {
      const main = (await parser.getMainDomain(owner)) as unknown as { domain?: unknown; tld?: unknown };
      const tld = typeof main?.tld === 'string' ? main.tld.replace(/^\./, '').toLowerCase() : '';
      if (tld === TLD) {
        const name = asSkr(main.domain);
        if (name) return { ok: true, value: name };
      }
    } catch {
      // No main domain set; fall through.
    }

    const list = (await parser.getParsedAllUserDomainsFromTld(owner, TLD)) as unknown as { domain?: unknown }[];
    const first = list.map((d) => asSkr(d?.domain)).find((n): n is string => n !== null);
    return { ok: true, value: first ?? null };
  } catch {
    return {
      ok: false,
      error: { code: 'RPC_UNAVAILABLE', message: 'Could not look up the .skr name right now.' },
    };
  }
}
