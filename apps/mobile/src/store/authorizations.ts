import { create } from 'zustand';
import { approveMessage, denyMessage, presentMessage, revokeMessage } from '@seeker/shared';
import { AppError } from '../core/status';
import { mwaWalletProvider } from '../providers/wallet/mwa';
import { paySkr } from '../providers/payment/skr';
import { api, StoredAuthorization } from '../services/api';

type DoorResult = { authId: string; granted: boolean; text: string };
type PayState = {
  authId: string;
  step: 'approving' | 'paying' | 'verifying' | 'done' | 'error';
  text: string;
};

type State = {
  items: StoredAuthorization[];
  issued: StoredAuthorization[];
  loading: boolean;
  error?: AppError;
  doorResult?: DoorResult;
  payState?: PayState;
  paidSigs: Record<string, string>; // transaction signatures awaiting verification
  refresh: (address: string) => Promise<void>;
  refreshIssued: (address: string) => Promise<void>;
  approve: (a: StoredAuthorization, address: string) => Promise<void>;
  deny: (a: StoredAuthorization, address: string) => Promise<void>;
  pay: (a: StoredAuthorization, address: string) => Promise<void>;
  unlock: (a: StoredAuthorization, address: string) => Promise<void>;
  revoke: (a: StoredAuthorization, address: string) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
const rejected = (address: string, e: AppError) => {
  if (e.code === 'USER_REJECTED') void api.reportEvent(address, 'SIGNING_REJECTED', 'Wallet request was declined');
};

export const useAuthorizations = create<State>((set, get) => ({
  items: [],
  issued: [],
  loading: false,
  paidSigs: {},

  async refresh(address) {
    set({ loading: true, error: undefined });
    const r = await api.listForSubject(address);
    if (r.ok) set({ items: r.value, loading: false });
    else set({ loading: false, error: r.error });
  },

  async refreshIssued(address) {
    const r = await api.listForIssuer(address);
    if (r.ok) set({ issued: r.value });
    else set({ error: r.error });
  },

  async approve(a, address) {
    set({ error: undefined });
    const approvedAt = Date.now();
    const sig = await mwaWalletProvider.signMessage(approveMessage(a.terms, a.issuerSignature, approvedAt));
    if (!sig.ok) { rejected(address, sig.error); return set({ error: sig.error }); }
    const r = await api.approve(a.terms.id, approvedAt, sig.value);
    if (!r.ok) return set({ error: r.error });
    await Promise.all([get().refresh(address), get().refreshIssued(address)]);
  },

  async deny(a, address) {
    set({ error: undefined });
    const deniedAt = Date.now();
    const sig = await mwaWalletProvider.signMessage(denyMessage(a.terms, deniedAt));
    if (!sig.ok) { rejected(address, sig.error); return set({ error: sig.error }); }
    const r = await api.deny(a.terms.id, deniedAt, sig.value);
    if (!r.ok) return set({ error: r.error });
    await Promise.all([get().refresh(address), get().refreshIssued(address)]);
  },

  // Approve (if needed), send the real SKR transfer, then ask the API to verify it on-chain.
  async pay(a, address) {
    const id = a.terms.id;
    const say = (step: PayState['step'], text: string) => set({ payState: { authId: id, step, text } });
    if (!a.terms.price) return;
    set({ error: undefined });

    if (!a.subjectApproval) {
      say('approving', 'Approve the request in your wallet...');
      const approvedAt = Date.now();
      const sig = await mwaWalletProvider.signMessage(approveMessage(a.terms, a.issuerSignature, approvedAt));
      if (!sig.ok) { rejected(address, sig.error); return say('error', sig.error.message); }
      const r = await api.approve(id, approvedAt, sig.value);
      if (!r.ok) return say('error', r.error.message);
    }

    let signature = get().paidSigs[id];
    if (!signature) {
      say('paying', 'Confirm the SKR payment in your wallet...');
      const paid = await paySkr(a.terms);
      if (!paid.ok) {
        rejected(address, paid.error);
        await get().refresh(address);
        return say('error', paid.error.message);
      }
      signature = paid.value.signature;
      set({ paidSigs: { ...get().paidSigs, [id]: signature } });
    }

    say('verifying', 'Verifying the payment on-chain...');
    let verified = false;
    let lastMsg = '';
    for (let i = 0; i < 8; i++) {
      const r = await api.submitPayment(id, signature);
      if (r.ok) { verified = true; break; }
      lastMsg = r.error.message;
      if (lastMsg.includes('already paid')) { verified = true; break; }
      if (!lastMsg.includes('Retry shortly')) break;
      await wait(3000);
    }

    await Promise.all([get().refresh(address), get().refreshIssued(address)]);
    if (!verified)
      return say('error', `${lastMsg} Your payment was sent and is saved. Tap Retry verification.`);
    say('done', 'Payment confirmed. Authorization active.');
  },

  async revoke(a, address) {
    set({ error: undefined });
    const revokedAt = Date.now();
    const sig = await mwaWalletProvider.signMessage(revokeMessage(a.terms, revokedAt));
    if (!sig.ok) { rejected(address, sig.error); return set({ error: sig.error }); }
    const r = await api.revoke(a.terms.id, revokedAt, sig.value);
    if (!r.ok) return set({ error: r.error });
    await Promise.all([get().refresh(address), get().refreshIssued(address)]);
  },

  async unlock(a, address) {
    set({ error: undefined, doorResult: undefined });
    const resourceId = a.terms.resource.id;
    const permission = a.terms.permissions[0];
    const ch = await api.challenge(a.terms.id, resourceId, permission);
    if (!ch.ok) return set({ error: ch.error });

    // Built locally; never sign text supplied by the server.
    const msg = presentMessage({
      authorizationId: a.terms.id, subject: a.terms.subject, resourceId, permission,
      challengeNonce: ch.value.challengeNonce, issuedAt: ch.value.issuedAt,
    });
    const sig = await mwaWalletProvider.signMessage(msg);
    if (!sig.ok) { rejected(address, sig.error); return set({ error: sig.error }); }

    const v = await api.verifyAccess({
      authorizationId: a.terms.id, resourceId, permission,
      presentation: {
        challengeNonce: ch.value.challengeNonce, issuedAt: ch.value.issuedAt, signature: sig.value,
      },
    });
    set({
      doorResult: v.ok
        ? { authId: a.terms.id, granted: true, text: 'Authorization verified by the engine.' }
        : { authId: a.terms.id, granted: false, text: v.error.message },
    });
    await Promise.all([get().refresh(address), get().refreshIssued(address)]);
  },
}));
