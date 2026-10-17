import fs from 'node:fs';
import path from 'node:path';
import { Toasts, type NoteKind, type Toast } from 'termcore/app/toasts';
import { displayName, type ContactOf } from 'termcore/friends/book';
import { appendLog, FriendNet, type FriendEvent, type PeerPresence } from 'termcore/friends/net';
import { noticeLine } from 'termcore/friends/notices';
import type { Status } from 'termcore/friends/profile';
import type { ContactState } from 'termcore/friends/state';
import type { DiscoveredPeer, DiscoveryOptions } from 'termcore/net/discovery';
import type { Settings } from 'termcore/store/files';
import { Hub } from 'termcore/store/hub';
import { setAccent, setPersonColors } from 'termcore/ui/theme';
import { APP } from '../app.js';
import { HistoryBook, type HistoryEntry, type Totals } from '../transfer/history.js';
import { DataLink } from '../transfer/link.js';
import { freeSpace, inspectPaths, type LocalFile, type Rejected } from '../transfer/local.js';
import { TransferManager, type TransferTuning } from '../transfer/manager.js';
import type { Transfer } from '../transfer/session.js';
import { readConfig, writeConfig } from './config.js';
import { defaultDownloadDir, type Paths } from './paths.js';
import { WIRE, type TransferWire } from './protocol.js';

export type { NoteKind, Toast };

/** termdrop's own fields on a friend (in friends.json under `apps.termdrop`). */
export interface TermdropFields {
  /** Offers from trusted friends are accepted automatically (t / /trust). */
  trusted?: boolean;
}

export type Contact = ContactOf<TermdropFields>;

export interface StoreOptions {
  paths: Paths;
  port?: number;
  discovery?: boolean;
  discoveryPort?: number;
  /** Simulated network for discovery (tests). */
  discoveryOptions?: Pick<DiscoveryOptions, 'transport' | 'interfaces'>;
  dialIntervalMs?: number;
  debug?: boolean;
  /** Desktop notification sink (defaults to the OS notifier). */
  notify?: (title: string, body: string) => void;
  /** Free space at a folder (tests fake a full disk). */
  freeSpace?: (dir: string) => number | null;
  /** Transfer timings and limits. */
  tuning?: Partial<TransferTuning>;
}

export interface FriendView extends Contact {
  display: string;
  online: boolean;
  /** connected, but their terminal is in the background */
  away: boolean;
  /** a transfer with them is running */
  busy: boolean;
  /** their status (only while connected) */
  status: Status;
  statusMsg?: string;
  /** not online in termdrop, but in these apps of theirs (an offer waits for them to open termdrop) */
  elsewhere: string[];
}

export type RequestEntry = { kind: 'friend'; friend: FriendView } | { kind: 'offer'; offer: Transfer };

export interface DashboardData {
  /** friend requests and incoming files */
  requests: RequestEntry[];
  /** accepted friends (online first), then pending, declined and blocked ones */
  friends: FriendView[];
  /** termdrop users on the network who aren't friends yet */
  nearby: DiscoveredPeer[];
}

/** Files handed to the app to send (command line, `termdrop <files>` from another shell, /send). */
export interface SendRequest {
  seq: number;
  files: LocalFile[];
  rejected: Rejected[];
  /** preselected recipient (`--to`) */
  to?: string;
  /** shell = command line / another shell (straight to the recipients), drop = dropped onto the window */
  source: 'shell' | 'drop' | 'command';
  /** go straight to choosing recipients */
  recipients?: boolean;
}

/** How long a notice about files waiting is worth delivering (the offer itself waits 30 minutes). */
const OFFER_NOTICE_TTL = 30 * 60_000;

const FRIEND_ORDER: Record<ContactState, number> = { accepted: 0, outgoing: 1, declined: 2, incoming: 3, blocked: 4 };

/**
 * Central app logic: friends (termcore's FriendNet on the shared ~/.termhub) plus the transfer
 * manager. Exposes a subscribable state to the UI and also runs without a UI (tests). Everything
 * about transfers lives in transfer/.
 */
export class AppStore {
  readonly net: FriendNet<TransferWire, TermdropFields>;
  readonly hub: Hub;
  readonly transfers: TransferManager;
  readonly history: HistoryBook;
  readonly paths: Paths;
  private readonly toasts: Toasts;
  private listeners = new Set<() => void>();
  private notifyQueued = false;
  private started = false;
  private sendSeq = 0;
  version = 0;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable: string | null = null;
  /** The latest files handed to the app; the UI opens the send flow for it. */
  sendRequest: SendRequest | null = null;

