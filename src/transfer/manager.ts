import crypto from 'node:crypto';
import fs from 'node:fs';
import { MAX_FRAME } from '../core/framing.js';
import { encodeWire, type RejectReason, type Wire } from '../core/protocol.js';
import { toEntry, type HistoryEntry } from './history.js';
import type { DataLink } from './link.js';
import type { LocalFile } from './local.js';
import { MAX_FILES, totalSize } from './offer.js';
import { receiveFiles, ReceiveError } from './receiver.js';
import { sendFiles, TransferError } from './sender.js';
import { isFinal, isPending, transition, type Transfer, type TransferEvent } from './session.js';
import { filesLabel, formatBytes, plural } from './units.js';

export interface TransferTuning {
  /** progress reaches the UI at most this often */
  progressMs: number;
  /** an accepted transfer fails if its data connection isn't up by then */
  linkTimeoutMs: number;
  /** after a data connection drops: how long to wait for a "cancel" that explains it */
  graceMs: number;
  /** a running transfer without a single byte for this long has stalled */
  stallMs: number;
  /** free space that has to remain after an incoming transfer */
  reserveBytes: number;
  /** most incoming transfers (offered or running) at once */
  maxIncoming: number;
  /** most open offers from one friend */
  maxPerPeer: number;
  /** finished transfers kept in memory (older ones are only in the history) */
  keepFinished: number;
}

export const DEFAULT_TUNING: TransferTuning = {
  progressMs: 100,
  linkTimeoutMs: 15_000,
  graceMs: 600,
  stallMs: 30_000,
  reserveBytes: 100 * 1000 * 1000,
  maxIncoming: 8,
  maxPerPeer: 5,
  keepFinished: 50,
};

export interface TransferDeps {
  send(id: string, msg: Wire): boolean;
  isOnline(id: string): boolean;
  /** accepted and not blocked – only friends can send us files */
  isFriend(id: string): boolean;
  isTrusted(id: string): boolean;
  nameOf(id: string): string;
  /** true if we opened the friend session – then we open the data connections too */
  dialsData(id: string): boolean;
  dialData(id: string, xid: string): Promise<DataLink>;
  downloadDir(): string;
  /** free bytes at a folder (null = unknown) */
  freeSpace(dir: string): number | null;
  changed(): void;
  toast(text: string, kind?: 'info' | 'success' | 'error'): void;
  /** desktop notification (only shown while the terminal is in the background) */
  notify(title: string, body: string): void;
  record(entry: HistoryEntry): void;
  now?: () => number;
  tuning?: Partial<TransferTuning>;
}

interface Runtime {
  abort: AbortController;
  link?: DataLink;
  /** outgoing: what we send */
  files?: LocalFile[];
  /** incoming: where it goes */
  dir?: string;
  bytes: number;
  fileIndex: number;
  /** when the last byte moved (stall detection) */
  movedAt: number;
  linkTimer?: NodeJS.Timeout;
}

const REJECT_TEXT: Record<RejectReason, (name: string) => string> = {
  declined: (n) => `${n} declined`,
  no_space: (n) => `${n} doesn't have enough free space`,
  busy: (n) => `${n} is busy with other transfers`,
  too_large: () => 'too many files for one offer',
};

const newXid = () => crypto.randomBytes(12).toString('base64url');

/**
 * Every transfer of this app: offers we made (one per recipient) and offers we got, their
 * answers, data connections and progress. Talks to the network only through `deps`, so it
 * runs in tests without sockets for its decisions; the bytes go through sender.ts/receiver.ts.
 */
export class TransferManager {
  private transfers = new Map<string, Transfer>();
  private runtime = new Map<string, Runtime>();
  private ticker: NodeJS.Timeout | null = null;
  private readonly t: TransferTuning;
  private readonly now: () => number;

  constructor(private readonly deps: TransferDeps) {
    this.t = { ...DEFAULT_TUNING, ...deps.tuning };
    this.now = deps.now ?? Date.now;
  }

  // ───────────── Queries ─────────────

  get(xid: string): Transfer | undefined {
    return this.transfers.get(xid);
  }

