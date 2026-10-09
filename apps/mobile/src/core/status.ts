export type IntegrationStatus =
  | 'LIVE'
  | 'CONNECTED'
  | 'VERIFIED'
  | 'SIMULATION'
  | 'NOT_CONNECTED'
  | 'NOT_DEPLOYED'
  | 'UNAVAILABLE'
  | 'CONFIGURATION_REQUIRED';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export type AppError = {
  code:
    | 'WALLET_UNAVAILABLE' | 'USER_REJECTED' | 'NETWORK_UNAVAILABLE'
    | 'RPC_UNAVAILABLE' | 'UNSUPPORTED_DEVICE' | 'NOT_CONFIGURED'
    | 'TX_FAILED' | 'TIMEOUT' | 'UNAUTHORIZED' | 'UNKNOWN';
  message: string; // user-safe, never a stack trace
};