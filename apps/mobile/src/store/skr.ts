import { create } from 'zustand';
import { getSkrInfo } from '../providers/payment/skr';

type State = { decimals?: number; load: () => Promise<void> };

export const useSkr = create<State>((set, get) => ({
  async load() {
    if (get().decimals !== undefined) return;
    const r = await getSkrInfo();
    if (r.ok) set({ decimals: r.value.decimals });
  },
}));