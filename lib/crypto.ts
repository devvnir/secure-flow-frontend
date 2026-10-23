// Browser-side cryptography (Web Crypto API). Keys created here never leave the browser,
// except the per-upload key, which is wrapped with the enclave's RSA-OAEP public key.

export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_PLAINTEXT = 'secure-flow-vault-v1';

export function toB64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromB64(value: string): Bytes {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const randomBytes = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));

export interface VaultConfig {
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  verifier_iv: string;
  verifier_ct: string;
}

export interface Sealed {
  iv: string;
  ciphertext: string;
}

async function deriveVaultKey(passphrase: string, salt: Bytes, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(key: CryptoKey, data: Bytes, aad?: Bytes): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, ...(aad ? { additionalData: aad } : {}) }, key, data);
  return { iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function decrypt(key: CryptoKey, sealed: Sealed, aad?: Bytes): Promise<Bytes> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv), ...(aad ? { additionalData: aad } : {}) }, key, fromB64(sealed.ciphertext));
  return new Uint8Array(pt);
}

export async function createVault(passphrase: string): Promise<{ config: VaultConfig; key: CryptoKey }> {
  const salt = randomBytes(16);
  const key = await deriveVaultKey(passphrase, salt, PBKDF2_ITERATIONS);
  const verifier = await encrypt(key, encoder.encode(VERIFIER_PLAINTEXT));
  return {
    key,
    config: { kdf: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: toB64(salt), verifier_iv: verifier.iv, verifier_ct: verifier.ciphertext },
  };
}

export async function unlockVault(passphrase: string, config: VaultConfig): Promise<CryptoKey> {
  const key = await deriveVaultKey(passphrase, fromB64(config.salt), config.iterations);
  try {
    const check = await decrypt(key, { iv: config.verifier_iv, ciphertext: config.verifier_ct });
    if (decoder.decode(check) !== VERIFIER_PLAINTEXT) throw new Error();
  } catch {
    throw new Error('Incorrect passphrase');
  }
  return key;
}

export const encryptText = (key: CryptoKey, text: string) => encrypt(key, encoder.encode(text));
export const decryptText = async (key: CryptoKey, sealed: Sealed) => decoder.decode(await decrypt(key, sealed));

export interface EnclavePublicKey {
  kid: string;
  alg: string;
  spki: string;
  max_file_bytes: number;
  supported_types: string[];
}

export interface EnclaveEnvelope {
  kid: string;
  wrapped_key: string;
  iv: string;
  ciphertext: string;
  name_iv: string;
  name_ct: string;
}

export interface EnclaveResult {
  iv: string;
  ciphertext: string;
  name_iv: string;
  name_ct: string;
}

/** Encrypt a file for the enclave: fresh AES-256-GCM key, wrapped with the enclave RSA-OAEP key. */
export async function sealForEnclave(pub: EnclavePublicKey, data: Bytes, name: string) {
  const enclaveKey = await crypto.subtle.importKey('spki', fromB64(pub.spki), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
  const uploadKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const wrapped = await crypto.subtle.wrapKey('raw', uploadKey, enclaveKey, { name: 'RSA-OAEP' });
  const aad = encoder.encode(pub.kid);
  const body = await encrypt(uploadKey, data, aad);
  const sealedName = await encrypt(uploadKey, encoder.encode(name), aad);
  const envelope: EnclaveEnvelope = {
    kid: pub.kid,
    wrapped_key: toB64(wrapped),
    iv: body.iv,
    ciphertext: body.ciphertext,
    name_iv: sealedName.iv,
    name_ct: sealedName.ciphertext,
  };
  return { envelope, uploadKey, aad };
}

export async function openEnclaveResult(uploadKey: CryptoKey, aad: Bytes, result: EnclaveResult) {
  const data = await decrypt(uploadKey, { iv: result.iv, ciphertext: result.ciphertext }, aad);
  const name = decoder.decode(await decrypt(uploadKey, { iv: result.name_iv, ciphertext: result.name_ct }, aad));
  return { data, name };
}
