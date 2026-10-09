import { Result } from '../../core/status';

export type WalletSession = { address: string }; // base58

export interface WalletProvider {
  connect(): Promise<Result<WalletSession>>;
  /** Returns a base58 detached ed25519 signature over the UTF-8 message. */
  signMessage(message: string): Promise<Result<string>>;
  disconnect(): void;
}