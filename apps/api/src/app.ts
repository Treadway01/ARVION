import Fastify, { FastifyReply } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import {
  AuthorizationTerms, AssetMeta, SignedAuthorization, CLOCK_SKEW_MS, ASSET_CATEGORIES,
  evaluateAccess, evaluateCredential, validateTerms, verifyDetached, decodeKey, sha512b58,
  issueMessage, approveMessage, revokeMessage, denyMessage, presentMessage, assetNameMessage,
  assetDeclareMessage, assetAnchorMessage, assetMetaHash, newNonce, 
} from '@seeker/shared';
import type { PaymentTx } from './solana';

// Official SKR mint, listed on solanamobile.com/skr. Override with SKR_MINT (e.g. a devnet test token).
export const DEFAULT_SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';

type Row = {
  id: string; issuer: string; subject: string; resource_id: string;
  terms_json: string; issuer_signature: string;
  approval_json: string | null; revocation_json: string | null;
  payment_json: string | null; denial_json: string | null; created_at: number;
};
type ChallengeRow = {
  nonce: string; authorization_id: string; resource_id: string;
  permission: string; issued_at: number; used: number;
};
type Status =
  | 'PENDING_APPROVAL' | 'PENDING_PAYMENT' | 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NOT_YET_VALID' | 'INVALID' | 'DENIED';

const KINDS = ['building', 'door', 'membership', 'asset', 'other'];
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length < 500;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

// Rebuilds the object so stored terms are exactly the fields that were signed.
function parseTerms(x: unknown): AuthorizationTerms | null {
  if (!isObj(x) || x.version !== 1) return null;
  const r = x.resource;
  if (!isObj(r) || !isStr(r.id) || !isStr(r.name) || !isStr(r.kind) || !KINDS.includes(r.kind)) return null;
  if (!Array.isArray(x.permissions) || x.permissions.length > 20 || !x.permissions.every(isStr)) return null;
  if (!isStr(x.id) || !isStr(x.issuer) || !isStr(x.subject) || !isStr(x.nonce)) return null;
  if (!isNum(x.issuedAt) || !isNum(x.expiresAt)) return null;
  const terms: AuthorizationTerms = {
    version: 1, id: x.id, issuer: x.issuer, subject: x.subject,
    resource: { id: r.id, name: r.name, kind: r.kind as AuthorizationTerms['resource']['kind'] },
    permissions: x.permissions as string[], issuedAt: x.issuedAt, expiresAt: x.expiresAt, nonce: x.nonce,
  };
  if (x.price !== undefined) {
    const p = x.price;
    if (!isObj(p) || !isStr(p.mint) || !isStr(p.amount) || !isStr(p.payTo)) return null;
    terms.price = { mint: p.mint, amount: p.amount, payTo: p.payTo };
  }
  return terms;
}

function toSigned(r: Row): SignedAuthorization {
  return {
    terms: JSON.parse(r.terms_json),
    issuerSignature: r.issuer_signature,
    subjectApproval: r.approval_json ? JSON.parse(r.approval_json) : undefined,
    revocation: r.revocation_json ? JSON.parse(r.revocation_json) : undefined,
    payment: r.payment_json ? JSON.parse(r.payment_json) : undefined,
    denial: r.denial_json ? JSON.parse(r.denial_json) : undefined,
  };
}

function statusOf(a: SignedAuthorization, now: number): Status {
  if (a.denial) return 'DENIED';
  const d = evaluateCredential(a, now);
  if (d.granted) return 'ACTIVE';
  switch (d.reason) {
    case 'NOT_APPROVED': return now >= a.terms.expiresAt ? 'EXPIRED' : 'PENDING_APPROVAL';
    case 'PAYMENT_REQUIRED': return 'PENDING_PAYMENT';
    case 'EXPIRED': return 'EXPIRED';
    case 'REVOKED': return 'REVOKED';
    case 'NOT_YET_VALID': return 'NOT_YET_VALID';
    default: return 'INVALID';
  }
}

