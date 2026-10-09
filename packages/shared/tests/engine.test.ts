import { describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {
  AuthorizationTerms, SignedAuthorization, approveMessage, evaluateAccess,
  evaluateCredential, issueMessage, presentMessage, revokeMessage,
  utf8, walletOutputToSignature, validateTerms,
} from '../src';

// Test-only wallets. Never import this file from app code.
function wallet() {
  const kp = nacl.sign.keyPair();
  return {
    pub: bs58.encode(kp.publicKey),
    sign: (m: string) => bs58.encode(nacl.sign.detached(utf8(m), kp.secretKey)),
    raw: (m: string) => nacl.sign.detached(utf8(m), kp.secretKey),
  };
}

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function setup(over: Partial<AuthorizationTerms> = {}) {
  const issuer = wallet();
  const holder = wallet();
  const terms: AuthorizationTerms = {
    version: 1, id: 'auth_1', issuer: issuer.pub, subject: holder.pub,
    resource: { id: 'door-001', name: 'Demo Door', kind: 'door' },
    permissions: ['entry'], issuedAt: NOW, expiresAt: NOW + 30 * DAY, nonce: 'n1',
    ...over,
  };
  const issuerSignature = issuer.sign(issueMessage(terms));
  const approvedAt = NOW + 1000;
  const auth: SignedAuthorization = {
    terms, issuerSignature,
    subjectApproval: { signature: holder.sign(approveMessage(terms, issuerSignature, approvedAt)), approvedAt },
  };
  return { issuer, holder, auth };
}

function present(holder: ReturnType<typeof wallet>, auth: SignedAuthorization, nonce: string, at: number) {
  const msg = presentMessage({
    authorizationId: auth.terms.id, subject: auth.terms.subject,
    resourceId: auth.terms.resource.id, permission: 'entry',
    challengeNonce: nonce, issuedAt: at,
  });
  return { challengeNonce: nonce, issuedAt: at, signature: holder.sign(msg) };
}

const access = (s: ReturnType<typeof setup>, over: object = {}) =>
  evaluateAccess({
    auth: s.auth, resourceId: 'door-001', permission: 'entry', now: NOW + 5000,
    expectedChallengeNonce: 'c1', presentation: present(s.holder, s.auth, 'c1', NOW + 4000),
    ...over,
  });

  function setupPaid() {
  const issuer = wallet(), holder = wallet(), mint = wallet();
  const terms: AuthorizationTerms = {
    version: 1, id: 'auth_p', issuer: issuer.pub, subject: holder.pub,
    resource: { id: 'door-001', name: 'Demo Door', kind: 'door' },
    permissions: ['entry'], issuedAt: NOW, expiresAt: NOW + DAY, nonce: 'n2',
    price: { mint: mint.pub, amount: '10000000', payTo: issuer.pub },
  };
  const issuerSignature = issuer.sign(issueMessage(terms));
  const approvedAt = NOW + 1000;
  const auth: SignedAuthorization = {
    terms, issuerSignature,
    subjectApproval: { signature: holder.sign(approveMessage(terms, issuerSignature, approvedAt)), approvedAt },
  };
  return { issuer, holder, auth };
}

describe('authorization engine', () => {
it('grants a valid, approved, fresh request', () => {
  expect(access(setup())).toEqual({ granted: true });
});

it('denies a priced authorization until a payment is recorded', () => {
  const s = setupPaid();

  expect(
    evaluateCredential(s.auth, NOW + 5000)
  ).toMatchObject({ reason: 'PAYMENT_REQUIRED' });

  s.auth.payment = {
    signature: 'sig',
    verifiedAt: NOW + 2000
  };

  expect(
    evaluateCredential(s.auth, NOW + 5000)
  ).toEqual({ granted: true });
});

  it('rejects a price changed after signing', () => {
    const s = setupPaid();
    s.auth.payment = { signature: 'sig', verifiedAt: NOW + 2000 };
    s.auth.terms.price = { ...s.auth.terms.price!, amount: '1' };
    expect(evaluateCredential(s.auth, NOW + 5000)).toMatchObject({ reason: 'ISSUER_SIGNATURE_INVALID' });
  });

  it('refuses a price on self access and a bad amount', () => {
    const s = setupPaid();
    expect(validateTerms({ ...s.auth.terms, subject: s.auth.terms.issuer })).toBe('Self access is free; remove the price');
    expect(validateTerms({ ...s.auth.terms, price: { ...s.auth.terms.price!, amount: '0' } })).toBe('Bad price amount');
  });
  });

  it('rejects tampered terms (permission escalation)', () => {
    const s = setup();
    s.auth.terms.permissions = ['entry', 'admin'];
    const d = evaluateCredential(s.auth, NOW + 5000);
    expect(d).toMatchObject({ granted: false, reason: 'ISSUER_SIGNATURE_INVALID' });
  });

  it('rejects approval signed by someone other than the holder', () => {
    const s = setup();
    const other = wallet();
    s.auth.subjectApproval = {
      approvedAt: NOW,
      signature: other.sign(approveMessage(s.auth.terms, s.auth.issuerSignature, NOW)),
    };
    expect(evaluateCredential(s.auth, NOW + 5000)).toMatchObject({ reason: 'APPROVAL_SIGNATURE_INVALID' });
  });

  it('denies when not approved', () => {
    const s = setup();
    delete s.auth.subjectApproval;
    expect(evaluateCredential(s.auth, NOW + 5000)).toMatchObject({ reason: 'NOT_APPROVED' });
  });

  it('denies when expired', () => {
    const s = setup();
    expect(access(s, { now: NOW + 31 * DAY })).toMatchObject({ reason: 'EXPIRED' });
  });

  it('denies when revoked by the issuer, ignores a forged revocation', () => {
    const s = setup();
    const forger = wallet();
    s.auth.revocation = { revokedAt: NOW + 10, signature: forger.sign(revokeMessage(s.auth.terms, NOW + 10)) };
    expect(access(s)).toEqual({ granted: true });
    s.auth.revocation = { revokedAt: NOW + 10, signature: s.issuer.sign(revokeMessage(s.auth.terms, NOW + 10)) };
    expect(access(s)).toMatchObject({ reason: 'REVOKED' });
  });

  it('denies wrong resource and ungranted permission', () => {
    const s = setup();
    expect(access(s, { resourceId: 'door-002' })).toMatchObject({ reason: 'RESOURCE_MISMATCH' });
    expect(access(s, { permission: 'admin' })).toMatchObject({ reason: 'PERMISSION_NOT_GRANTED' });
  });

  it('blocks replay: wrong or stale challenge, or another wallet signing', () => {
    const s = setup();
    expect(access(s, { expectedChallengeNonce: 'c2' })).toMatchObject({ reason: 'CHALLENGE_MISMATCH' });
    expect(access(s, { now: NOW + 5 * 60_000 })).toMatchObject({ reason: 'CHALLENGE_EXPIRED' });
    const thief = wallet();
    expect(access(s, { presentation: present(thief, s.auth, 'c1', NOW + 4000) }))
      .toMatchObject({ reason: 'PRESENTATION_INVALID' });
  });

  it('accepts both wallet output formats', () => {
    const w = wallet();
    const m = 'hello';
    const sig = w.raw(m);
    const appended = new Uint8Array([...utf8(m), ...sig]);
    expect(walletOutputToSignature(sig, m)).toBe(bs58.encode(sig));
    expect(walletOutputToSignature(appended, m)).toBe(bs58.encode(sig));
    expect(walletOutputToSignature(new Uint8Array(10), m)).toBeNull();
  });