  constructor(private readonly opts: StoreOptions) {
    this.paths = opts.paths;
    this.hub = new Hub(opts.paths.hub);
    this.history = new HistoryBook(opts.paths);
    this.toasts = new Toasts(() => this.changed());
    this.net = new FriendNet<TransferWire, TermdropFields>({
      app: APP,
      paths: opts.paths,
      hub: this.hub,
      port: opts.port ?? readConfig(opts.paths).port,
      discovery: opts.discovery,
      discoveryPort: opts.discoveryPort,
      discoveryOptions: opts.discoveryOptions,
      dialIntervalMs: opts.dialIntervalMs,
      notify: opts.notify,
      wire: WIRE,
      hooks: {
        changed: () => this.changed(),
        log: (l) => this.log(l),
        event: (e) => this.onEvent(e),
        message: (s, m) => this.transfers.onWire(s.peerId, m),
        offline: (id) => this.transfers.onPeerOffline(id),
        session: (s) => this.transfers.onPeerOnline(s.peerId),
        // offers that came as notices: the real one follows once the sender's termdrop connects
        takeNotices: () => {},
        // a friendship that has to be confirmed again starts without trust
        statePatch: (prev, next) => (prev === 'accepted' && next !== 'accepted' ? { trusted: false } : {}),
        purpose: ({ fs, hs, xid }) => this.transfers.onLink(new DataLink(fs, hs, xid)),
        knowsId: (id) => this.history.all().some((e) => e.peerId === id),
        rekey: (oldId, newId) => this.history.rekey(oldId, newId),
        settings: (s) => this.applySettings(s),
      },
    });
    this.applySettings(this.hub.settings.get());
    // names in friends' profile colors wherever the UI colors people
    setPersonColors((id) => this.contacts.get(id)?.color);
    this.transfers = new TransferManager({
      send: (id, msg) => this.net.send(id, msg),
      isOnline: (id) => this.net.isOnline(id),
      reachable: (id) => this.net.elsewhere(id).length > 0,
      noticeOffer: (id, xid, text) => {
        this.net.sendNotice(id, { id: `drop-${xid}`, kind: 'offer', title: this.net.name, body: text, ttlMs: OFFER_NOTICE_TTL });
      },
      withdrawOffer: (id, xid) => this.net.withdrawNotice(`drop-${xid}`, id),
      announce: (from, xid, text) => this.net.noteLocally(from, { id: `drop-${xid}`, kind: 'offer', title: this.peerName(from), body: text }),
      isFriend: (id) => this.contacts.get(id)?.state === 'accepted',
      isTrusted: (id) => this.contacts.get(id)?.trusted === true,
      quiet: () => this.net.dnd,
      nameOf: (id) => this.peerName(id),
      dialsData: (id) => this.network.get(id)?.initiator ?? false,
      dialData: async (id, xid) => {
        const s = this.network.get(id);
        if (!s?.isOpen) throw new Error('not connected');
        const { fs, hs } = await this.network.dialPurpose(s.remoteAddress, s.remotePort, id, xid);
        return new DataLink(fs, hs, xid);
      },
      downloadDir: () => this.downloadDir(),
      freeSpace: opts.freeSpace ?? freeSpace,
      changed: () => this.changed(),
      toast: (text, kind) => this.showToast(text, kind),
      notify: (title, body) => this.net.notify(title, body),
      record: (entry) => this.record(entry),
      tuning: opts.tuning,
    });
  }

  /** Creates the shared profile and keys on first launch (one profile for all apps). */
  static createProfile(paths: Paths, name: string): string {
    return Hub.createProfile(paths.hub, name).id;
  }

  /** Is there a profile yet (in any app)? */
  static hasProfile(paths: Paths): boolean {
    return Hub.hasProfile(paths.hub);
  }

  // ───────────── Shortcuts ─────────────

  get identity() {
    return this.net.identity;
  }

  get contacts() {
    return this.net.contacts;
  }

  get network() {
    return this.net.network;
  }

  // ───────────── Lifecycle ─────────────

  async start(): Promise<void> {
    await this.net.start();
    this.started = true;
    this.changed();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.transfers.stop();
    this.toasts.stop();
    await this.net.stop();
  }

