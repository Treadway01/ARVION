import { beforeEach, describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { AuthorizationTerms, approveMessage, denyMessage, issueMessage, utf8 } from '@seeker/shared';
import { openDb } from '../src/db';
import { buildApp } from '../src/app';

const T0 = 1_800_000_000_000;
let app: ReturnType<typeof buildApp>;

function wallet() {
  const kp = nacl.sign.keyPair();
  return {
    pub: bs58.encode(kp.publicKey),
    sign: (m: string) => bs58.encode(nacl.sign.detached(utf8(m), kp.secretKey)),
  };
}
type W = ReturnType<typeof wallet>;
const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as object });

beforeEach(() => {
  app = buildApp(openDb(':memory:'), { now: () => T0 });
});

async function issue(issuer: W, holder: W) {
  const terms: AuthorizationTerms = {
    version: 1, id: 'auth_d', issuer: issuer.pub, subject: holder.pub,
    resource: { id: 'door-001', name: 'Demo Door', kind: 'door' },
    permissions: ['entry'], issuedAt: T0, expiresAt: T0 + 86_400_000, nonce: 'n1',
  };
  const issuerSignature = issuer.sign(issueMessage(terms));
  await post('/authorizations', { terms, issuerSignature });
  return { terms, issuerSignature };
}
const statusOf = async (w: W) =>
  (await app.inject({ method: 'GET', url: `/authorizations?subject=${w.pub}` })).json()[0].status;

describe('deny and app events', () => {
  it('lets the holder deny a pending request, and it can never be approved', async () => {
    const issuer = wallet(), holder = wallet();
    const { terms, issuerSignature } = await issue(issuer, holder);
    const d = await post(`/authorizations/${terms.id}/deny`, { deniedAt: T0, signature: holder.sign(denyMessage(terms, T0)) });
    expect(d.statusCode).toBe(200);
    expect(await statusOf(holder)).toBe('DENIED');
    const ap = await post(`/authorizations/${terms.id}/approve`, {
      approvedAt: T0, signature: holder.sign(approveMessage(terms, issuerSignature, T0)),
    });
    expect(ap.statusCode).toBe(409);
    const act = (await app.inject({ method: 'GET', url: `/activity?wallet=${holder.pub}` })).json();
    expect(act.map((a: { type: string }) => a.type)).toContain('AUTHORIZATION_DENIED');
  });

  it('rejects a denial signed by someone else', async () => {
    const issuer = wallet(), holder = wallet(), other = wallet();
    const { terms } = await issue(issuer, holder);
    const d = await post(`/authorizations/${terms.id}/deny`, { deniedAt: T0, signature: other.sign(denyMessage(terms, T0)) });
    expect(d.statusCode).toBe(400);
    expect(await statusOf(holder)).toBe('PENDING_APPROVAL');
  });

  it('records only whitelisted app events', async () => {
    const w = wallet();
    expect((await post('/events', { wallet: w.pub, type: 'WALLET_CONNECTED' })).statusCode).toBe(200);
    expect((await post('/events', { wallet: w.pub, type: 'ACCESS_GRANTED' })).statusCode).toBe(400);
    const act = (await app.inject({ method: 'GET', url: `/activity?wallet=${w.pub}` })).json();
    expect(act).toHaveLength(1);
    expect(act[0].type).toBe('WALLET_CONNECTED');
    expect(act[0].detail).toContain('reported by app');
  });
});
