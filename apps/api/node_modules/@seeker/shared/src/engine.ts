import { decodeKey, verifyDetached } from './crypto';
import { approveMessage, issueMessage, presentMessage, revokeMessage } from './messages';
import { AuthorizationTerms, Decision, DenyReason, Presentation, SignedAuthorization } from './types';

export const CLOCK_SKEW_MS = 2 * 60_000;
export const CHALLENGE_MAX_AGE_MS = 60_000;

const deny = (reason: DenyReason, detail: string): Decision => ({ granted: false, reason, detail });

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_PERM = /^[a-z0-9:_-]+$/;
const AMOUNT = /^[1-9][0-9]{0,18}$/;
const noBreaks = (s: string) => !/[\r\n]/.test(s);

export function validateTerms(t: AuthorizationTerms): string | null {
  if (t.version !== 1) return 'Unsupported version';
  if (!SAFE_ID.test(t.id) || !SAFE_ID.test(t.nonce)) return 'Bad id or nonce';
  if (!decodeKey(t.issuer) || !decodeKey(t.subject)) return 'Bad wallet address';
  if (!t.resource.id || !SAFE_ID.test(t.resource.id)) return 'Bad resource id';
  if (!t.resource.name || !noBreaks(t.resource.name)) return 'Bad resource name';
  if (t.permissions.length === 0 || !t.permissions.every((p) => SAFE_PERM.test(p)))
    return 'Bad permissions';
  if (!(t.expiresAt > t.issuedAt)) return 'Expiry must be after issue time';
  if (t.price) {
    if (!decodeKey(t.price.mint) || !decodeKey(t.price.payTo)) return 'Bad price address';
    if (!AMOUNT.test(t.price.amount)) return 'Bad price amount';
    if (t.issuer === t.subject) return 'Self access is free; remove the price';
  }
  return null;
}

/**
 * Checks everything about the credential itself (no presentation).
 * `auth.payment` is only ever set by the API after on-chain verification.
 */
export function evaluateCredential(auth: SignedAuthorization, now: number): Decision {
  const t = auth.terms;
  const bad = validateTerms(t);
  if (bad) return deny('INVALID_TERMS', bad);

  if (!verifyDetached(issueMessage(t), auth.issuerSignature, t.issuer))
    return deny('ISSUER_SIGNATURE_INVALID', 'Issuer signature does not match the terms.');

  const a = auth.subjectApproval;
  if (!a) return deny('NOT_APPROVED', 'The holder has not approved this authorization.');
  if (!verifyDetached(approveMessage(t, auth.issuerSignature, a.approvedAt), a.signature, t.subject))
    return deny('APPROVAL_SIGNATURE_INVALID', 'Approval was not signed by the named holder.');

  const r = auth.revocation;
  if (r && verifyDetached(revokeMessage(t, r.revokedAt), r.signature, t.issuer))
    return deny('REVOKED', 'The issuer revoked this authorization.');

  if (now < t.issuedAt - CLOCK_SKEW_MS) return deny('NOT_YET_VALID', 'Not valid yet.');
  if (now >= t.expiresAt) return deny('EXPIRED', 'This authorization has expired.');

  if (t.price && !auth.payment)
    return deny('PAYMENT_REQUIRED', 'Payment is required before this authorization is active.');

  return { granted: true };
}

/**
 * Full access decision. The controller must issue `expectedChallengeNonce`
 * fresh per attempt and discard it after one use (single-use is the
 * controller's job; this function checks match and freshness).
 */
export function evaluateAccess(input: {
  auth: SignedAuthorization;
  resourceId: string;
  permission: string;
  now: number;
  expectedChallengeNonce: string;
  presentation: Presentation;
}): Decision {
  const { auth, resourceId, permission, now, presentation } = input;
  const base = evaluateCredential(auth, now);
  if (!base.granted) return base;

  const t = auth.terms;
  if (t.resource.id !== resourceId)
    return deny('RESOURCE_MISMATCH', 'This authorization is for a different resource.');
  if (!t.permissions.includes(permission))
    return deny('PERMISSION_NOT_GRANTED', `Permission "${permission}" was not granted.`);

  if (presentation.challengeNonce !== input.expectedChallengeNonce)
    return deny('CHALLENGE_MISMATCH', 'Challenge does not match this attempt.');
  if (now - presentation.issuedAt > CHALLENGE_MAX_AGE_MS || presentation.issuedAt > now + CLOCK_SKEW_MS)
    return deny('CHALLENGE_EXPIRED', 'Challenge response is too old.');

  const msg = presentMessage({
    authorizationId: t.id,
    subject: t.subject,
    resourceId,
    permission,
    challengeNonce: presentation.challengeNonce,
    issuedAt: presentation.issuedAt,
  });
  if (!verifyDetached(msg, presentation.signature, t.subject))
    return deny('PRESENTATION_INVALID', 'Holder did not sign this access attempt.');

  return { granted: true };
}