  /** All transfers of this session, newest first. */
  list(): Transfer[] {
    return [...this.transfers.values()].reverse();
  }

  /** Offers waiting for our answer, newest first. */
  incomingOffers(): Transfer[] {
    return this.list().filter((t) => t.dir === 'in' && t.status === 'offered');
  }

  /** Transfers that haven't ended yet, except offers waiting for our answer. */
  open(): Transfer[] {
    return this.list().filter((t) => !isFinal(t.status) && t.status !== 'offered');
  }

  /** A running or about-to-run transfer with this friend (they shouldn't be removed silently). */
  busyWith(id: string): boolean {
    return this.list().some((t) => t.peerId === id && !isFinal(t.status));
  }

  // ───────────── Sending ─────────────

  /**
   * Offers `files` to each recipient – one transfer per recipient, so a slow or declining one
   * never holds up the others. Returns the transfers that went out.
   */
  offer(files: LocalFile[], recipients: string[]): Transfer[] {
    if (!files.length) throw new Error('No files selected');
    if (files.length > MAX_FILES) throw new Error(`At most ${MAX_FILES} files at once – zip them first`);
    const wireFiles = files.map((f) => ({ name: f.name, size: f.size }));
    const total = totalSize(wireFiles);
    // the offer is one encrypted frame – very long names in very big selections don't fit
    if (encodeWire({ t: 'offer', xid: newXid(), files: wireFiles, total }).length > MAX_FRAME - 1024) {
      throw new Error('Too many files with long names for one offer – zip them first');
    }
    const batch = newXid();
    const out: Transfer[] = [];
    for (const id of recipients) {
      if (!this.deps.isFriend(id) || !this.deps.isOnline(id)) continue;
      const xid = newXid();
      const t: Transfer = {
        xid,
        dir: 'out',
        peerId: id,
        peerName: this.deps.nameOf(id),
        files: wireFiles,
        total,
        batch,
        status: 'waiting',
        createdAt: this.now(),
        bytes: 0,
        fileIndex: 0,
        speed: 0,
        paths: files.map((f) => f.path),
      };
      this.transfers.set(xid, t);
      this.runtime.set(xid, { abort: new AbortController(), files, bytes: 0, fileIndex: 0, movedAt: this.now() });
      if (this.deps.send(id, { t: 'offer', xid, files: wireFiles, total })) out.push(t);
      else this.apply(xid, { type: 'failed', text: `${t.peerName} went offline`, at: this.now() });
    }
    this.trim();
    this.deps.changed();
    return out;
  }

  // ───────────── Receiving ─────────────

