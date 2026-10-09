export const ACTIVITY_LABEL: Record<string, string> = {
  WALLET_CONNECTED: 'Wallet connected',
  WALLET_DISCONNECTED: 'Wallet disconnected',
  SIGNING_REJECTED: 'Wallet request rejected',
  IDENTITY_VERIFIED: 'Seeker identity verified',
  IDENTITY_CHECK_FAILED: 'Identity check unavailable',
  AUTHORIZATION_ISSUED: 'Authorization requested',
  AUTHORIZATION_APPROVED: 'Authorization approved',
  AUTHORIZATION_DENIED: 'Request denied',
  AUTHORIZATION_REVOKED: 'Authorization revoked',
  AUTHORIZATION_ACTIVATED: 'Authorization activated',
  ACCESS_GRANTED: 'Access granted (simulation)',
  ACCESS_DENIED: 'Access denied (simulation)',
  PAYMENT_PENDING: 'Payment required',
  PAYMENT_SUBMITTED: 'SKR payment submitted',
  PAYMENT_VERIFIED: 'SKR payment verified',
  PAYMENT_FAILED: 'SKR payment failed',
  ASSET_CREATED: 'Asset created',
  ASSET_ANCHORED: 'Anchored on Solana',
  ASSET_TRANSFERRED: 'Ownership transferred',
};

export const labelFor = (type: string) => ACTIVITY_LABEL[type] ?? type;

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'purple' | 'cyan';
const TONES: Record<string, Tone> = {
  ACCESS_GRANTED: 'ok', PAYMENT_VERIFIED: 'ok', AUTHORIZATION_ACTIVATED: 'ok', IDENTITY_VERIFIED: 'ok',
  WALLET_CONNECTED: 'ok', ACCESS_DENIED: 'danger', PAYMENT_FAILED: 'danger', AUTHORIZATION_DENIED: 'danger',
  SIGNING_REJECTED: 'warn', IDENTITY_CHECK_FAILED: 'warn', AUTHORIZATION_REVOKED: 'warn', WALLET_DISCONNECTED: 'neutral',
};
export const toneOf = (type: string): Tone => TONES[type] ?? 'purple';
export const resultOf = (type: string): string => {
  const t = toneOf(type);
  return t === 'ok' ? 'Successful' : t === 'danger' ? 'Denied or failed' : t === 'warn' ? 'Needs attention' : 'Recorded';
};

export const SECURITY_TYPES = [
  'ACCESS_DENIED', 'PAYMENT_FAILED', 'AUTHORIZATION_REVOKED', 'AUTHORIZATION_DENIED',
  'SIGNING_REJECTED', 'IDENTITY_CHECK_FAILED', 'WALLET_DISCONNECTED',
];

export type Category = 'Identity' | 'Authorization' | 'Access' | 'Assets' | 'Payments' | 'Security';
export function categoryOf(type: string): Category {
  if (type.startsWith('WALLET_') || type.startsWith('IDENTITY_')) return 'Identity';
  if (type.startsWith('AUTHORIZATION_')) return 'Authorization';
  if (type.startsWith('ACCESS_')) return 'Access';
  if (type.startsWith('ASSET_')) return 'Assets';
  if (type.startsWith('PAYMENT_')) return 'Payments';
  return 'Security';
}

export function dayGroup(ms: number, now = Date.now()): 'Today' | 'Yesterday' | 'Earlier' {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  if (ms >= t0) return 'Today';
  if (ms >= t0 - 86_400_000) return 'Yesterday';
  return 'Earlier';
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
