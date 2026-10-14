import type { ContactBook } from './contacts.js';
import { displayName } from './contacts.js';
import type { Discovery } from './discovery.js';
import type { Network } from './network.js';

interface DialState {
  inFlight: boolean;
  next: number;
  backoff: number;
  deferredSince?: number;
  failures?: number;
}

const MAX_BACKOFF = 30_000;
/** Peers that discovery currently sees are evidently online – retry them sooner. */
const MAX_BACKOFF_NEARBY = 5000;
/** A peer's "please connect to me" stays valid this long. */
const CALLBACK_TTL = 15_000;
/** Limits how many strangers can make us connect to them. */
const MAX_CALLBACKS_PER_MINUTE = 10;

export interface DialerDeps {
  myId: string;
  network: Network;
  contacts: ContactBook;
  discovery(): Discovery | null;
  log(line: string): void;
  /** A friend can't be reached for a while (shown once). */
  unreachable(id: string, text: string): void;
}

/**
 * Keeps friends connected: dials them wherever they were last seen or discovery sees them,
 * backs off on failure, and answers "please connect to me" from peers whose firewall blocks us.
 * (Split out of termchat's store, same logic.)
 */
export class Dialer {
  private states = new Map<string, DialState>();
  /** Peers that asked us to connect to them (id → when). */
  private callbacks = new Map<string, number>();
  private callbackTimes: number[] = [];
  /** Friends we already told that they can't be reached. */
  private warned = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly d: DialerDeps) {}

  start(intervalMs = 1500): void {
    this.timer = setInterval(() => this.loop(), intervalMs);
    this.timer.unref();
    this.loop();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** A session came up: forget backoff and callbacks for that peer. */
  connected(id: string): void {
    this.states.delete(id);
    this.callbacks.delete(id);
    this.warned.delete(id);
  }

  /** Discovery saw peers (maybe at a new address) – retry them right away. */
  discovered(ids: Iterable<string>): void {
    for (const id of ids) {
      const ds = this.states.get(id);
      if (ds && !ds.inFlight) ds.next = 0;
    }
  }

  /** Where friends were last seen – discovery asks there directly. */
  lastKnownIps(): string[] {
    const ips = new Set<string>();
    for (const c of this.d.contacts.all()) if (c.lastIp && c.state !== 'blocked') ips.add(c.lastIp);
    return [...ips];
  }

  wantsConnection(id: string): boolean {
    if (this.d.network.isOnline(id)) return false;
    const state = this.d.contacts.get(id)?.state;
    return state === 'accepted' || state === 'outgoing';
  }

  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id: string): void {
    this.tryDial(id);
    this.d.discovery()?.callMe(id);
  }

  /** A peer asked us to connect to them, e.g. because they sent us a request but can't reach us. */
  onCallback(id: string): void {
    if (this.d.network.isOnline(id) || this.d.contacts.get(id)?.state === 'blocked') return;
    const now = Date.now();
    if (!this.callbacks.has(id)) {
      this.callbackTimes = this.callbackTimes.filter((t) => now - t < 60_000);
      if (this.callbackTimes.length >= MAX_CALLBACKS_PER_MINUTE) return;
      this.callbackTimes.push(now);
    }
    this.callbacks.set(id, now);
    this.tryDial(id);
  }

  private loop(): void {
    for (const c of this.d.contacts.all()) {
      if (c.state === 'accepted' || c.state === 'outgoing') this.tryDial(c.id);
    }
    const now = Date.now();
    for (const [id, at] of this.callbacks) {
      if (now - at >= CALLBACK_TTL) this.callbacks.delete(id);
      else this.tryDial(id);
    }
  }

  private target(id: string): { ip: string; port: number; discovered: boolean } | null {
    const p = this.d.discovery()?.peers.get(id);
    if (p) return { ip: p.ip, port: p.port, discovered: true };
    const c = this.d.contacts.get(id);
    if (c?.lastIp && c.lastPort) return { ip: c.lastIp, port: c.lastPort, discovered: false };
    return null;
  }

  tryDial(id: string): void {
    const { network, contacts } = this.d;
    if (network.isOnline(id)) return;
    const c = contacts.get(id);
    const now = Date.now();
    const wanted = c?.state === 'accepted' || c?.state === 'outgoing';
    // they asked us to connect (a request on its way, or their firewall blocks us)
    const calledBack = c?.state !== 'blocked' && now - (this.callbacks.get(id) ?? -Infinity) < CALLBACK_TTL;
    if (!wanted && !calledBack) return;
    const t = this.target(id);
    if (!t) return;

    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1000 };
    this.states.set(id, ds);
    if (ds.inFlight || now < ds.next) return;

    // If both see each other via discovery, only the smaller ID dials right away – this
    // avoids duplicate connections. The larger one steps in if nothing happened after 4 s.
    if (t.discovered && !calledBack && c?.state !== 'outgoing' && this.d.myId > id) {
      ds.deferredSince ??= now;
      if (now - ds.deferredSince < 4000) return;
    }

    ds.inFlight = true;
    network
      .dial(t.ip, t.port, id)
      .then(() => {
        this.states.delete(id);
      })
      .catch((err: Error) => {
        this.d.log(`Connection to ${id} (${t.ip}:${t.port}) failed: ${err.message}`);
        ds.backoff = Math.min(ds.backoff * 2, t.discovered ? MAX_BACKOFF_NEARBY : MAX_BACKOFF);
        ds.next = Date.now() + ds.backoff;
        ds.failures = (ds.failures ?? 0) + 1;
        const friend = contacts.get(id);
        const waiting = friend?.state === 'outgoing' || friend?.state === 'accepted';
        if (waiting && t.discovered && ds.failures >= 3 && !network.isOnline(id) && !this.warned.has(id)) {
          this.warned.add(id);
          this.d.unreachable(
            id,
            `Can't reach ${displayName(friend)} at ${t.ip}:${t.port} yet – still trying. A firewall may be blocking termdrop ` +
              '(Windows: allow Node.js for public networks · macOS: allow incoming connections for node).',
          );
        }
      })
      .finally(() => {
        ds.inFlight = false;
      });
  }
}