  // ───────────── Subscription for React ─────────────

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private changed(): void {
    this.version++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      // offers waiting for an answer, for termhub's badge (only while termdrop runs)
      if (this.started) this.net.setWaiting(this.transfers.incomingOffers().length, true);
      for (const fn of this.listeners) fn();
    });
  }

  private applySettings(s: Settings): void {
    if (setAccent(s.accent)) this.changed();
  }

  // ───────────── Queries ─────────────

  get me() {
    return this.net.me;
  }

  get toast(): Toast | null {
    return this.toasts.current;
  }

  get settings(): Settings {
    return this.net.settings;
  }

  isOnline(id: string): boolean {
    return this.net.isOnline(id);
  }

  friend(id: string): FriendView | undefined {
    const c = this.contacts.get(id);
    if (!c) return undefined;
    const online = this.isOnline(id);
    const p: PeerPresence | undefined = this.net.presenceOf(id);
    return {
      ...c,
      display: displayName(c),
      online,
      away: online && (p?.away ?? false),
      busy: this.transfers.busyWith(id),
      elsewhere: online ? [] : this.net.elsewhere(id),
      status: p?.status ?? 'available',
      ...(p?.msg ? { statusMsg: p.msg } : {}),
    };
  }

  /** Best name for any peer: own nickname/friend name, else what we remember. */
  peerName(id: string): string {
    return this.net.peerName(id);
  }

  /** Accepted friends who can get files: online here, or in another app (the offer waits for them). */
  onlineFriends(): FriendView[] {
    return this.contacts
      .all()
      .filter((c) => c.state === 'accepted')
      .map((c) => this.friend(c.id)!)
      .filter((f) => f.online || f.elsewhere.length > 0)
      .sort((a, b) => Number(b.online) - Number(a.online) || a.display.localeCompare(b.display));
  }

  /** An online friend by name, nickname or ID (for `--to`); null if none or ambiguous. */
  findFriend(query: string): FriendView | null {
    const q = query.trim().toLowerCase().replace(/-/g, '');
    if (!q) return null;
    const friends = this.contacts.all().filter((c) => c.state === 'accepted');
    const exact = friends.filter((c) => displayName(c).toLowerCase() === q || c.name.toLowerCase() === q || c.id.toLowerCase().startsWith(q));
    const prefix = exact.length ? exact : friends.filter((c) => displayName(c).toLowerCase().startsWith(q) || c.name.toLowerCase().startsWith(q));
    return prefix.length === 1 ? this.friend(prefix[0]!.id)! : null;
  }

  dashboard(): DashboardData {
    const all = this.contacts.all().map((c) => this.friend(c.id)!);
    const presence = (f: FriendView) => (f.state !== 'accepted' ? 5 : f.busy && f.online ? 0 : f.online && !f.away ? 1 : f.away ? 2 : f.elsewhere.length ? 3 : 4);
    const friends = all
      .filter((f) => f.state !== 'incoming')
      .sort(
        (a, b) =>
          FRIEND_ORDER[a.state] - FRIEND_ORDER[b.state] || presence(a) - presence(b) || a.display.localeCompare(b.display),
      );
    const requests: RequestEntry[] = [
      ...this.transfers.incomingOffers().map((offer): RequestEntry => ({ kind: 'offer', offer })),
      ...all
        .filter((f) => f.state === 'incoming')
        .sort((a, b) => b.lastActivity - a.lastActivity)
        .map((friend): RequestEntry => ({ kind: 'friend', friend })),
    ];
    return { requests, friends, nearby: this.net.nearby() };
  }

  /** Number of accepted friends online. */
  onlineCount(): number {
    return this.net.onlineCount();
  }

  totals(): Totals {
    return this.history.totals();
  }

  safetyCodeWith(id: string): string | null {
    return this.net.safetyCodeWith(id);
  }

  // ───────────── Files and folders ─────────────

  downloadDir(): string {
    return readConfig(this.paths).downloadDir ?? defaultDownloadDir();
  }

  /** Changes where received files go. The folder is created if needed. */
  setDownloadDir(dir: string): string {
    const full = path.resolve(dir);
    fs.mkdirSync(full, { recursive: true });
    if (!fs.statSync(full).isDirectory()) throw new Error(`${full} is not a folder`);
    fs.accessSync(full, fs.constants.W_OK);
    writeConfig(this.paths, { downloadDir: full });
    this.changed();
    return full;
  }

  freeSpace(dir = this.downloadDir()): number | null {
    return (this.opts.freeSpace ?? freeSpace)(dir);
  }

  /**
   * Files handed to the app (command line, another shell, /send, a paste): checked, then the
   * UI opens the send flow with them. Returns what was accepted and what not.
   */
  requestSend(paths: string[], to?: string, source: SendRequest['source'] = 'shell', recipients = false): SendRequest {
    const { files, rejected } = inspectPaths(paths);
    this.sendRequest = { seq: ++this.sendSeq, files, rejected, source, ...(to ? { to } : {}), ...(recipients ? { recipients } : {}) };
    this.changed();
    return this.sendRequest;
  }

  /** Offers files to friends (one transfer each). */
  send(files: LocalFile[], recipients: string[]): Transfer[] {
    const out = this.transfers.offer(files, recipients);
    if (!out.length) throw new Error('None of them is online anymore');
    return out;
  }

  private record(entry: HistoryEntry): void {
    this.history.add(entry);
    // a friend may be removed later – the history should still know their name
    if (!this.contacts.get(entry.peerId)) this.net.peerBook.update(entry.peerId, { name: entry.peerName, lastSeen: entry.ts });
  }

  // ───────────── UI helpers ─────────────

  showToast(text: string, kind: NoteKind = 'info'): void {
    this.toasts.show(text, kind);
  }

  private log(line: string): void {
    if (this.opts.debug) appendLog(this.paths.log, line);
  }

  private onEvent(e: FriendEvent): void {
    switch (e.kind) {
      case 'accepted':
        return this.showToast(e.byThem ? `${e.who} accepted your friend request` : `You and ${e.who} are now friends`, 'success');
      case 'incoming':
        this.showToast(`${e.who} wants to be friends`, 'info');
        return this.net.notify('termdrop', `${e.who} wants to be friends`);
      case 'removedUs':
        return this.showToast(`${e.who} removed you as a friend – your request is waiting to be accepted`, 'error');
      case 'declinedUs':
        return this.showToast(`${e.who} declined your friend request`, 'error');
      case 'withdrawn':
        return this.showToast(`${e.who} withdrew their friend request`);
      case 'requestSent':
        return this.showToast(`Friend request sent to ${e.who} – waiting for them to accept`);
      case 'unreachable':
        return this.showToast(
          `Can't reach ${e.who} at ${e.ip}:${e.port} yet – still trying. A firewall may be blocking termdrop ` +
            '(Windows: allow Node.js for public networks · macOS: allow incoming connections for node).',
          'error',
        );
      case 'notice':
        return this.showToast(noticeLine(e.notice));
      case 'linked':
        return;
    }
  }

  // ───────────── Friends ─────────────

  /** Request to a peer from "Nearby". */
  requestNearby(id: string): void {
    const name = this.net.discovery?.peers.get(id)?.name;
    const r = this.net.requestNearby(id);
    if (r === 'sent') this.showToast(`Friend request sent to ${name ?? 'them'}`);
    else if (r === 'accepted') this.showToast(`You and ${this.peerName(id)} are now friends`, 'success');
  }

  /** Ask again (after a decline). */
  request(id: string): void {
    this.net.request(id);
    this.showToast('Friend request sent again');
  }

  /** Add a friend by IP – for networks that block broadcast. */
  addByAddress(host: string, port = APP.tcpPort): Promise<string> {
    return this.net.addByAddress(host, port);
  }

  accept(id: string): void {
    const c = this.contacts.get(id);
    if (c && this.net.accept(id)) this.showToast(`You and ${displayName(c)} are now friends`, 'success');
  }

  decline(id: string): void {
    const c = this.net.decline(id);
    if (c) this.showToast(`Declined ${displayName(c)}'s request`);
  }

  block(id: string): void {
    const c = this.net.block(id, { trusted: false });
    if (c) this.showToast(`${displayName(c)} is blocked. No more connections will be accepted.`, 'error');
  }

  unblock(id: string): void {
    const c = this.net.unblock(id);
    if (c) this.showToast(`Unblocked ${displayName(c)} – friend request sent`, 'success');
  }

  removeFriend(id: string): void {
    const c = this.contacts.get(id);
    if (c) this.net.peerBook.update(id, { name: displayName(c) });
    this.net.remove(id);
  }

  rename(id: string, alias: string): void {
    this.net.rename(id, alias);
  }

  /** Trusted friends' files are accepted without asking. */
  setTrusted(id: string, trusted: boolean): void {
    const c = this.contacts.get(id);
    if (!c || c.state !== 'accepted') throw new Error('Only friends can be trusted');
    this.contacts.upsert(id, { trusted });
    this.showToast(
      trusted ? `${displayName(c)} is trusted – their files are accepted automatically` : `Files from ${displayName(c)} need your OK again`,
      'success',
    );
    this.changed();
  }

  /** Changes the shared name (all apps). */
  setName(name: string): string {
    return this.net.setName(name);
  }

  // ───────────── Presence and notifications ─────────────

  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused: boolean): void {
    this.net.setFocused(focused);
  }

  /** False while the terminal window is in the background (if the terminal reports focus). */
  get isFocused(): boolean {
    return this.net.isFocused;
  }

  /** Do not disturb (profile status): offers wait quietly, no notifications. */
  get dnd(): boolean {
    return this.net.dnd;
  }

  notificationsEnabled(): boolean {
    return this.net.notificationsEnabled();
  }

  setNotifications(on: boolean): void {
    this.net.setNotifications(on);
  }

  setUpdateAvailable(version: string | null): void {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`termdrop ${version} is available – /update installs it`);
    else this.changed();
  }
}
