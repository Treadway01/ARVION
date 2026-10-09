import { create } from 'zustand';
import { findSgtMint } from '../providers/identity/sgt';
import { findSkrName } from '../providers/identity/skr';
import { api } from '../services/api';

type Check = { state: 'idle' | 'checking' | 'found' | 'none' | 'error'; value?: string };

type State = {
  address?: string;
  sgt: Check;
  skr: Check;
  load: (address: string) => Promise<void>;
};

const reportedFailure = new Set<string>();

export const useIdentity = create<State>((set, get) => ({
  sgt: { state: 'idle' },
  skr: { state: 'idle' },
  async load(address) {
    const s = get();
    const settled = s.sgt.state === 'found' || s.sgt.state === 'none';
    if (s.address === address && settled) return;
    set({ address, sgt: { state: 'checking' }, skr: { state: 'checking' } });
    const [sgt, skr] = await Promise.all([findSgtMint(address), findSkrName(address)]);
    if (get().address !== address) return;
    set({
      sgt: !sgt.ok ? { state: 'error' } : sgt.value ? { state: 'found', value: sgt.value } : { state: 'none' },
      skr: !skr.ok ? { state: 'error' } : skr.value ? { state: 'found', value: skr.value } : { state: 'none' },
    });
    if (sgt.ok && sgt.value) void api.reportEvent(address, 'IDENTITY_VERIFIED', 'Seeker Genesis Token found');
    if (!sgt.ok && !reportedFailure.has(address)) {
      reportedFailure.add(address);
      void api.reportEvent(address, 'IDENTITY_CHECK_FAILED', 'Seeker check unavailable');
    }
  },
}));
