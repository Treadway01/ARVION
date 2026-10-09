import { create } from 'zustand';
import { AppError } from '../core/status';
import { mwaWalletProvider } from '../providers/wallet/mwa';
import { api } from '../services/api';

type WalletState = {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  address?: string;
  error?: AppError;
  connect: () => Promise<void>;
  disconnect: () => void;
};

export const useWallet = create<WalletState>((set, get) => ({
  status: 'idle',
  async connect() {
    set({ status: 'connecting', error: undefined });
    const r = await mwaWalletProvider.connect();
    if (r.ok) {
      set({ status: 'connected', address: r.value.address });
      void api.reportEvent(r.value.address, 'WALLET_CONNECTED');
    } else {
      set({ status: 'error', error: r.error, address: undefined });
    }
  },
  disconnect() {
    const was = get().address;
    mwaWalletProvider.disconnect();
    set({ status: 'idle', address: undefined, error: undefined });
    if (was) void api.reportEvent(was, 'WALLET_DISCONNECTED');
  },
}));
