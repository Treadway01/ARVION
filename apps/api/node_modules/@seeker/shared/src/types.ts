export type Base58 = string;

export type Resource = {
  id: string;
  name: string;
  kind: 'building' | 'door' | 'membership' | 'asset' | 'other';
};

// Optional economic requirement. amount is in the token's base units.
export type Price = { mint: Base58; amount: string; payTo: Base58 };

export type AuthorizationTerms = {
  version: 1;
  id: string;
  issuer: Base58;
  subject: Base58;
  resource: Resource;
  permissions: string[];
  issuedAt: number; // ms
  expiresAt: number; // ms
  nonce: string;
  price?: Price;
};

export type SignedAuthorization = {
  terms: AuthorizationTerms;
  issuerSignature: Base58;
  subjectApproval?: { signature: Base58; approvedAt: number };
  revocation?: { signature: Base58; revokedAt: number };
  denial?: { signature: Base58; deniedAt: number };
  // Recorded by the API only after it verified the payment on-chain.
  payment?: { signature: string; verifiedAt: number };
};

export type Presentation = {
  challengeNonce: string;
  issuedAt: number;
  signature: Base58;
};

export type DenyReason =
  | 'INVALID_TERMS'
  | 'ISSUER_SIGNATURE_INVALID'
  | 'NOT_APPROVED'
  | 'APPROVAL_SIGNATURE_INVALID'
  | 'REVOKED'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'PAYMENT_REQUIRED'
  | 'RESOURCE_MISMATCH'
  | 'PERMISSION_NOT_GRANTED'
  | 'PRESENTATION_INVALID'
  | 'CHALLENGE_MISMATCH'
  | 'CHALLENGE_EXPIRED';

export type Decision =
  | { granted: true }
  | { granted: false; reason: DenyReason; detail: string };

  export const ASSET_CATEGORIES = [
  'equipment', 'vehicle', 'device', 'collectible', 'membership', 'certificate', 'artwork', 'ticket', 'other',
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type AssetMeta = {
  description?: string; serial?: string; manufacturer?: string; model?: string; reference?: string;
};