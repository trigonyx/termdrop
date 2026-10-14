import { XID_RE } from './handshake.js';
import { cleanName, sanitizeText } from './sanitize.js';
import { parseOfferFiles, type OfferFile } from '../transfer/offer.js';

/** How one side sees the relationship. `outgoing` = "I want to be friends with you". */
export type RelState = 'accepted' | 'outgoing' | 'none';

/** Why a receiver said no to an offer (shown to the sender). */
export type RejectReason = 'declined' | 'no_space' | 'busy' | 'too_large';
export const REJECT_REASONS: RejectReason[] = ['declined', 'no_space', 'busy', 'too_large'];

/** Why a transfer failed on the data connection. */
export type FailReason = 'hash_mismatch' | 'too_much_data' | 'file_changed' | 'disk_error' | 'read_error' | 'protocol';
export const FAIL_REASONS: FailReason[] = ['hash_mismatch', 'too_much_data', 'file_changed', 'disk_error', 'read_error', 'protocol'];

/**
 * Messages on the friend session. Transfers are controlled here (offer, answer, cancel); their
 * bytes travel on a data connection of their own (see LinkMsg and transfer/link.ts).
 */
export type Wire =
  | { t: 'state'; name: string; state: RelState; port: number }
  | { t: 'decline' }
  /** Terminal in the background (`away`) or back in front */
  | { t: 'presence'; away: boolean }
  /** sender → receiver: files on offer, with a random transfer id */
  | { t: 'offer'; xid: string; files: OfferFile[]; total: number }
  /** receiver → sender */
  | { t: 'accept'; xid: string }
  | { t: 'reject'; xid: string; reason: RejectReason }
  /** either side: withdraws an offer or stops a running transfer */
  | { t: 'cancel'; xid: string }
  | { t: 'ping' }
  | { t: 'pong' }
  | { t: 'bye' };

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

function parseJson(buf: Buffer): Record<string, unknown> | null {
  let o: unknown;
  try {
    o = JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
  return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
}

/** Strictly validates incoming frames. Anything unexpected yields `null` and is dropped. */
export function parseWire(buf: Buffer): Wire | null {
  const o = parseJson(buf);
  if (!o) return null;

  switch (o.t) {
    case 'state': {
      const port = Number(o.port);
      if (!REL_STATES.includes(o.state as RelState)) return null;
      return {
        t: 'state',
        name: cleanName(o.name),
        state: o.state as RelState,
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 0,
      };
    }
    case 'presence':
      if (typeof o.away !== 'boolean') return null;
      return { t: 'presence', away: o.away };
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
    case 'decline':
    case 'ping':
    case 'pong':
    case 'bye':
      return { t: o.t };
    default:
      return null;
  }
}

export function parseLinkMsg(buf: Buffer): LinkMsg | null {
  const o = parseJson(buf);
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

export function encodeWire(msg: Wire): Buffer {
  return Buffer.from(JSON.stringify(msg), 'utf8');
}

/** For log lines and the like: never let a peer's text through unfiltered. */
export const cleanReason = (text: string) => sanitizeText(text).replace(/\s+/g, ' ').trim().slice(0, 200);

const REL_STATES: RelState[] = ['accepted', 'outgoing', 'none'];

export type ContactState = 'accepted' | 'outgoing' | 'incoming' | 'declined' | 'blocked';

/**
 * Reconciles our view with the peer's once connected or whenever a state changes.
 * Result: our new state (or `null` = not a friend).
 */
export function reconcile(mine: ContactState | null, theirs: RelState): ContactState | null {
  const peerWants = theirs === 'accepted' || theirs === 'outgoing';
  switch (mine) {
    case 'blocked':
      return 'blocked';
    case 'accepted':
    case 'outgoing':
      // Both want it → friends. If the peer removed us, it becomes a request again.
      return peerWants ? 'accepted' : 'outgoing';
    case 'incoming':
      return peerWants ? 'incoming' : null;
    case 'declined':
      return peerWants ? 'incoming' : 'declined';
    case null:
      return peerWants ? 'incoming' : null;
  }
}

/** What we tell the peer about our view. */
export function relStateFor(state: ContactState | null): RelState {
  return state === 'accepted' || state === 'outgoing' ? state : 'none';
}
