import { beforeEach, describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {
  AuthorizationTerms, approveMessage, issueMessage, presentMessage, revokeMessage, utf8, assetNameMessage,assetDeclareMessage, assetAnchorMessage, assetMetaHash, sha512b58,
} from '@seeker/shared';
import { openDb } from '../src/db';
import { buildApp } from '../src/app';
import type { PaymentTx } from '../src/solana';

const T0 = 1_800_000_000_000;
const DAY = 86_400_000;
let t = T0;
let app: ReturnType<typeof buildApp>;

// Test-only wallets.
function wallet() {
  const kp = nacl.sign.keyPair();
  return {
    pub: bs58.encode(kp.publicKey),
    sign: (m: string) => bs58.encode(nacl.sign.detached(utf8(m), kp.secretKey)),
  };
}
type W = ReturnType<typeof wallet>;

const holders: Record<string, string> = {};
const SKR = wallet();
const txs: Record<string, PaymentTx> = {};
beforeEach(() => {
  t = T0;
  for (const k of Object.keys(holders)) delete holders[k];
  for (const k of Object.keys(txs)) delete txs[k];
  app = buildApp(openDb(':memory:'), {
    now: () => t,
    holderOf: async (m) => holders[m] ?? null,
    skrMint: SKR.pub,
    paymentTx: async (sig) => txs[sig] ?? null,
  });
});

const priceFor = (issuer: W, amount = '10000000') => ({ mint: SKR.pub, amount, payTo: issuer.pub });
const payTx = (from: string, to: string, amount: string, mint = SKR.pub, over: Partial<PaymentTx> = {}): PaymentTx => ({
  failed: false,
  blockTimeMs: t,
  deltas: [
    { owner: from, mint, change: -BigInt(amount) },
    { owner: to, mint, change: BigInt(amount) },
  ],
  ...over,
});
const submitPayment = (id: string, signature: string) => post(`/authorizations/${id}/payment`, { signature });

const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as object });

async function issue(issuer: W, holder: W, over: Partial<AuthorizationTerms> = {}, signer: W = issuer) {
  const terms: AuthorizationTerms = {
    version: 1, id: 'auth_1', issuer: issuer.pub, subject: holder.pub,
    resource: { id: 'door-001', name: 'Demo Door', kind: 'door' },
    permissions: ['entry'], issuedAt: t, expiresAt: t + 30 * DAY, nonce: 'n1', ...over,
  };
  const issuerSignature = signer.sign(issueMessage(terms));
  const res = await post('/authorizations', { terms, issuerSignature });
  return { terms, issuerSignature, res };
}

const approve = (holder: W, terms: AuthorizationTerms, issuerSignature: string) =>
  post(`/authorizations/${terms.id}/approve`, {
    approvedAt: t, signature: holder.sign(approveMessage(terms, issuerSignature, t)),
  });

async function door(holder: W, terms: AuthorizationTerms, permission = 'entry', resourceId = 'door-001') {
  const ch = (await post('/access/challenge', { authorizationId: terms.id, resourceId, permission })).json();
  const msg = presentMessage({
    authorizationId: terms.id, subject: terms.subject, resourceId, permission,
    challengeNonce: ch.challengeNonce, issuedAt: ch.issuedAt,
  });
  const body = {
    authorizationId: terms.id, resourceId, permission,
    presentation: { challengeNonce: ch.challengeNonce, issuedAt: ch.issuedAt, signature: holder.sign(msg) },
  };
  return { body, res: await post('/access/verify', body) };
}

