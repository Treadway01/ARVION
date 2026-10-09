import { Connection } from '@solana/web3.js';
import { env } from '../config/env';

export function getConnection(): Connection | null {
  return env.solanaRpcUrl ? new Connection(env.solanaRpcUrl, 'confirmed') : null;
}

export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=${env.solanaCluster === 'mainnet-beta' ? 'mainnet-beta' : 'devnet'}`;