// Decides from the real on-chain transaction whether the required payment happened.
function checkPayment(tx: PaymentTx, t: AuthorizationTerms): { code: string; message: string } | null {
  const price = t.price!;
  if (tx.failed) return { code: 'TX_FAILED', message: 'The payment transaction failed on-chain.' };
  const amount = BigInt(price.amount);
  const forMint = tx.deltas.filter((d) => d.mint === price.mint);
  if (forMint.length === 0)
    return { code: 'WRONG_TOKEN', message: 'The transaction did not move the required token.' };
  const net = (owner: string) => forMint.filter((d) => d.owner === owner).reduce((s, d) => s + d.change, 0n);
  const received = net(price.payTo);
  const spent = -net(t.subject);
  if (received < amount) {
    if (spent >= amount) return { code: 'WRONG_RECIPIENT', message: 'The payment did not reach the owner.' };
    if (spent > 0n) return { code: 'WRONG_AMOUNT', message: 'The payment amount is too low.' };
    return { code: 'WRONG_SENDER', message: 'The payment was not sent by the holder wallet.' };
  }
  if (spent < amount) return { code: 'WRONG_SENDER', message: 'The payment was not sent by the holder wallet.' };
  if (tx.blockTimeMs !== null && tx.blockTimeMs < t.issuedAt - CLOCK_SKEW_MS)
    return { code: 'STALE_PAYMENT', message: 'This payment is older than the authorization.' };
  return null;
}

const fail = (reply: FastifyReply, code: number, error: string, message: string) =>
  reply.code(code).send({ error, message });

const SIM = {
  hardware: 'SIMULATION',
  note: 'Simulated access controller. No physical device was unlocked.',
} as const;

type AssetRow = {
  id: string; owner: string; name: string; category: string; meta_json: string;
  photo_hash: string; declared_at: number; signature: string; mint: string | null; created_at: number;
};
type Ownership = 'USER_DECLARED' | 'ON_CHAIN_VERIFIED' | 'TRANSFERRED' | 'UNKNOWN';

const ASSET_RE = /^[A-Za-z0-9_-]{8,64}$/;

function parseMeta(x: unknown): AssetMeta | null {
  if (x === undefined || x === null) return {};
  if (!isObj(x)) return null;
  const out: AssetMeta = {};
  for (const k of ['description', 'serial', 'manufacturer', 'model', 'reference'] as const) {
    const v = x[k];
    if (v === undefined || v === '') continue;
    if (typeof v !== 'string') return null;
    if (v.length > (k === 'description' ? 500 : 120) || v.includes('\u001f')) return null;
    out[k] = v;
  }
  return out;
}