describe('api', () => {
  it('starts empty, with no seeded records', async () => {
    const w = wallet();
    const l = await app.inject({ method: 'GET', url: `/authorizations?subject=${w.pub}` });
    expect(l.json()).toEqual([]);
    const a = await app.inject({ method: 'GET', url: `/activity?wallet=${w.pub}` });
    expect(a.json()).toEqual([]);
  });
 
    it('only lets the real asset holder issue authorizations for an asset', async () => {
    const holder = wallet(), other = wallet(), guest = wallet();
    holders['mint1'] = holder.pub;
    const asset = { id: 'mint1', name: 'Demo asset', kind: 'asset' as const };
    const bad = await issue(other, guest, { resource: asset, permissions: ['use'], id: 'auth_a' });
    expect(bad.res.statusCode).toBe(403);
    const good = await issue(holder, guest, { resource: asset, permissions: ['use'], id: 'auth_b' });
    expect(good.res.statusCode).toBe(201);
  });

  it('labels assets only when signed by the holder', async () => {
    const holder = wallet(), other = wallet();
    holders['mint1'] = holder.pub;
    const send = (w: W) =>
      post('/assets', {
        mint: 'mint1', name: 'Camera #042', labeledBy: w.pub, labeledAt: t,
        signature: w.sign(assetNameMessage('mint1', 'Camera #042', t)),
      });
    expect((await send(other)).statusCode).toBe(403);
    expect((await send(holder)).statusCode).toBe(200);
    const list = (await app.inject({ method: 'GET', url: '/assets?mints=mint1' })).json();
    expect(list).toEqual([{ mint: 'mint1', name: 'Camera #042' }]);
  });

  it('runs the full flow: issue, approve, door grants, activity recorded', async () => {
    const issuer = wallet(), holder = wallet();
    const { terms, issuerSignature, res } = await issue(issuer, holder);
    expect(res.statusCode).toBe(201);

    let list = (await app.inject({ method: 'GET', url: `/authorizations?subject=${holder.pub}` })).json();
    expect(list[0].status).toBe('PENDING_APPROVAL');

    expect((await approve(holder, terms, issuerSignature)).statusCode).toBe(200);
    list = (await app.inject({ method: 'GET', url: `/authorizations?subject=${holder.pub}` })).json();
    expect(list[0].status).toBe('ACTIVE');

    const d = await door(holder, terms);
    expect(d.res.statusCode).toBe(200);
    expect(d.res.json()).toMatchObject({ granted: true, hardware: 'SIMULATION' });

    const act = (await app.inject({ method: 'GET', url: `/activity?wallet=${holder.pub}` })).json();
    expect(act.map((a: { type: string }) => a.type)).toEqual([
      'ACCESS_GRANTED', 'AUTHORIZATION_APPROVED', 'AUTHORIZATION_ISSUED',
    ]);
  });

  it('rejects a forged issuance', async () => {
    const issuer = wallet(), holder = wallet(), forger = wallet();
    const { res } = await issue(issuer, holder, {}, forger);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('ISSUER_SIGNATURE_INVALID');
  });

  it('rejects approval by a different wallet', async () => {
    const issuer = wallet(), holder = wallet(), other = wallet();
    const { terms, issuerSignature } = await issue(issuer, holder);
    const r = await approve(other, terms, issuerSignature);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('APPROVAL_SIGNATURE_INVALID');
  });

  it('denies the door when not approved', async () => {
    const issuer = wallet(), holder = wallet();
    const { terms } = await issue(issuer, holder);
    const d = await door(holder, terms);
    expect(d.res.statusCode).toBe(403);
    expect(d.res.json().reason).toBe('NOT_APPROVED');
  });

  it('blocks replay of a used challenge', async () => {
    const issuer = wallet(), holder = wallet();
    const { terms, issuerSignature } = await issue(issuer, holder);
    await approve(holder, terms, issuerSignature);
    const first = await door(holder, terms);
    expect(first.res.statusCode).toBe(200);
    const replay = await post('/access/verify', first.body);
    expect(replay.statusCode).toBe(403);
    expect(replay.json().reason).toBe('CHALLENGE_MISMATCH');
  });

  it('denies after revocation, and rejects a revoke from a non-issuer', async () => {
    const issuer = wallet(), holder = wallet();
    const { terms, issuerSignature } = await issue(issuer, holder);
    await approve(holder, terms, issuerSignature);

    const bad = await post(`/authorizations/${terms.id}/revoke`, {
      revokedAt: t, signature: holder.sign(revokeMessage(terms, t)),
    });
    expect(bad.statusCode).toBe(400);

    const ok = await post(`/authorizations/${terms.id}/revoke`, {
      revokedAt: t, signature: issuer.sign(revokeMessage(terms, t)),
    });
    expect(ok.statusCode).toBe(200);
    const d = await door(holder, terms);
    expect(d.res.json().reason).toBe('REVOKED');
  });

  it('denies after expiry', async () => {
    const issuer = wallet(), holder = wallet();
    const { terms, issuerSignature } = await issue(issuer, holder);
    await approve(holder, terms, issuerSignature);
    t += 31 * DAY;
    const d = await door(holder, terms);
    expect(d.res.json().reason).toBe('EXPIRED');
  });

  it('denies the wrong door and an ungranted permission', async () => {
    const issuer = wallet(), holder = wallet();
    const { terms, issuerSignature } = await issue(issuer, holder);
    await approve(holder, terms, issuerSignature);
    expect((await door(holder, terms, 'entry', 'door-002')).res.json().reason).toBe('RESOURCE_MISMATCH');
    expect((await door(holder, terms, 'admin')).res.json().reason).toBe('PERMISSION_NOT_GRANTED');
  });
    async function approvedPaid(over: Partial<AuthorizationTerms> = {}) {
    const issuer = wallet(), holder = wallet();
    const r = await issue(issuer, holder, { price: priceFor(issuer), ...over });
    await approve(holder, r.terms, r.issuerSignature);
    return { issuer, holder, terms: r.terms };
  }

  it('paid access: pending payment, door denied, payment verified, door granted', async () => {
    const issuer = wallet(), holder = wallet();
    const { terms, issuerSignature, res } = await issue(issuer, holder, { price: priceFor(issuer) });
    expect(res.statusCode).toBe(201);
    const ap = await approve(holder, terms, issuerSignature);
    expect(ap.json().status).toBe('PENDING_PAYMENT');
    const list = (await app.inject({ method: 'GET', url: `/authorizations?subject=${holder.pub}` })).json();
    expect(list[0].status).toBe('PENDING_PAYMENT');
    expect((await door(holder, terms)).res.json().reason).toBe('PAYMENT_REQUIRED');

    txs['sig1'] = payTx(holder.pub, issuer.pub, '10000000');
    const pay = await submitPayment(terms.id, 'sig1');
    expect(pay.statusCode).toBe(200);
    expect(pay.json().status).toBe('ACTIVE');
    expect((await door(holder, terms)).res.statusCode).toBe(200);

    const act = (await app.inject({ method: 'GET', url: `/activity?wallet=${holder.pub}` })).json();
    expect(act.map((a: { type: string }) => a.type)).toEqual(expect.arrayContaining([
      'AUTHORIZATION_ISSUED', 'AUTHORIZATION_APPROVED', 'PAYMENT_PENDING', 'PAYMENT_SUBMITTED',
      'PAYMENT_VERIFIED', 'AUTHORIZATION_ACTIVATED', 'ACCESS_GRANTED', 'ACCESS_DENIED',
    ]));
  });

  it('rejects wrong amount, token, sender, recipient, failed and stale payments; stays pending', async () => {
    const { issuer, holder, terms } = await approvedPaid();
    const stranger = wallet();
    const cases: [string, PaymentTx, string][] = [
      ['s1', payTx(holder.pub, issuer.pub, '5000000'), 'WRONG_AMOUNT'],
      ['s2', payTx(holder.pub, issuer.pub, '10000000', wallet().pub), 'WRONG_TOKEN'],
      ['s3', payTx(stranger.pub, issuer.pub, '10000000'), 'WRONG_SENDER'],
      ['s4', payTx(holder.pub, stranger.pub, '10000000'), 'WRONG_RECIPIENT'],
      ['s5', payTx(holder.pub, issuer.pub, '10000000', SKR.pub, { failed: true }), 'TX_FAILED'],
      ['s6', payTx(holder.pub, issuer.pub, '10000000', SKR.pub, { blockTimeMs: T0 - 3_600_000 }), 'STALE_PAYMENT'],
    ];
    for (const [sig, tx, code] of cases) {
      txs[sig] = tx;
      const r = await submitPayment(terms.id, sig);
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toBe(code);
    }
    const list = (await app.inject({ method: 'GET', url: `/authorizations?subject=${holder.pub}` })).json();
    expect(list[0].status).toBe('PENDING_PAYMENT');
    expect((await door(holder, terms)).res.json().reason).toBe('PAYMENT_REQUIRED');
  });

  it('reports unconfirmed payments as retryable and blocks payment before approval', async () => {
    const issuer = wallet(), holder = wallet();
    const { terms, issuerSignature } = await issue(issuer, holder, { price: priceFor(issuer) });
    txs['s1'] = payTx(holder.pub, issuer.pub, '10000000');
    const early = await submitPayment(terms.id, 's1');
    expect(early.statusCode).toBe(409);
    expect(early.json().error).toBe('NOT_APPROVED');
    await approve(holder, terms, issuerSignature);
    const missing = await submitPayment(terms.id, 'unknown');
    expect(missing.statusCode).toBe(409);
    expect(missing.json().error).toBe('NOT_CONFIRMED');
  });

  it('never accepts the same payment signature twice', async () => {
    const a = await approvedPaid();
    const b = await approvedPaid({ id: 'auth_2', nonce: 'n2' });
    txs['s1'] = payTx(a.holder.pub, a.issuer.pub, '10000000');
    expect((await submitPayment(a.terms.id, 's1')).statusCode).toBe(200);
    const again = await submitPayment(b.terms.id, 's1');
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('SIGNATURE_REUSED');
  });

  it('validates the price at issuance and keeps self access free', async () => {
    const issuer = wallet(), holder = wallet(), other = wallet();
    const badMint = await issue(issuer, holder, { price: { mint: other.pub, amount: '1', payTo: issuer.pub } });
    expect(badMint.res.statusCode).toBe(400);
    expect(badMint.res.json().error).toBe('WRONG_TOKEN');
    const badPayTo = await issue(issuer, holder, { id: 'auth_b', price: { mint: SKR.pub, amount: '1', payTo: other.pub } });
    expect(badPayTo.res.statusCode).toBe(400);
    const self = await issue(issuer, issuer, { id: 'auth_c', price: priceFor(issuer) });
    expect(self.res.statusCode).toBe(400);
    expect(self.res.json().error).toBe('INVALID_TERMS');
  }); 
    const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, ...nacl.randomBytes(2000)]);

  async function declare(
    w: W,
    o: { id?: string; name?: string; category?: string; mint?: string; photo?: Uint8Array;
      signedPhoto?: Uint8Array; mime?: string; signAs?: W } = {},
  ) {
    const id = o.id ?? 'asset_00000001';
    const name = o.name ?? 'Camera #042';
    const category = o.category ?? 'equipment';
    const photo = o.photo ?? jpeg();
    const meta = { description: 'Test camera' };
    const signature = (o.signAs ?? w).sign(assetDeclareMessage({
      id, owner: w.pub, name, category, metaHash: assetMetaHash(meta),
      photoHash: sha512b58(o.signedPhoto ?? photo), mint: o.mint ?? null, declaredAt: t,
    }));
    const res = await post('/asset-records', {
      id, owner: w.pub, name, category, meta, mint: o.mint, declaredAt: t, signature,
      photo: { mime: o.mime ?? 'image/jpeg', base64: Buffer.from(photo).toString('base64') },
    });
    return { id, res, photo };
  }
  const listFor = async (w: W) =>
    (await app.inject({ method: 'GET', url: `/asset-records?owner=${w.pub}` })).json();

  it('creates a user-declared asset record, lists it, serves the photo and logs it', async () => {
    const owner = wallet();
    const { id, res, photo } = await declare(owner);
    expect(res.statusCode).toBe(201);
    const list = await listFor(owner);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, name: 'Camera #042', ownership: 'USER_DECLARED', mint: null });
    const detail = (await app.inject({ method: 'GET', url: `/asset-records/${id}` })).json();
    expect(detail.asset.ownership).toBe('USER_DECLARED');
    expect(detail.history.map((h: { type: string }) => h.type)).toEqual(['ASSET_CREATED']);
    const img = await app.inject({ method: 'GET', url: `/asset-records/${id}/photo` });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toContain('image/jpeg');
    expect(img.rawPayload.length).toBe(photo.length);
  });

  it('rejects forged, tampered and invalid asset declarations', async () => {
    const owner = wallet(), other = wallet();
    expect((await declare(owner, { signAs: other })).res.json().error).toBe('SIGNATURE_INVALID');
    expect((await declare(owner, { signedPhoto: jpeg() })).res.json().error).toBe('SIGNATURE_INVALID');
    expect((await declare(owner, { mime: 'image/png' })).res.statusCode).toBe(400);
    expect((await declare(owner, { category: 'weapon' })).res.statusCode).toBe(400);
    holders['mintZ'] = other.pub;
    expect((await declare(owner, { mint: 'mintZ' })).res.statusCode).toBe(403);
    expect(await listFor(owner)).toEqual([]);
  });

  it('anchors later, shows on-chain ownership, and follows an on-chain transfer', async () => {
    const a = wallet(), b = wallet();
    const { id } = await declare(a);
    holders['mintA'] = a.pub;
    const bad = await post(`/asset-records/${id}/anchor`, {
      mint: 'mintA', anchoredAt: t, signature: b.sign(assetAnchorMessage(id, 'mintA', t)),
    });
    expect(bad.statusCode).toBe(400);
    const ok = await post(`/asset-records/${id}/anchor`, {
      mint: 'mintA', anchoredAt: t, signature: a.sign(assetAnchorMessage(id, 'mintA', t)),
    });
    expect(ok.statusCode).toBe(200);
    expect((await listFor(a))[0].ownership).toBe('ON_CHAIN_VERIFIED');

    holders['mintA'] = b.pub; // the token moves on-chain
    expect((await listFor(a))[0]).toMatchObject({ ownership: 'TRANSFERRED', holder: b.pub });
    const sync = await post(`/asset-records/${id}/sync`, {});
    expect(sync.json()).toMatchObject({ owner: b.pub, changed: true });
    expect(await listFor(a)).toEqual([]);
    const forB = await listFor(b);
    expect(forB.map((x: { id: string }) => x.id)).toEqual([id]);
    expect(forB[0].ownership).toBe('ON_CHAIN_VERIFIED');
  });

  it('lets only the owner authorize an asset record, and voids it after a transfer', async () => {
    const a = wallet(), b = wallet(), guest = wallet(), stranger = wallet();
    const { id } = await declare(a);
    const asset = { id, name: 'Camera #042', kind: 'asset' as const };
    const denied = await issue(stranger, guest, { resource: asset, permissions: ['use'], id: 'auth_s' });
    expect(denied.res.statusCode).toBe(403);
    const ok = await issue(a, guest, { resource: asset, permissions: ['use'], id: 'auth_o' });
    expect(ok.res.statusCode).toBe(201);
    await approve(guest, ok.terms, ok.issuerSignature);
    const status = async () =>
      (await app.inject({ method: 'GET', url: `/authorizations?subject=${guest.pub}` })).json()[0].status;
    expect(await status()).toBe('ACTIVE');

    holders['mintA'] = a.pub;
    await post(`/asset-records/${id}/anchor`, {
      mint: 'mintA', anchoredAt: t, signature: a.sign(assetAnchorMessage(id, 'mintA', t)),
    });
    holders['mintA'] = b.pub;
    await post(`/asset-records/${id}/sync`, {});
    expect(await status()).toBe('INVALID');
  });
});