import type { RejectReason } from '../core/protocol.js';
import type { OfferFile } from './offer.js';

/**
 * One transfer to or from one friend, as a pure state machine (no I/O, no clock of its own):
 *
 *   out:  waiting ──accepted──▶ connecting ──linked──▶ active ──completed──▶ done
 *   in:   offered ──accepted──▶ connecting ──linked──▶ active ──completed──▶ done
 *
 * From any open state: rejected → declined, cancelled → cancelled, failed → failed,
 * expired → expired (only before it started). Final states never change again.
 */
export type Dir = 'out' | 'in';
export type Status = 'waiting' | 'offered' | 'connecting' | 'active' | 'done' | 'declined' | 'cancelled' | 'failed' | 'expired';
export type FinalStatus = Extract<Status, 'done' | 'declined' | 'cancelled' | 'failed' | 'expired'>;

export interface Transfer {
  xid: string;
  dir: Dir;
  peerId: string;
  peerName: string;
  files: OfferFile[];
  total: number;
  /** outgoing transfers started together (one per recipient) share this */
  batch?: string;
  status: Status;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  /** bytes transferred so far */
  bytes: number;
  /** the file being transferred */
  fileIndex: number;
  /** smoothed speed in bytes per second (0 until there's a sample) */
  speed: number;
  /** when `bytes` last grew (for the speed and stall detection) */
  sampledAt?: number;
  /** why it was declined / failed / cancelled, in words */
  reason?: string;
  rejectReason?: RejectReason;
  cancelledBy?: 'me' | 'peer';
  /** accepted automatically (trusted friend) */
  auto?: boolean;
  /** incoming: where the files were saved */
  saved?: string[];
  /** outgoing: the local files */
  paths?: string[];
  /** outgoing, waiting: they don't have termdrop open – told in another app, offered once it connects */
  parked?: boolean;
}

export type TransferEvent =
  | { type: 'accepted'; auto?: boolean }
  | { type: 'rejected'; reason: RejectReason; text: string; at: number }
  | { type: 'linked'; at: number }
  | { type: 'progress'; bytes: number; fileIndex: number; at: number }
  | { type: 'completed'; at: number; saved?: string[] }
  | { type: 'cancelled'; by: 'me' | 'peer'; text: string; at: number; saved?: string[] }
  | { type: 'failed'; text: string; at: number; saved?: string[] }
  | { type: 'expired'; text: string; at: number };

const FINAL: Status[] = ['done', 'declined', 'cancelled', 'failed', 'expired'];
export const isFinal = (s: Status): s is FinalStatus => FINAL.includes(s);
/** Not answered yet. */
export const isPending = (s: Status) => s === 'waiting' || s === 'offered';

/** Time constant of the speed's smoothing: the shown speed follows changes within ~2 s. */
const SPEED_TAU = 2000;

/** Exponentially smoothed speed, weighted by the time between samples. */
export function smoothSpeed(prev: number, deltaBytes: number, dtMs: number): number {
  if (dtMs <= 0) return prev;
  const inst = (deltaBytes * 1000) / dtMs;
  if (prev <= 0) return inst;
  const alpha = 1 - Math.exp(-dtMs / SPEED_TAU);
  return prev + (inst - prev) * alpha;
}

/** Seconds left at the current speed (null while unknown). */
export function secondsLeft(t: Pick<Transfer, 'total' | 'bytes' | 'speed'>): number | null {
  if (t.speed <= 0) return null;
  return Math.max(0, (t.total - t.bytes) / t.speed);
}

export function transition(t: Transfer, e: TransferEvent): Transfer {
  if (isFinal(t.status)) return t;
  switch (e.type) {
    case 'accepted':
      return isPending(t.status) ? { ...t, status: 'connecting', ...(e.auto ? { auto: true } : {}) } : t;
    case 'rejected':
      return isPending(t.status) ? { ...t, status: 'declined', rejectReason: e.reason, reason: e.text, endedAt: e.at } : t;
    case 'linked':
      // the sender may see the receiver's data connection before its "accept" message
      return t.status === 'connecting' || (t.dir === 'out' && t.status === 'waiting')
        ? { ...t, status: 'active', startedAt: e.at, sampledAt: e.at }
        : t;
    case 'progress': {
      if (t.status !== 'active' || e.bytes < t.bytes) return t;
      const dt = e.at - (t.sampledAt ?? e.at);
      // nothing moved: the speed only sinks once a whole second went by without data
      if (e.bytes === t.bytes && e.fileIndex === t.fileIndex && dt < 1000) return t;
      return { ...t, bytes: Math.min(e.bytes, t.total), fileIndex: e.fileIndex, speed: smoothSpeed(t.speed, e.bytes - t.bytes, dt), sampledAt: e.at };
    }
    case 'completed':
      return t.status === 'active' ? { ...t, status: 'done', bytes: t.total, endedAt: e.at, ...(e.saved ? { saved: e.saved } : {}) } : t;
    case 'cancelled':
      return { ...t, status: 'cancelled', cancelledBy: e.by, reason: e.text, endedAt: e.at, ...(e.saved?.length ? { saved: e.saved } : {}) };
    case 'failed':
      return { ...t, status: 'failed', reason: e.text, endedAt: e.at, ...(e.saved?.length ? { saved: e.saved } : {}) };
    case 'expired':
      return isPending(t.status) ? { ...t, status: 'expired', reason: e.text, endedAt: e.at } : t;
  }
}