export function buildApp(
  db: DatabaseSync,
  opts: {
    now?: () => number;
    holderOf?: (mint: string) => Promise<string | null>;
    skrMint?: string;
    paymentTx?: (signature: string) => Promise<PaymentTx | null>;
  } = {},
) {
  const now = opts.now ?? Date.now;
  const skrMint = opts.skrMint ?? DEFAULT_SKR_MINT;
  const holderOf =
    opts.holderOf ??
    (async (): Promise<string | null> => {
      throw new Error('holderOf not configured');
    });
  const app = Fastify({ bodyLimit: 32_768 });

  const getRow = (id: string) =>
    db.prepare('SELECT * FROM authorizations WHERE id = ?').get(id) as unknown as Row | undefined;

    const ownerOfRecord = db.prepare('SELECT owner FROM asset_records WHERE id = ?');
  // An asset credential stops counting once its issuer is no longer the record's owner.
  const statusFor = (a: SignedAuthorization, t: number): Status => {
    const s = statusOf(a, t);
    if (s === 'ACTIVE' && a.terms.resource.kind === 'asset') {
      const rec = ownerOfRecord.get(a.terms.resource.id) as { owner: string } | undefined;
      if (rec && rec.owner !== a.terms.issuer) return 'INVALID';
    }
    return s;
  };

  const log = (
    type: string,
    a: { authorizationId?: string; issuer?: string; subject?: string; resourceId?: string; detail?: string },
  ) =>
    db.prepare(
      'INSERT INTO activity (at,type,authorization_id,issuer,subject,resource_id,detail) VALUES (?,?,?,?,?,?,?)',
    ).run(now(), type, a.authorizationId ?? null, a.issuer ?? null, a.subject ?? null,
      a.resourceId ?? null, a.detail ?? null);

  const logFor = (r: Row, type: string, detail?: string) =>
    log(type, { authorizationId: r.id, issuer: r.issuer, subject: r.subject, resourceId: r.resource_id, detail });

  // Issuer submits signed terms.
  app.post('/authorizations', async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.issuerSignature)) return fail(reply, 400, 'BAD_REQUEST', 'Missing terms or signature.');
    const terms = parseTerms(b.terms);
    if (!terms) return fail(reply, 400, 'BAD_REQUEST', 'Malformed terms.');
    const bad = validateTerms(terms);
    if (bad) return fail(reply, 400, 'INVALID_TERMS', bad);
    if (!verifyDetached(issueMessage(terms), b.issuerSignature, terms.issuer))
      return fail(reply, 400, 'ISSUER_SIGNATURE_INVALID', 'Issuer signature does not match the terms.');
    const t = now();
    if (terms.expiresAt <= t) return fail(reply, 400, 'ALREADY_EXPIRED', 'Expiry is in the past.');
    if (terms.issuedAt > t + CLOCK_SKEW_MS) return fail(reply, 400, 'INVALID_TERMS', 'Issue time is in the future.');
    if (getRow(terms.id)) return fail(reply, 409, 'DUPLICATE', 'An authorization with this id exists.');

    if (terms.price) {
      if (terms.price.mint !== skrMint)
        return fail(reply, 400, 'WRONG_TOKEN', 'Only SKR can be required as payment.');
      if (terms.price.payTo !== terms.issuer)
        return fail(reply, 400, 'INVALID_TERMS', 'Payment must go to the issuer.');
    }

        if (terms.resource.kind === 'asset') {
      const rec = db.prepare('SELECT owner, mint FROM asset_records WHERE id = ?')
        .get(terms.resource.id) as { owner: string; mint: string | null } | undefined;
      if (rec && !rec.mint) {
        if (rec.owner !== terms.issuer)
          return fail(reply, 403, 'NOT_ASSET_HOLDER', 'The issuer does not own this asset.');
      } else {
        try {
          const holder = await holderOf(rec?.mint ?? terms.resource.id);
          if (holder !== terms.issuer)
            return fail(reply, 403, 'NOT_ASSET_HOLDER', 'The issuer does not hold this asset.');
        } catch {
          return fail(reply, 503, 'CANNOT_VERIFY', 'Could not verify asset ownership right now.');
        }
      }
    }

    db.prepare(
      `INSERT INTO authorizations (id,issuer,subject,resource_id,terms_json,issuer_signature,created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(terms.id, terms.issuer, terms.subject, terms.resource.id, JSON.stringify(terms), b.issuerSignature, t);
    log('AUTHORIZATION_ISSUED', {
      authorizationId: terms.id, issuer: terms.issuer, subject: terms.subject, resourceId: terms.resource.id,
    });
    return reply.code(201).send({ id: terms.id, status: 'PENDING_APPROVAL' });
  });

  // Holder approves. With a price, the credential then waits for payment.
  app.post<{ Params: { id: string } }>('/authorizations/:id/approve', async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.signature) || !isNum(b.approvedAt))
      return fail(reply, 400, 'BAD_REQUEST', 'Missing signature or approvedAt.');
    const row = getRow(req.params.id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', 'Unknown authorization.');
    const auth = toSigned(row);
    const t = now();
    if (auth.subjectApproval) return fail(reply, 409, 'ALREADY_APPROVED', 'Already approved.');
    if (auth.denial) return fail(reply, 409, 'DENIED', 'This request was denied.');
    if (auth.revocation) return fail(reply, 409, 'REVOKED', 'This authorization was revoked.');
    if (t >= auth.terms.expiresAt) return fail(reply, 409, 'EXPIRED', 'This authorization has expired.');
    if (Math.abs(t - b.approvedAt) > CLOCK_SKEW_MS)
      return fail(reply, 400, 'BAD_REQUEST', 'approvedAt is too far from server time.');
    if (!verifyDetached(approveMessage(auth.terms, auth.issuerSignature, b.approvedAt), b.signature, auth.terms.subject))
      return fail(reply, 400, 'APPROVAL_SIGNATURE_INVALID', 'Approval was not signed by the named holder.');

    db.prepare('UPDATE authorizations SET approval_json = ? WHERE id = ?')
      .run(JSON.stringify({ signature: b.signature, approvedAt: b.approvedAt }), row.id);
    logFor(row, 'AUTHORIZATION_APPROVED');
    if (auth.terms.price) {
      logFor(row, 'PAYMENT_PENDING', `${auth.terms.price.amount} base units`);
      return { id: row.id, status: 'PENDING_PAYMENT' };
    }
    return { id: row.id, status: 'ACTIVE' };
  });

  // Holder submits the signature of their SKR payment. The API verifies it on-chain.
  app.post<{ Params: { id: string } }>('/authorizations/:id/payment', async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.signature)) return fail(reply, 400, 'BAD_REQUEST', 'Missing signature.');
    const row = getRow(req.params.id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', 'Unknown authorization.');
    const auth = toSigned(row);
    if (!auth.terms.price) return fail(reply, 409, 'NO_PRICE', 'This authorization has no price.');
    if (auth.payment) return fail(reply, 409, 'ALREADY_PAID', 'This authorization is already paid.');
    if (!auth.subjectApproval) return fail(reply, 409, 'NOT_APPROVED', 'Approve the authorization first.');
    if (auth.revocation) return fail(reply, 409, 'REVOKED', 'This authorization was revoked.');
    if (now() >= auth.terms.expiresAt) return fail(reply, 409, 'EXPIRED', 'This authorization has expired.');
    if (!opts.paymentTx) return fail(reply, 503, 'CANNOT_VERIFY', 'Payment verification is not configured.');

    const sig = b.signature;
    if (db.prepare('SELECT 1 FROM payments WHERE signature = ?').get(sig))
      return fail(reply, 409, 'SIGNATURE_REUSED', 'This payment was already used.');

    logFor(row, 'PAYMENT_SUBMITTED');
    let tx: PaymentTx | null;
    try {
      tx = await opts.paymentTx(sig);
    } catch {
      return fail(reply, 503, 'CANNOT_VERIFY', 'Could not reach Solana to verify the payment.');
    }
    if (!tx) return fail(reply, 409, 'NOT_CONFIRMED', 'Transaction not found yet. Retry shortly.');

    const problem = checkPayment(tx, auth.terms);
    if (problem) {
      logFor(row, 'PAYMENT_FAILED', problem.code);
      return fail(reply, 400, problem.code, problem.message);
    }

    try {
      db.prepare('INSERT INTO payments (signature, authorization_id, verified_at) VALUES (?,?,?)')
        .run(sig, row.id, now());
    } catch {
      return fail(reply, 409, 'SIGNATURE_REUSED', 'This payment was already used.');
    }
    db.prepare('UPDATE authorizations SET payment_json = ? WHERE id = ?')
      .run(JSON.stringify({ signature: sig, verifiedAt: now() }), row.id);
    logFor(row, 'PAYMENT_VERIFIED');
    logFor(row, 'AUTHORIZATION_ACTIVATED');
    return { id: row.id, status: 'ACTIVE' };
  });

  // Holder denies a request they have not approved.
  app.post<{ Params: { id: string } }>('/authorizations/:id/deny', async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.signature) || !isNum(b.deniedAt))
      return fail(reply, 400, 'BAD_REQUEST', 'Missing signature or deniedAt.');
    const row = getRow(req.params.id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', 'Unknown authorization.');
    const auth = toSigned(row);
    if (auth.subjectApproval) return fail(reply, 409, 'ALREADY_APPROVED', 'Already approved. Ask the issuer to revoke it.');
    if (auth.denial) return fail(reply, 409, 'ALREADY_DENIED', 'Already denied.');
    if (auth.revocation) return fail(reply, 409, 'REVOKED', 'This authorization was revoked.');
    if (Math.abs(now() - b.deniedAt) > CLOCK_SKEW_MS)
      return fail(reply, 400, 'BAD_REQUEST', 'deniedAt is too far from server time.');
    if (!verifyDetached(denyMessage(auth.terms, b.deniedAt), b.signature, auth.terms.subject))
      return fail(reply, 400, 'DENIAL_SIGNATURE_INVALID', 'Denial was not signed by the named holder.');
    db.prepare('UPDATE authorizations SET denial_json = ? WHERE id = ?')
      .run(JSON.stringify({ signature: b.signature, deniedAt: b.deniedAt }), row.id);
    logFor(row, 'AUTHORIZATION_DENIED');
    return { id: row.id, status: 'DENIED' };
  });

  // Issuer revokes.
  app.post<{ Params: { id: string } }>('/authorizations/:id/revoke', async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.signature) || !isNum(b.revokedAt))
      return fail(reply, 400, 'BAD_REQUEST', 'Missing signature or revokedAt.');
    const row = getRow(req.params.id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', 'Unknown authorization.');
    const auth = toSigned(row);
    if (auth.revocation) return fail(reply, 409, 'ALREADY_REVOKED', 'Already revoked.');
    if (Math.abs(now() - b.revokedAt) > CLOCK_SKEW_MS)
      return fail(reply, 400, 'BAD_REQUEST', 'revokedAt is too far from server time.');
    if (!verifyDetached(revokeMessage(auth.terms, b.revokedAt), b.signature, auth.terms.issuer))
      return fail(reply, 400, 'REVOCATION_SIGNATURE_INVALID', 'Revocation was not signed by the issuer.');

    db.prepare('UPDATE authorizations SET revocation_json = ? WHERE id = ?')
      .run(JSON.stringify({ signature: b.signature, revokedAt: b.revokedAt }), row.id);
    logFor(row, 'AUTHORIZATION_REVOKED');
    return { id: row.id, status: 'REVOKED' };
  });

  // List by wallet. Reads are unauthenticated in v1 (see known limitations).
  app.get<{ Querystring: { subject?: string; issuer?: string } }>('/authorizations', async (req, reply) => {
    const { subject, issuer } = req.query;
    if (!isStr(subject) && !isStr(issuer)) return fail(reply, 400, 'BAD_REQUEST', 'Provide subject or issuer.');
    const rows = (isStr(subject)
      ? db.prepare('SELECT * FROM authorizations WHERE subject = ? ORDER BY created_at DESC LIMIT 100').all(subject)
      : db.prepare('SELECT * FROM authorizations WHERE issuer = ? ORDER BY created_at DESC LIMIT 100').all(issuer as string)
    ) as unknown as Row[];
    const t = now();
    return rows.map((r) => {
      const a = toSigned(r);
      return { ...a, status: statusFor(a, t) };
    });
  });

  app.get<{ Params: { id: string } }>('/authorizations/:id', async (req, reply) => {
    const row = getRow(req.params.id);
    if (!row) return fail(reply, 404, 'NOT_FOUND', 'Unknown authorization.');
    const a = toSigned(row);
    return { ...a, status: statusFor(a, now()) };
  });

  // Simulated access controller: step 1, a fresh single-use challenge.
  app.post('/access/challenge', async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.authorizationId) || !isStr(b.resourceId) || !isStr(b.permission))
      return fail(reply, 400, 'BAD_REQUEST', 'Missing authorizationId, resourceId or permission.');
    const row = getRow(b.authorizationId);
    if (!row) return fail(reply, 404, 'NOT_FOUND', 'Unknown authorization.');
    const challengeNonce = newNonce();
    const issuedAt = now();
    db.prepare('INSERT INTO challenges (nonce,authorization_id,resource_id,permission,issued_at) VALUES (?,?,?,?,?)')
      .run(challengeNonce, row.id, b.resourceId, b.permission, issuedAt);
    const message = presentMessage({
      authorizationId: row.id, subject: row.subject, resourceId: b.resourceId,
      permission: b.permission, challengeNonce, issuedAt,
    });
    return { challengeNonce, issuedAt, message, ...SIM };
  });

  // Step 2, holder signed the challenge. The engine decides.
  app.post('/access/verify', async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.authorizationId) || !isStr(b.resourceId) || !isStr(b.permission) || !isObj(b.presentation))
      return fail(reply, 400, 'BAD_REQUEST', 'Malformed request.');
    const p = b.presentation;
    if (!isStr(p.challengeNonce) || !isNum(p.issuedAt) || !isStr(p.signature))
      return fail(reply, 400, 'BAD_REQUEST', 'Malformed presentation.');
    const row = getRow(b.authorizationId);
    if (!row) return fail(reply, 404, 'NOT_FOUND', 'Unknown authorization.');
    const auth = toSigned(row);

    const denyWith = (reason: string, detail: string) => {
      logFor(row, 'ACCESS_DENIED', reason);
      return reply.code(403).send({ granted: false, reason, detail, ...SIM });
    };

    const ch = db.prepare('SELECT * FROM challenges WHERE nonce = ?')
      .get(p.challengeNonce) as unknown as ChallengeRow | undefined;
    if (!ch || ch.authorization_id !== row.id || ch.resource_id !== b.resourceId || ch.permission !== b.permission)
      return denyWith('CHALLENGE_MISMATCH', 'Unknown challenge for this request.');
    if (ch.issued_at !== p.issuedAt) return denyWith('CHALLENGE_MISMATCH', 'Challenge time mismatch.');
    const used = db.prepare('UPDATE challenges SET used = 1 WHERE nonce = ? AND used = 0').run(p.challengeNonce);
    if (Number(used.changes) !== 1) return denyWith('CHALLENGE_MISMATCH', 'Challenge already used.');

    const decision = evaluateAccess({
      auth, resourceId: b.resourceId, permission: b.permission, now: now(),
      expectedChallengeNonce: ch.nonce,
      presentation: { challengeNonce: p.challengeNonce, issuedAt: p.issuedAt, signature: p.signature },
    });
    if (!decision.granted) return denyWith(decision.reason, decision.detail);

    logFor(row, 'ACCESS_GRANTED');
    return { granted: true, ...SIM };
  });

  // Off-chain label for an asset. Only the current on-chain holder may set it.
  app.post('/assets', async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.mint) || !isStr(b.name) || !isStr(b.labeledBy) || !isStr(b.signature) || !isNum(b.labeledAt))
      return fail(reply, 400, 'BAD_REQUEST', 'Malformed request.');
    const name = b.name.trim();
    if (!name || name.length > 40 || /[\r\n]/.test(name)) return fail(reply, 400, 'BAD_REQUEST', 'Bad name.');
    if (Math.abs(now() - b.labeledAt) > CLOCK_SKEW_MS)
      return fail(reply, 400, 'BAD_REQUEST', 'labeledAt is too far from server time.');
    if (!verifyDetached(assetNameMessage(b.mint, name, b.labeledAt), b.signature, b.labeledBy))
      return fail(reply, 400, 'SIGNATURE_INVALID', 'Label was not signed by the stated wallet.');
    try {
      const holder = await holderOf(b.mint);
      if (holder !== b.labeledBy) return fail(reply, 403, 'NOT_ASSET_HOLDER', 'Only the holder can name this asset.');
    } catch {
      return fail(reply, 503, 'CANNOT_VERIFY', 'Could not verify asset ownership right now.');
    }
    db.prepare(
      `INSERT INTO assets (mint,name,labeled_by,signature,created_at) VALUES (?,?,?,?,?)
       ON CONFLICT(mint) DO UPDATE SET name=excluded.name, labeled_by=excluded.labeled_by,
       signature=excluded.signature, created_at=excluded.created_at`,
    ).run(b.mint, name, b.labeledBy, b.signature, now());
    return { mint: b.mint, name };
  });

  app.get<{ Querystring: { mints?: string } }>('/assets', async (req) => {
    const mints = (req.query.mints ?? '').split(',').filter(Boolean).slice(0, 50);
    if (mints.length === 0) return [];
    const q = mints.map(() => '?').join(',');
    return db.prepare(`SELECT mint, name FROM assets WHERE mint IN (${q})`).all(...mints);
  });

  // Events the app itself reports (wallet, identity). Unsigned: they say what this app did, not a proof.
  const APP_EVENTS = ['WALLET_CONNECTED', 'WALLET_DISCONNECTED', 'SIGNING_REJECTED', 'IDENTITY_VERIFIED', 'IDENTITY_CHECK_FAILED'];
  app.post('/events', async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.wallet) || !isStr(b.type) || !APP_EVENTS.includes(b.type) || !decodeKey(b.wallet))
      return fail(reply, 400, 'BAD_REQUEST', 'Unsupported event.');
    const detail = typeof b.detail === 'string' && b.detail.length <= 120 ? b.detail : '';
    log(b.type, { issuer: b.wallet, subject: b.wallet, detail: 'reported by app' + (detail ? ' · ' + detail : '') });
    return { ok: true };
  });

  app.get('/health', async () => ({ ok: true, at: now() }));

  app.get<{ Querystring: { wallet?: string } }>('/activity', async (req, reply) => {
    const { wallet } = req.query;
    if (!isStr(wallet)) return fail(reply, 400, 'BAD_REQUEST', 'Provide wallet.');
    return db.prepare('SELECT * FROM activity WHERE issuer = ? OR subject = ? ORDER BY id DESC LIMIT 100')
      .all(wallet, wallet);
  });

    // ---------- OWNR asset records ----------
  const getAsset = (id: string) =>
    db.prepare('SELECT * FROM asset_records WHERE id = ?').get(id) as unknown as AssetRow | undefined;

  const ownershipOf = async (r: AssetRow): Promise<{ ownership: Ownership; holder: string | null }> => {
    if (!r.mint) return { ownership: 'USER_DECLARED', holder: null };
    try {
      const holder = await holderOf(r.mint);
      if (!holder) return { ownership: 'UNKNOWN', holder: null };
      return { ownership: holder === r.owner ? 'ON_CHAIN_VERIFIED' : 'TRANSFERRED', holder };
    } catch {
      return { ownership: 'UNKNOWN', holder: null };
    }
  };

  const assetView = (r: AssetRow, o: { ownership: Ownership; holder: string | null }) => ({
    id: r.id, owner: r.owner, name: r.name, category: r.category,
    meta: JSON.parse(r.meta_json) as AssetMeta,
    photoHash: r.photo_hash, declaredAt: r.declared_at, signature: r.signature,
    mint: r.mint, createdAt: r.created_at, ownership: o.ownership, holder: o.holder,
  });

  app.post('/asset-records', { bodyLimit: 2_500_000 }, async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.id) || !isStr(b.owner) || !isStr(b.name) || !isStr(b.category)
      || !isStr(b.signature) || !isNum(b.declaredAt) || !isObj(b.photo))
      return fail(reply, 400, 'BAD_REQUEST', 'Malformed request.');
    const mint = b.mint === undefined || b.mint === null ? null : isStr(b.mint) ? b.mint : undefined;
    if (mint === undefined) return fail(reply, 400, 'BAD_REQUEST', 'Bad token address.');
    const name = b.name.trim();
    if (!ASSET_RE.test(b.id) || !decodeKey(b.owner)) return fail(reply, 400, 'BAD_REQUEST', 'Bad id or owner.');
    if (!name || name.length > 40 || /[\r\n]/.test(name)) return fail(reply, 400, 'BAD_REQUEST', 'Bad name.');
    if (!(ASSET_CATEGORIES as readonly string[]).includes(b.category))
      return fail(reply, 400, 'BAD_REQUEST', 'Unknown category.');
    const meta = parseMeta(b.meta);
    if (!meta) return fail(reply, 400, 'BAD_REQUEST', 'Bad details.');
    const photo = b.photo;
    if (photo.mime !== 'image/jpeg' || typeof photo.base64 !== 'string' || photo.base64.length > 2_000_000)
      return fail(reply, 400, 'BAD_PHOTO', 'The photo must be a JPEG under about 1.5 MB.');
    const bytes = Buffer.from(photo.base64, 'base64');
    if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)
      return fail(reply, 400, 'BAD_PHOTO', 'That is not a valid JPEG image.');
    if (Math.abs(now() - b.declaredAt) > CLOCK_SKEW_MS)
      return fail(reply, 400, 'BAD_REQUEST', 'declaredAt is too far from server time.');

    const photoHash = sha512b58(bytes);
    const msg = assetDeclareMessage({
      id: b.id, owner: b.owner, name, category: b.category,
      metaHash: assetMetaHash(meta), photoHash, mint, declaredAt: b.declaredAt,
    });
    if (!verifyDetached(msg, b.signature, b.owner))
      return fail(reply, 400, 'SIGNATURE_INVALID', 'The declaration was not signed by the owner wallet.');
    if (getAsset(b.id)) return fail(reply, 409, 'DUPLICATE', 'An asset with this id exists.');

    if (mint) {
      if (db.prepare('SELECT 1 FROM asset_records WHERE mint = ?').get(mint))
        return fail(reply, 409, 'MINT_IN_USE', 'This token is already linked to an asset record.');
      try {
        const holder = await holderOf(mint);
        if (holder !== b.owner) return fail(reply, 403, 'NOT_ASSET_HOLDER', 'The owner does not hold this token.');
      } catch {
        return fail(reply, 503, 'CANNOT_VERIFY', 'Could not verify the token on Solana right now.');
      }
    }

    db.prepare('INSERT INTO asset_photos (id, mime, data) VALUES (?,?,?)').run(b.id, 'image/jpeg', bytes);
    db.prepare(
      `INSERT INTO asset_records
       (id,owner,name,category,meta_json,photo_hash,declared_at,signature,mint,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(b.id, b.owner, name, b.category, JSON.stringify(meta), photoHash, b.declaredAt, b.signature, mint, now());
    log('ASSET_CREATED', {
      issuer: b.owner, subject: b.owner, resourceId: b.id, detail: mint ? 'on-chain' : 'user-declared',
    });
    return reply.code(201).send({ id: b.id });
  });

  app.get<{ Querystring: { owner?: string } }>('/asset-records', async (req, reply) => {
    const { owner } = req.query;
    if (!isStr(owner)) return fail(reply, 400, 'BAD_REQUEST', 'Provide owner.');
    const rows = db.prepare('SELECT * FROM asset_records WHERE owner = ? ORDER BY created_at DESC LIMIT 20')
      .all(owner) as unknown as AssetRow[];
    return Promise.all(rows.map(async (r) => assetView(r, await ownershipOf(r))));
  });

  app.get<{ Params: { id: string } }>('/asset-records/:id', async (req, reply) => {
    const r = getAsset(req.params.id);
    if (!r) return fail(reply, 404, 'NOT_FOUND', 'Unknown asset.');
    const history = db.prepare('SELECT * FROM activity WHERE resource_id = ? ORDER BY id DESC LIMIT 100').all(r.id);
    const t = now();
    const authorizations = (
      db.prepare('SELECT * FROM authorizations WHERE resource_id = ? ORDER BY created_at DESC LIMIT 50').all(r.id) as unknown as Row[]
    ).map((x) => {
      const a = toSigned(x);
      return { ...a, status: statusFor(a, t) };
    });
    return { asset: assetView(r, await ownershipOf(r)), history, authorizations };
  });

  app.get<{ Params: { id: string } }>('/asset-records/:id/photo', async (req, reply) => {
    const p = db.prepare('SELECT mime, data FROM asset_photos WHERE id = ?')
      .get(req.params.id) as unknown as { mime: string; data: Uint8Array } | undefined;
    if (!p) return fail(reply, 404, 'NOT_FOUND', 'No photo.');
    return reply.type(p.mime).header('Cache-Control', 'private, max-age=3600').send(Buffer.from(p.data));
  });

  // Links an existing record to a 1-of-1 token. Signed by the record owner; checked on-chain.
  app.post<{ Params: { id: string } }>('/asset-records/:id/anchor', async (req, reply) => {
    const b = req.body;
    if (!isObj(b) || !isStr(b.mint) || !isNum(b.anchoredAt) || !isStr(b.signature))
      return fail(reply, 400, 'BAD_REQUEST', 'Malformed request.');
    const r = getAsset(req.params.id);
    if (!r) return fail(reply, 404, 'NOT_FOUND', 'Unknown asset.');
    if (r.mint) return fail(reply, 409, 'ALREADY_ANCHORED', 'This asset is already on-chain.');
    if (Math.abs(now() - b.anchoredAt) > CLOCK_SKEW_MS)
      return fail(reply, 400, 'BAD_REQUEST', 'anchoredAt is too far from server time.');
    if (!verifyDetached(assetAnchorMessage(r.id, b.mint, b.anchoredAt), b.signature, r.owner))
      return fail(reply, 400, 'SIGNATURE_INVALID', 'Not signed by the asset owner.');
    if (db.prepare('SELECT 1 FROM asset_records WHERE mint = ?').get(b.mint))
      return fail(reply, 409, 'MINT_IN_USE', 'This token is already linked to an asset record.');
    try {
      const holder = await holderOf(b.mint);
      if (holder !== r.owner) return fail(reply, 403, 'NOT_ASSET_HOLDER', 'The owner does not hold this token.');
    } catch {
      return fail(reply, 503, 'CANNOT_VERIFY', 'Could not verify the token on Solana right now.');
    }
    db.prepare('UPDATE asset_records SET mint = ? WHERE id = ?').run(b.mint, r.id);
    log('ASSET_ANCHORED', { issuer: r.owner, subject: r.owner, resourceId: r.id, detail: 'on-chain' });
    return { id: r.id, mint: b.mint };
  });

  // Follows the chain: if the token moved, the record moves with it. The chain is the authority.
  app.post<{ Params: { id: string } }>('/asset-records/:id/sync', async (req, reply) => {
    const r = getAsset(req.params.id);
    if (!r) return fail(reply, 404, 'NOT_FOUND', 'Unknown asset.');
    if (!r.mint) return fail(reply, 409, 'NOT_ANCHORED', 'This asset is not on-chain.');
    let holder: string | null;
    try {
      holder = await holderOf(r.mint);
    } catch {
      return fail(reply, 503, 'CANNOT_VERIFY', 'Could not read the token from Solana right now.');
    }
    if (!holder) return fail(reply, 409, 'NOT_FOUND_ON_CHAIN', 'The token holder could not be found.');
    if (holder === r.owner) return { owner: holder, changed: false };
    db.prepare('UPDATE asset_records SET owner = ? WHERE id = ?').run(holder, r.id);
    log('ASSET_TRANSFERRED', { issuer: r.owner, subject: holder, resourceId: r.id, detail: 'on-chain' });
    return { owner: holder, changed: true };
  });

  return app;
}