  accept(xid: string, auto = false): void {
    const t = this.transfers.get(xid);
    if (!t || t.dir !== 'in' || t.status !== 'offered') return;
    if (!this.deps.isOnline(t.peerId)) {
      this.apply(xid, { type: 'expired', text: `${t.peerName} went offline`, at: this.now() });
      this.deps.toast(`${t.peerName} is offline – the offer expired`, 'error');
      return;
    }
    const dir = this.deps.downloadDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      this.deps.toast(`Can't use ${dir}: ${(err as Error).message} – pick another folder with /folder`, 'error');
      return;
    }
    // space may have run out since the offer arrived
    if (!this.hasSpace(t.total, dir, xid)) {
      this.reject(t, 'no_space');
      this.deps.toast(`Not enough free space for ${filesLabel(t.files)} (${formatBytes(t.total)})`, 'error');
      return;
    }
    const rt = this.runtime.get(xid)!;
    rt.dir = dir;
    this.apply(xid, { type: 'accepted', auto });
    this.deps.send(t.peerId, { t: 'accept', xid });
    this.connect(xid);
  }

  decline(xid: string): void {
    const t = this.transfers.get(xid);
    if (!t || t.dir !== 'in' || t.status !== 'offered') return;
    this.reject(t, 'declined');
  }

  /** Stops a transfer (either direction) or withdraws an offer we made. */
  cancel(xid: string): void {
    const t = this.transfers.get(xid);
    if (!t || isFinal(t.status)) return;
    if (t.dir === 'in' && t.status === 'offered') return this.decline(xid);
    this.deps.send(t.peerId, { t: 'cancel', xid });
    this.apply(xid, { type: 'cancelled', by: 'me', text: 'cancelled by you', at: this.now() });
  }

  // ───────────── Network events ─────────────

  onWire(from: string, m: Wire): void {
    switch (m.t) {
      case 'offer':
        return this.onOffer(from, m);
      case 'accept': {
        const t = this.mine(m.xid, from, 'out');
        if (!t || t.status !== 'waiting') return;
        this.apply(m.xid, { type: 'accepted' });
        this.connect(m.xid);
        return;
      }
      case 'reject': {
        const t = this.mine(m.xid, from, 'out');
        if (!t || t.status !== 'waiting') return;
        this.apply(m.xid, { type: 'rejected', reason: m.reason, text: REJECT_TEXT[m.reason](t.peerName), at: this.now() });
        this.deps.toast(`${REJECT_TEXT[m.reason](t.peerName)} – ${filesLabel(t.files)}`, m.reason === 'declined' ? 'info' : 'error');
        return;
      }
      case 'cancel': {
        const t = this.mine(m.xid, from);
        if (!t || isFinal(t.status)) return;
        const offer = t.dir === 'in' && t.status === 'offered';
        this.apply(m.xid, { type: 'cancelled', by: 'peer', text: offer ? 'withdrawn' : `cancelled by ${t.peerName}`, at: this.now() });
        this.deps.toast(offer ? `${t.peerName} withdrew the offer` : `${t.peerName} cancelled ${filesLabel(t.files)}`, offer ? 'info' : 'error');
        return;
      }
      default:
    }
  }

  /** A data connection came in; it's only taken if it belongs to a transfer with this peer. */
  onLink(link: DataLink): void {
    const t = this.transfers.get(link.xid);
    const rt = this.runtime.get(link.xid);
    const expected = t && rt && !rt.link && t.peerId === link.peerId && (t.status === 'connecting' || (t.dir === 'out' && t.status === 'waiting'));
    if (!expected) {
      link.destroy('Unexpected data connection');
      return;
    }
    this.run(link.xid, link);
  }

  /** The friend session ended: unanswered offers expire. Running transfers live on their own connection. */
  onPeerOffline(id: string): void {
    for (const t of this.list()) {
      if (t.peerId !== id) continue;
      if (isPending(t.status)) {
        this.apply(t.xid, { type: 'expired', text: `${t.peerName} went offline`, at: this.now() });
      }
    }
  }

  /** App quits: tell everyone, stop everything. */
  stop(): void {
    for (const t of this.list()) {
      if (isFinal(t.status)) continue;
      if (t.dir === 'in' && t.status === 'offered') this.deps.send(t.peerId, { t: 'reject', xid: t.xid, reason: 'busy' });
      else this.deps.send(t.peerId, { t: 'cancel', xid: t.xid });
      this.apply(t.xid, { type: 'cancelled', by: 'me', text: 'termdrop was closed', at: this.now() });
    }
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  // ───────────── Internals ─────────────

  private mine(xid: string, from: string, dir?: 'in' | 'out'): Transfer | undefined {
    const t = this.transfers.get(xid);
    return t && t.peerId === from && (!dir || t.dir === dir) ? t : undefined;
  }

  private onOffer(from: string, m: Extract<Wire, { t: 'offer' }>): void {
    // only friends can send files; strangers and blocked peers get no answer at all
    if (!this.deps.isFriend(from) || this.transfers.has(m.xid)) return;
    const name = this.deps.nameOf(from);
    const t: Transfer = {
      xid: m.xid,
      dir: 'in',
      peerId: from,
      peerName: name,
      files: m.files,
      total: m.total,
      status: 'offered',
      createdAt: this.now(),
      bytes: 0,
      fileIndex: 0,
      speed: 0,
    };
    this.transfers.set(m.xid, t);
    this.runtime.set(m.xid, { abort: new AbortController(), bytes: 0, fileIndex: 0, movedAt: this.now() });
    const label = `${plural(m.files.length, 'file')} · ${formatBytes(m.total)}`;

    const incoming = this.list().filter((x) => x.dir === 'in' && !isFinal(x.status) && x.xid !== m.xid);
    if (incoming.length >= this.t.maxIncoming || incoming.filter((x) => x.peerId === from && x.status === 'offered').length >= this.t.maxPerPeer) {
      this.reject(t, 'busy');
      return;
    }
    // not enough space: declined automatically, even for trusted friends
    if (!this.hasSpace(m.total, this.deps.downloadDir(), m.xid)) {
      this.reject(t, 'no_space');
      this.deps.toast(`Declined ${name}'s ${label} – not enough free space`, 'error');
      this.deps.notify('termdrop', `Declined ${name}'s ${label} – not enough free space`);
      return;
    }
    if (this.deps.isTrusted(from)) {
      this.deps.toast(`Receiving ${filesLabel(m.files)} from ${name} (${formatBytes(m.total)})`, 'info');
      this.deps.notify('termdrop', `Receiving ${filesLabel(m.files)} from ${name}`);
      this.accept(m.xid, true);
      return;
    }
    this.deps.toast(`${name} wants to send you ${label}`, 'info');
    this.deps.notify('termdrop', `${name} wants to send you ${label}`);
    this.deps.changed();
  }

  private reject(t: Transfer, reason: RejectReason): void {
    this.deps.send(t.peerId, { t: 'reject', xid: t.xid, reason });
    const text = reason === 'declined' ? 'declined by you' : reason === 'no_space' ? 'not enough free space' : 'too busy';
    this.apply(t.xid, { type: 'rejected', reason, text, at: this.now() });
  }

  /** Room for `bytes` more at `dir`, counting what running incoming transfers still need. */
  private hasSpace(bytes: number, dir: string, except: string): boolean {
    const free = this.deps.freeSpace(dir);
    if (free === null) return true;
    let pending = 0;
    for (const t of this.transfers.values()) {
      if (t.xid !== except && t.dir === 'in' && (t.status === 'connecting' || t.status === 'active')) pending += t.total - t.bytes;
    }
    return free - pending - this.t.reserveBytes >= bytes;
  }

  /** After both said yes: whoever opened the friend session opens the data connection. */
  private connect(xid: string): void {
    const t = this.transfers.get(xid)!;
    const rt = this.runtime.get(xid)!;
    rt.linkTimer = setTimeout(() => {
      const cur = this.transfers.get(xid);
      if (cur && (cur.status === 'connecting' || cur.status === 'waiting') && !rt.link) {
        this.deps.send(t.peerId, { t: 'cancel', xid });
        this.apply(xid, { type: 'failed', text: `couldn't connect to ${t.peerName}`, at: this.now() });
      }
    }, this.t.linkTimeoutMs);
    rt.linkTimer.unref();
    if (!this.deps.dialsData(t.peerId)) return; // the other side dials us (see onLink)
    this.deps.dialData(t.peerId, xid).then(
      (link) => {
        const cur = this.transfers.get(xid);
        if (!cur || cur.status !== 'connecting' || rt.link) return link.destroy('Not needed anymore');
        this.run(xid, link);
      },
      (err: Error) => {
        this.deps.send(t.peerId, { t: 'cancel', xid });
        this.apply(xid, { type: 'failed', text: `couldn't connect to ${t.peerName} (${err.message})`, at: this.now() });
      },
    );
  }

  /** The data connection is up: pump the bytes. */
  private run(xid: string, link: DataLink): void {
    const t = this.transfers.get(xid)!;
    const rt = this.runtime.get(xid)!;
    rt.link = link;
    if (rt.linkTimer) clearTimeout(rt.linkTimer);
    rt.movedAt = this.now();
    this.apply(xid, { type: 'linked', at: this.now() });
    this.startTicker();
    const opts = {
      signal: rt.abort.signal,
      onProgress: (bytes: number, fileIndex: number) => {
        if (bytes > rt.bytes) rt.movedAt = this.now();
        rt.bytes = bytes;
        rt.fileIndex = fileIndex;
      },
    };
    if (t.dir === 'out') {
      sendFiles(link, rt.files!, opts).then(
        () => {
          this.apply(xid, { type: 'completed', at: this.now() });
          this.deps.toast(`${t.peerName} received ${filesLabel(t.files)}`, 'success');
        },
        (err) => this.failed(xid, err),
      );
    } else {
      receiveFiles(link, t.files, rt.dir!, opts).then(
        ({ saved }) => {
          this.apply(xid, { type: 'completed', at: this.now(), saved });
          this.deps.toast(`Received ${filesLabel(t.files)} from ${t.peerName}`, 'success');
          this.deps.notify('termdrop', `Received ${filesLabel(t.files)} from ${t.peerName}`);
        },
        (err) => this.failed(xid, err),
      );
    }
  }

  private failed(xid: string, err: unknown): void {
    const t = this.transfers.get(xid);
    if (!t) return;
    const saved = err instanceof ReceiveError ? err.saved : undefined;
    if (isFinal(t.status)) {
      // cancelled meanwhile: keep the files that were already complete in the record
      if (saved?.length && !t.saved) this.transfers.set(xid, { ...t, saved });
      return;
    }
    const e = err instanceof TransferError ? err : new TransferError('local', null, (err as Error).message);
    if (e.kind === 'cancelled') return; // cancel() already set the state
    const fail = () => this.apply(xid, { type: 'failed', text: e.kind === 'connection' ? 'connection lost' : e.message, at: this.now(), saved });
    if (e.kind !== 'connection') {
      fail();
      this.deps.toast(`${filesLabel(t.files)} ${t.dir === 'out' ? 'to' : 'from'} ${t.peerName} failed: ${e.message}`, 'error');
      return;
    }
    // a dropped connection is often the other side cancelling – give its message a moment
    setTimeout(() => {
      const cur = this.transfers.get(xid);
      if (!cur || isFinal(cur.status)) return;
      fail();
      this.deps.toast(`Lost the connection to ${t.peerName} – ${filesLabel(t.files)} failed`, 'error');
    }, this.t.graceMs).unref();
  }

  private apply(xid: string, e: TransferEvent): void {
    const prev = this.transfers.get(xid);
    if (!prev) return;
    const next = transition(prev, e);
    if (next === prev) return;
    this.transfers.set(xid, next);
    if (isFinal(next.status)) this.ended(next);
    if (e.type !== 'progress') this.deps.changed();
  }

  private ended(t: Transfer): void {
    const rt = this.runtime.get(t.xid);
    if (rt) {
      if (rt.linkTimer) clearTimeout(rt.linkTimer);
      if (t.status !== 'done') rt.abort.abort();
      this.runtime.delete(t.xid);
    }
    // an offer someone withdrew before we answered isn't worth a line in the history
    if (!(t.dir === 'in' && t.cancelledBy === 'peer' && !t.startedAt && t.reason === 'withdrawn')) this.deps.record(toEntry(t, this.now()));
    this.trim();
  }

  /** Forget old finished transfers (they're in the history). */
  private trim(): void {
    const finished = [...this.transfers.values()].filter((t) => isFinal(t.status));
    for (const t of finished.slice(0, Math.max(0, finished.length - this.t.keepFinished))) this.transfers.delete(t.xid);
  }

  /** Samples progress for the UI while something runs; stops when nothing does (idle = no redraws). */
  private startTicker(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.tick(), this.t.progressMs);
    this.ticker.unref();
  }

  private tick(): void {
    const now = this.now();
    let changed = false;
    let running = false;
    for (const [xid, rt] of this.runtime) {
      const t = this.transfers.get(xid);
      if (!t || t.status !== 'active') continue;
      running = true;
      const before = this.transfers.get(xid);
      this.apply(xid, { type: 'progress', bytes: rt.bytes, fileIndex: rt.fileIndex, at: now });
      if (this.transfers.get(xid) !== before) changed = true;
      if (now - rt.movedAt > this.t.stallMs) {
        this.deps.send(t.peerId, { t: 'cancel', xid });
        rt.link?.destroy('Stalled');
        this.apply(xid, { type: 'failed', text: 'stalled – no data for a while', at: now });
        changed = true;
      }
    }
    if (changed) this.deps.changed();
    if (!running && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }
}
