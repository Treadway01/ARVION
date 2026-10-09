import { Buffer } from 'buffer';
import {
  AssetMeta, assetAnchorMessage, assetDeclareMessage, assetMetaHash, newNonce, sha512b58,
} from '@seeker/shared';
import { AppError, Result } from '../../core/status';
import { api } from '../../services/api';
import { createAsset, transferAsset } from '../ownership/spl';
import { mwaWalletProvider } from '../wallet/mwa';

const fail = (code: AppError['code'], message: string): Result<never> => ({ ok: false, error: { code, message } });

export type NewAsset = {
  name: string;
  category: string;
  meta: AssetMeta;
  photoBase64: string;
  onChain: boolean;
  existingMint?: string; // reuse a token that was minted before a failed save
  onMinted?: (mint: string) => void;
};

/** Optionally mints a 1-of-1 token, then saves the owner-signed asset record. */
export async function createAssetRecord(
  owner: string,
  a: NewAsset,
): Promise<Result<{ id: string; mint: string | null; signature?: string }>> {
  const id = `asset_${newNonce()}`;
  let mint: string | null = a.existingMint ?? null;
  let txSig: string | undefined;

  if (a.onChain && !mint) {
    const created = await createAsset();
    if (!created.ok) return created;
    if (!created.value.mint) return fail('UNKNOWN', 'The token was created but its address was not returned.');
    mint = created.value.mint;
    txSig = created.value.signature;
    a.onMinted?.(mint);
  }

  const name = a.name.trim();
  const photoHash = sha512b58(Uint8Array.from(Buffer.from(a.photoBase64, 'base64')));
  const declaredAt = Date.now();
  const sig = await mwaWalletProvider.signMessage(
    assetDeclareMessage({
      id, owner, name, category: a.category, metaHash: assetMetaHash(a.meta), photoHash, mint, declaredAt,
    }),
  );
  if (!sig.ok) return sig;

  const r = await api.createAssetRecord({
    id, owner, name, category: a.category, meta: a.meta, mint, declaredAt, signature: sig.value,
    photo: { mime: 'image/jpeg', base64: a.photoBase64 },
  });
  if (!r.ok) return r;
  return { ok: true, value: { id, mint, signature: txSig } };
}

/** Mints a token for an existing record and links it. */
export async function anchorExisting(id: string): Promise<Result<{ mint: string }>> {
  const created = await createAsset();
  if (!created.ok) return created;
  const mint = created.value.mint;
  if (!mint) return fail('UNKNOWN', 'The token was created but its address was not returned.');
  const anchoredAt = Date.now();
  const sig = await mwaWalletProvider.signMessage(assetAnchorMessage(id, mint, anchoredAt));
  if (!sig.ok) return sig;
  const r = await api.anchorAsset(id, { mint, anchoredAt, signature: sig.value });
  if (!r.ok) return r;
  return { ok: true, value: { mint } };
}

/** Real on-chain transfer, then the record follows the chain. */
export async function transferAndSync(id: string, mint: string, to: string): Promise<Result<{ signature: string }>> {
  const t = await transferAsset(mint, to);
  if (!t.ok) return t;
  await api.syncAsset(id); // if this fails, the asset shows "Transferred" with a Sync button
  return t;
}