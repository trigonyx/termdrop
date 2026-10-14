import crypto, { type KeyObject } from 'node:crypto';
import type { Paths } from './paths.js';
import { readJson, writeJsonAtomic } from './storage.js';

export interface Identity {
  /** Fingerprint of the public key – the permanent, unforgeable ID. */
  id: string;
  publicRaw: Buffer;
  publicKey: KeyObject;
  privateKey: KeyObject;
}

export interface Config {
  name: string;
  port?: number;
  /** Desktop notifications while the terminal is in the background (default on). */
  notifications?: boolean;
  /** Where received files are saved (default ~/Downloads, /folder changes it). */
  downloadDir?: string;
}

interface IdentityFile {
  v: 1;
  publicKey: string; // base64url, raw 32 bytes
  privateKey: string; // base64url, raw 32 bytes (JWK "d")
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** 20 base32 characters = 100 bits of the SHA-256 of the public key. */
export function fingerprint(publicRaw: Buffer): string {
  return base32(crypto.createHash('sha256').update(publicRaw).digest()).slice(0, 20);
}

/** "ABCDEFGH…" → "ABCD-EFGH" (short) or all groups (full). */
export function formatId(id: string, full = false): string {
  const groups = (full ? id : id.slice(0, 8)).match(/.{1,4}/g) ?? [];
  return groups.join('-');
}

/** Safety code like Signal's: both sides compare it to rule out a man-in-the-middle. */
export function safetyCode(a: Buffer, b: Buffer): string {
  const [first, second] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  const digest = crypto.createHash('sha256').update(first).update(second).digest();
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) groups.push(String(digest.readUInt32BE(i * 4) % 100000).padStart(5, '0'));
  return groups.join(' ');
}

export function publicKeyFromRaw(raw: Buffer): KeyObject {
  return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' });
}

function fromFile(file: IdentityFile): Identity {
  const publicRaw = Buffer.from(file.publicKey, 'base64url');
  const privateKey = crypto.createPrivateKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: file.publicKey, d: file.privateKey },
    format: 'jwk',
  });
  return { id: fingerprint(publicRaw), publicRaw, publicKey: publicKeyFromRaw(publicRaw), privateKey };
}

export function loadOrCreateIdentity(paths: Paths): Identity {
  const existing = readJson<IdentityFile | null>(paths.identity, null);
  if (existing?.v === 1 && existing.publicKey && existing.privateKey) return fromFile(existing);

  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = privateKey.export({ format: 'jwk' });
  const file: IdentityFile = { v: 1, publicKey: jwk.x!, privateKey: jwk.d! };
  writeJsonAtomic(paths.identity, file);
  return fromFile(file);
}

export function hasIdentity(paths: Paths): boolean {
  return readJson<IdentityFile | null>(paths.identity, null) !== null;
}

export function loadConfig(paths: Paths): Config | null {
  const cfg = readJson<Config | null>(paths.config, null);
  return cfg && typeof cfg.name === 'string' && cfg.name ? cfg : null;
}

export function saveConfig(paths: Paths, cfg: Config): void {
  writeJsonAtomic(paths.config, cfg);
}
