import { XID_RE } from 'termcore/net/handshake';
import { encodeWire, parseJsonObject, parseWire as parseBaseWire, type BaseWire, type WireExtension } from 'termcore/friends/wire';
import { parseOfferFiles, type OfferFile } from '../transfer/offer.js';

export { encodeWire };
export { reconcile, relStateFor, type ContactState, type RelState } from 'termcore/friends/state';

/** Why a receiver said no to an offer (shown to the sender). */
export type RejectReason = 'declined' | 'no_space' | 'busy' | 'too_large';
export const REJECT_REASONS: RejectReason[] = ['declined', 'no_space', 'busy', 'too_large'];

/** Why a transfer failed on the data connection. */
export type FailReason = 'hash_mismatch' | 'too_much_data' | 'file_changed' | 'disk_error' | 'read_error' | 'protocol';
export const FAIL_REASONS: FailReason[] = ['hash_mismatch', 'too_much_data', 'file_changed', 'disk_error', 'read_error', 'protocol'];

/**
 * termdrop's own messages on the friend session (the base ones – state, presence, links … –
 * come from termcore). Transfers are controlled here (offer, answer, cancel); their bytes travel
 * on a data connection of their own (see LinkMsg and transfer/link.ts).
 */
export type TransferWire =
  /** sender → receiver: files on offer, with a random transfer id */
  | { t: 'offer'; xid: string; files: OfferFile[]; total: number }
  /** receiver → sender */
  | { t: 'accept'; xid: string }
  | { t: 'reject'; xid: string; reason: RejectReason }
  /** either side: withdraws an offer or stops a running transfer */
  | { t: 'cancel'; xid: string };

export type Wire = BaseWire | TransferWire;

/** Messages on a transfer's data connection, between the file bytes. */
export type LinkMsg =
  /** sender: file `i` is complete, this is its SHA-256 (hex) */
  | { t: 'eof'; i: number; sha256: string }
  /** receiver: every file arrived and matched its hash */
  | { t: 'done' }
  /** either side: giving up, and why */
  | { t: 'failed'; reason: FailReason };

const SHA256_RE = /^[0-9a-f]{64}$/;
/** More than any offer can have (MAX_FILES). */
const MAX_INDEX = 10_000;

const isXid = (v: unknown): v is string => typeof v === 'string' && XID_RE.test(v);

/** Strictly validates termdrop's messages. Anything unexpected yields `null` and is dropped. */
export function parseTransferWire(o: Record<string, unknown>): TransferWire | null {
  switch (o.t) {
    case 'offer': {
      if (!isXid(o.xid)) return null;
      // names come back cleaned: a base name that is safe to show and to save
      const files = parseOfferFiles(o.files, o.total);
      return files ? { t: 'offer', xid: o.xid, files, total: o.total as number } : null;
    }
    case 'accept':
    case 'cancel':
      return isXid(o.xid) ? { t: o.t, xid: o.xid } : null;
    case 'reject':
      if (!isXid(o.xid)) return null;
      return { t: 'reject', xid: o.xid, reason: REJECT_REASONS.includes(o.reason as RejectReason) ? (o.reason as RejectReason) : 'declined' };
    default:
      return null;
  }
}

export const WIRE: WireExtension<TransferWire> = { parse: parseTransferWire };

/** Everything that can arrive on a friend session. */
export function parseWire(buf: Buffer): Wire | null {
  return parseBaseWire(buf, WIRE);
}

export function parseLinkMsg(buf: Buffer): LinkMsg | null {
  const o = parseJsonObject(buf);
  if (!o) return null;
  switch (o.t) {
    case 'eof':
      if (!Number.isInteger(o.i) || (o.i as number) < 0 || (o.i as number) > MAX_INDEX) return null;
      if (typeof o.sha256 !== 'string' || !SHA256_RE.test(o.sha256)) return null;
      return { t: 'eof', i: o.i as number, sha256: o.sha256 };
    case 'done':
      return { t: 'done' };
    case 'failed':
      return { t: 'failed', reason: FAIL_REASONS.includes(o.reason as FailReason) ? (o.reason as FailReason) : 'protocol' };
    default:
      return null;
  }
}
