import nacl from 'tweetnacl';
import bs58 from 'bs58';

const enc = new TextEncoder();
export const utf8 = (s: string): Uint8Array => enc.encode(s);

export function decodeKey(b58: string): Uint8Array | null {
  try {
    const b = bs58.decode(b58);
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

export function verifyDetached(
  message: string,
  signatureB58: string,
  publicKeyB58: string,
): boolean {
  try {
    const sig = bs58.decode(signatureB58);
    const key = decodeKey(publicKeyB58);
    if (!key || sig.length !== 64) return false;
    return nacl.sign.detached.verify(utf8(message), sig, key);
  } catch {
    return false;
  }
}

/**
 * Wallets may return only the 64-byte signature, or the message with the
 * signature appended. Accept both; reject anything else.
 */
export function walletOutputToSignature(output: Uint8Array, message: string): string | null {
  const msg = utf8(message);
  if (output.length === 64) return bs58.encode(output);
  if (output.length === msg.length + 64 && msg.every((b, i) => output[i] === b)) {
    return bs58.encode(output.slice(msg.length));
  }
  return null;
}

export function newNonce(): string {
  return bs58.encode(nacl.randomBytes(16));
}

export function sha512b58(data: Uint8Array): string {
  return bs58.encode(nacl.hash(data));
}