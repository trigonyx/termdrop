import type { Paths } from '../core/paths.js';
import { appendJsonl, readJsonl, writeJsonlAtomic } from 'termcore/app/storage';
import type { OfferFile } from './offer.js';
import type { Dir, FinalStatus, Transfer } from './session.js';

/** One line of transfers.jsonl: a finished transfer. */
export interface HistoryEntry {
  xid: string;
  /** when it ended */
  ts: number;
  dir: Dir;
  peerId: string;
  peerName: string;
  files: OfferFile[];
  total: number;
  /** bytes that actually went over */
  bytes: number;
  result: FinalStatus;
  reason?: string;
  /** from the first byte (or the offer, if it never started) to the end */
  ms: number;
  /** incoming: where the files were saved */
  saved?: string[];
  /** outgoing: the local files that were sent */
  paths?: string[];
  auto?: boolean;
}

export interface Totals {
  sentBytes: number;
  sentFiles: number;
  receivedBytes: number;
  receivedFiles: number;
}

export function toEntry(t: Transfer, now: number): HistoryEntry {
  const end = t.endedAt ?? now;
  return {
    xid: t.xid,
    ts: end,
    dir: t.dir,
    peerId: t.peerId,
    peerName: t.peerName,
    files: t.files,
    total: t.total,
    bytes: t.bytes,
    result: t.status as FinalStatus,
    ...(t.reason ? { reason: t.reason } : {}),
    ms: Math.max(0, end - (t.startedAt ?? t.createdAt)),
    ...(t.saved?.length ? { saved: t.saved } : {}),
    ...(t.paths?.length ? { paths: t.paths } : {}),
    ...(t.auto ? { auto: true } : {}),
  };
}

const isEntry = (e: unknown): e is HistoryEntry => {
  const o = e as HistoryEntry;
  return !!o && typeof o.xid === 'string' && typeof o.ts === 'number' && (o.dir === 'in' || o.dir === 'out') && Array.isArray(o.files);
};

/** The transfer history: appended to as transfers end, read once at launch. */
export class HistoryBook {
  private entries: HistoryEntry[];

  constructor(private readonly paths: Paths) {
    this.entries = readJsonl<unknown>(paths.transfers).filter(isEntry);
  }

  add(entry: HistoryEntry): void {
    this.entries.push(entry);
    try {
      appendJsonl(this.paths.transfers, entry);
    } catch {
      // the history must never break a transfer
    }
  }

  /** Newest first. */
  recent(n: number): HistoryEntry[] {
    return this.entries.slice(-n).reverse();
  }

  all(): HistoryEntry[] {
    return this.entries;
  }

  /** A friend has a new id (they migrated to ~/.termhub): their past transfers move with them. */
  rekey(oldId: string, newId: string): void {
    if (!this.entries.some((e) => e.peerId === oldId)) return;
    this.entries = this.entries.map((e) => (e.peerId === oldId ? { ...e, peerId: newId } : e));
    writeJsonlAtomic(this.paths.transfers, this.entries);
  }

  get(xid: string): HistoryEntry | undefined {
    return this.entries.find((e) => e.xid === xid);
  }

  totals(): Totals {
    const t: Totals = { sentBytes: 0, sentFiles: 0, receivedBytes: 0, receivedFiles: 0 };
    for (const e of this.entries) {
      if (e.result !== 'done') continue;
      if (e.dir === 'out') {
        t.sentBytes += e.total;
        t.sentFiles += e.files.length;
      } else {
        t.receivedBytes += e.total;
        t.receivedFiles += e.files.length;
      }
    }
    return t;
  }
}
