import type { AssetMeta, SignedAuthorization, AuthorizationTerms } from '@seeker/shared';
import { env } from '../config/env';
import { Result } from '../core/status';

export type AuthStatus =
  | 'PENDING_APPROVAL' | 'PENDING_PAYMENT' | 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NOT_YET_VALID' | 'INVALID' | 'DENIED';
export type StoredAuthorization = SignedAuthorization & { status: AuthStatus };

export type ActivityRow = {
  id: number;
  at: number;
  type: string;
  authorization_id: string | null;
  issuer: string | null;
  subject: string | null;
  resource_id: string | null;
  detail: string | null;
};

export type Ownership = 'USER_DECLARED' | 'ON_CHAIN_VERIFIED' | 'TRANSFERRED' | 'UNKNOWN';
export type AssetView = {
  id: string; owner: string; name: string; category: string; meta: AssetMeta;
  photoHash: string; declaredAt: number; signature: string; mint: string | null;
  createdAt: number; ownership: Ownership; holder: string | null;
};
export type AssetDetail = { asset: AssetView; history: ActivityRow[]; authorizations: StoredAuthorization[] };

export const assetPhotoUrl = (id: string) => `${env.apiBaseUrl}/asset-records/${id}/photo`;

async function call<T>(path: string, body?: unknown): Promise<Result<T>> {
  if (!env.apiBaseUrl)
    return { ok: false, error: { code: 'NOT_CONFIGURED', message: 'API URL is not configured.' } };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 75_000);
  try {
    const res = await fetch(env.apiBaseUrl + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok)
      return {
        ok: false,
        error: { code: 'UNKNOWN', message: data?.message ?? data?.detail ?? 'The request was rejected.' },
      };
    return { ok: true, value: data as T };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    return {
      ok: false,
      error: aborted
        ? { code: 'TIMEOUT', message: 'The server took too long to respond.' }
        : { code: 'NETWORK_UNAVAILABLE', message: 'Cannot reach the server.' },
    };
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  listForSubject: (a: string) => call<StoredAuthorization[]>(`/authorizations?subject=${a}`),
  listForIssuer: (a: string) => call<StoredAuthorization[]>(`/authorizations?issuer=${a}`),
  issue: (terms: AuthorizationTerms, issuerSignature: string) =>
    call<{ id: string }>('/authorizations', { terms, issuerSignature }),
  approve: (id: string, approvedAt: number, signature: string) =>
    call<{ id: string }>(`/authorizations/${id}/approve`, { approvedAt, signature }),
  submitPayment: (id: string, signature: string) =>
    call<{ id: string; status: string }>(`/authorizations/${id}/payment`, { signature }),
  revoke: (id: string, revokedAt: number, signature: string) =>
    call<{ id: string }>(`/authorizations/${id}/revoke`, { revokedAt, signature }),
  challenge: (authorizationId: string, resourceId: string, permission: string) =>
    call<{ challengeNonce: string; issuedAt: number }>('/access/challenge', {
      authorizationId, resourceId, permission,
    }),
  verifyAccess: (body: unknown) => call<{ granted: boolean }>('/access/verify', body),
  getAuthorization: (id: string) => call<StoredAuthorization>(`/authorizations/${id}`),
  deny: (id: string, deniedAt: number, signature: string) =>
    call<{ id: string }>(`/authorizations/${id}/deny`, { deniedAt, signature }),
  reportEvent: (wallet: string, type: string, detail?: string) =>
    call<{ ok: boolean }>('/events', { wallet, type, detail }),
  health: () => call<{ ok: boolean }>('/health'),
  activity: (wallet: string) => call<ActivityRow[]>(`/activity?wallet=${wallet}`),
  labelAsset: (b: { mint: string; name: string; labeledBy: string; labeledAt: number; signature: string }) =>
    call<{ mint: string; name: string }>('/assets', b),
  assetNames: (mints: string[]) => call<{ mint: string; name: string }[]>(`/assets?mints=${mints.join(',')}`),
  createAssetRecord: (body: unknown) => call<{ id: string }>('/asset-records', body),
  listAssetRecords: (owner: string) => call<AssetView[]>(`/asset-records?owner=${owner}`),
  getAssetDetail: (id: string) => call<AssetDetail>(`/asset-records/${id}`),
  anchorAsset: (id: string, b: { mint: string; anchoredAt: number; signature: string }) =>
    call<{ id: string; mint: string }>(`/asset-records/${id}/anchor`, b),
  syncAsset: (id: string) => call<{ owner: string; changed: boolean }>(`/asset-records/${id}/sync`, {}),
};

