import { transact, Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { utf8, walletOutputToSignature } from '@seeker/shared';
import { brand } from '../../config/brand';
import { env } from '../../config/env';
import { AppError, Result } from '../../core/status';
import { WalletProvider, WalletSession } from './WalletProvider';

export type ChainId = 'solana:mainnet' | 'solana:devnet';

const identity = { name: brand.appName, uri: brand.identityUri };
const defaultChain: ChainId = env.solanaCluster === 'mainnet-beta' ? 'solana:mainnet' : 'solana:devnet';
export const paymentChain: ChainId = env.paymentCluster === 'devnet' ? 'solana:devnet' : 'solana:mainnet';

// Kept in memory only. Never persisted, never logged.
const authTokens: Partial<Record<ChainId, string>> = {};
let connected: string | undefined; // base58

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: AppError['code'], message: string): Result<never> => ({
  ok: false,
  error: { code, message },
});

function mapError(e: unknown): Result<never> {
  const text = `${(e as { code?: string })?.code ?? ''} ${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? ''}`.toLowerCase();
  if (text.includes('network request failed') || text.includes('failed to fetch') || text.includes('fetch failed') || text.includes('econn'))
    return fail('NETWORK_UNAVAILABLE', "No internet connection to Solana. Check the phone's data or Wi-Fi.");
  if (text.includes('not_found') || text.includes('not found') || text.includes('no wallet'))
    return fail('WALLET_UNAVAILABLE', 'No compatible wallet app was found on this device.');
  if (text.includes('declin') || text.includes('cancel') || text.includes('not_signed') || text.includes('authorization_failed'))
    return fail('USER_REJECTED', 'The request was declined in your wallet.');
  if (text.includes('timeout') || text.includes('timed out'))
    return fail('TIMEOUT', 'The wallet took too long to respond.');
  return fail('UNKNOWN', 'The wallet request could not be completed.');
}

const toBase58 = (b64: string) => new PublicKey(Buffer.from(b64, 'base64')).toBase58();

async function session<T>(
  fn: (wallet: Web3MobileWallet, addressB64: string) => Promise<T>,
  chainId: ChainId = defaultChain,
): Promise<{ address: string; value: T }> {
  return transact(async (wallet) => {
    let result;
    const token = authTokens[chainId];
    if (token) {
      try {
        result = await wallet.reauthorize({ auth_token: token, identity });
      } catch {
        result = undefined;
      }
    }
    if (!result) result = await wallet.authorize({ chain: chainId, identity });
    authTokens[chainId] = result.auth_token;
    const account = result.accounts[0];
    return { address: toBase58(account.address), value: await fn(wallet, account.address) };
  });
}

export const mwaWalletProvider: WalletProvider = {
  async connect(): Promise<Result<WalletSession>> {
    try {
      const { address } = await session(async () => null);
      connected = address;
      return ok({ address });
    } catch (e) {
      return mapError(e);
    }
  },

  async signMessage(message: string): Promise<Result<string>> {
    try {
      const payload = utf8(message);
      const { address, value } = await session(async (wallet, addressB64) => {
        const out = await wallet.signMessages({ addresses: [addressB64], payloads: [payload] });
        return out[0];
      });
      if (connected && address !== connected)
        return fail('UNAUTHORIZED', 'The wallet account changed. Reconnect and try again.');
      const sig = walletOutputToSignature(value, message);
      if (!sig) return fail('UNKNOWN', 'The wallet returned an unexpected signature format.');
      return ok(sig);
    } catch (e) {
      return mapError(e);
    }
  },

  disconnect() {
    delete authTokens['solana:mainnet'];
    delete authTokens['solana:devnet'];
    connected = undefined;
  },
};

export async function withWallet<T>(
  fn: (wallet: Web3MobileWallet, address: PublicKey) => Promise<T>,
  chainId: ChainId = defaultChain,
): Promise<Result<T>> {
  try {
    const { address, value } = await session(
      async (wallet, addressB64) => fn(wallet, new PublicKey(Buffer.from(addressB64, 'base64'))),
      chainId,
    );
    if (connected && address !== connected)
      return fail('UNAUTHORIZED', 'The wallet account changed. Reconnect and try again.');
    return ok(value);
  } catch (e) {
    return mapError(e);
  }
}