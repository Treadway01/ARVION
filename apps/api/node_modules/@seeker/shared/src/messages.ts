import { AssetMeta, AuthorizationTerms, Base58 } from './types';
import { sha512b58, utf8 } from './crypto';

// Domain-separated, deterministic text. Wallets sign these exact bytes.
const P = 'authz-protocol/v1';

export function issueMessage(t: AuthorizationTerms): string {
  const lines = [
    `${P}:issue`,
    `id:${t.id}`,
    `issuer:${t.issuer}`,
    `subject:${t.subject}`,
    `resource:${t.resource.kind}:${t.resource.id}:${t.resource.name}`,
    `permissions:${[...t.permissions].sort().join(',')}`,
    `issuedAt:${t.issuedAt}`,
    `expiresAt:${t.expiresAt}`,
  ];
  if (t.price) lines.push(`price:${t.price.mint}:${t.price.amount}:${t.price.payTo}`);
  lines.push(`nonce:${t.nonce}`);
  return lines.join('\n');
}

export function approveMessage(
  t: AuthorizationTerms,
  issuerSignature: Base58,
  approvedAt: number,
): string {
  return [
    `${P}:approve`,
    `id:${t.id}`,
    `subject:${t.subject}`,
    `issuerSig:${issuerSignature}`,
    `approvedAt:${approvedAt}`,
  ].join('\n');
}

export function revokeMessage(t: AuthorizationTerms, revokedAt: number): string {
  return [`${P}:revoke`, `id:${t.id}`, `issuer:${t.issuer}`, `revokedAt:${revokedAt}`].join('\n');
}

export function presentMessage(args: {
  authorizationId: string;
  subject: Base58;
  resourceId: string;
  permission: string;
  challengeNonce: string;
  issuedAt: number;
}): string {
  return [
    `${P}:present`,
    `id:${args.authorizationId}`,
    `subject:${args.subject}`,
    `resource:${args.resourceId}`,
    `permission:${args.permission}`,
    `challenge:${args.challengeNonce}`,
    `issuedAt:${args.issuedAt}`,
  ].join('\n');
}
export function assetNameMessage(mint: string, name: string, labeledAt: number): string {
  return [`${P}:asset-name`, `mint:${mint}`, `name:${name}`, `labeledAt:${labeledAt}`].join('\n');
}

export function assetMetaHash(m: AssetMeta): string {
  const canon = [m.description, m.serial, m.manufacturer, m.model, m.reference]
    .map((v) => (v ?? '').trim())
    .join('\u001f');
  return sha512b58(utf8(canon));
}

export function assetDeclareMessage(a: {
  id: string; owner: Base58; name: string; category: string;
  metaHash: string; photoHash: string; mint: string | null; declaredAt: number;
}): string {
  return [
    `${P}:asset-declare`,
    `id:${a.id}`,
    `owner:${a.owner}`,
    `name:${a.name}`,
    `category:${a.category}`,
    `meta:${a.metaHash}`,
    `photo:${a.photoHash}`,
    `mint:${a.mint ?? 'none'}`,
    `declaredAt:${a.declaredAt}`,
  ].join('\n');
}

export function assetAnchorMessage(id: string, mint: string, anchoredAt: number): string {
  return [`${P}:asset-anchor`, `id:${id}`, `mint:${mint}`, `anchoredAt:${anchoredAt}`].join('\n');
}
export function denyMessage(t: AuthorizationTerms, deniedAt: number): string {
  return [`${P}:deny`, `id:${t.id}`, `subject:${t.subject}`, `deniedAt:${deniedAt}`].join('\n');
}
