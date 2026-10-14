import dgram from 'node:dgram';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { cleanName } from './sanitize.js';

export const DISCOVERY_PORT = 5055;
const ANNOUNCE_INTERVAL = 3000;
const EXPIRE_AFTER = 10_000;
const ID_RE = /^[A-Z2-7]{20}$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const MAX_PACKET = 2048;
/** Contacts' last known addresses are asked directly this often. */
const HINT_INTERVAL = 15_000;
/** An address we asked directly isn't asked again within this time. */
const REPROBE_AFTER = 30_000;
/** Most addresses passed on to others in one announcement. */
const MAX_GOSSIP = 32;
/** Subnet scan pace: SCAN_BATCH packets every SCAN_TICK ms (~100 per second). */
const SCAN_BATCH = 5;
const SCAN_TICK = 50;
/** Subnets bigger than this are only scanned in the /16 around our own address. */
const MIN_SCAN_PREFIX = 16;
/** While nobody is found, the subnet is scanned again this often. */
const RESCAN_ALONE = 10 * 60_000;

export interface DiscoveredPeer {
  id: string;
  name: string;
  ip: string;
  port: number;
  lastSeen: number;
}

interface Announce {
  app: 'termdrop';
  v: 1;
  id: string;
  name: string;
  port: number;
  /** Asks for an immediate reply (on startup) so nobody has to wait 3 s. */
  q?: 1;
  /** Addresses of other termdrop instances the sender sees, so they can be asked directly. */
  ips?: string[];
  /**
   * "Please connect to me": the sender wants a connection but can't open one itself,
   * e.g. because the receiver's firewall blocks incoming connections. Only ever sent
   * directly to that one peer, never broadcast.
   */
  c?: 1;
}

export interface LocalIPv4 {
  address: string;
  netmask: string;
  broadcast: string;
}

export function localIPv4s(): LocalIPv4[] {
  const out: LocalIPv4[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      const broadcast = ip.map((b, i) => (b | (~mask[i]! & 255)) & 255).join('.');
      out.push({ address: a.address, netmask: a.netmask, broadcast });
    }
  }
  return out;
}

const toInt = (ip: string) => ip.split('.').reduce((n, b) => n * 256 + Number(b), 0);
const toIp = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

function prefixLength(netmask: string): number {
  let n = toInt(netmask);
  let bits = 0;
  while (n & 0x80000000) {
    bits++;
    n = (n << 1) >>> 0;
  }
  return bits;
}

/** Addresses that can belong to a LAN neighbour (private ranges and carrier-grade NAT). */
function isPrivate(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return a === 10 || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b < 128);
}

/**
 * Every other address of our subnets, nearest to our own first. Huge subnets are cut
 * down to our /16; link-local and point-to-point interfaces are skipped.
 */
export function* scanOrder(ifaces: Pick<LocalIPv4, 'address' | 'netmask'>[]): Generator<string> {
  const ranges = ifaces.flatMap((i) => {
    const prefix = prefixLength(i.netmask);
    if (prefix > 30 || i.address.startsWith('169.254.')) return [];
    const mask = prefix < MIN_SCAN_PREFIX ? 0xffff0000 : toInt(i.netmask);
    const ip = toInt(i.address);
    const net = (ip & mask) >>> 0;
    const broadcast = (net | (~mask >>> 0)) >>> 0;
    return [{ ip, net, broadcast }];
  });
  // several interfaces take turns, so a big one doesn't hold up a small one
  const gens = ranges.map(function* ({ ip, net, broadcast }) {
    for (let d = 1; ip + d < broadcast || ip - d > net; d++) {
      if (ip + d < broadcast) yield toIp(ip + d);
      if (ip - d > net) yield toIp(ip - d);
    }
  });
  const seen = new Set<string>();
  while (gens.length) {
    for (let i = 0; i < gens.length; i++) {
      const r = gens[i]!.next();
      if (r.done) gens.splice(i--, 1);
      else if (!seen.has(r.value)) {
        seen.add(r.value);
        yield r.value;
      }
    }
  }
}

export interface DiscoveryTransport {
  send(buf: Buffer, address: string): void;
  close(): void;
}

export interface TransportHandlers {
  onMessage(buf: Buffer, address: string): void;
  onError(err: Error): void;
  onReady(): void;
}

export type OpenTransport = (handlers: TransportHandlers) => DiscoveryTransport;

function udpTransport(port: number): OpenTransport {
  return ({ onMessage, onError, onReady }) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let bound = false;
    socket.on('error', (err) => {
      // errors after binding (e.g. an ICMP reply to a scan packet) don't break discovery
      if (!bound) onError(err);
    });
    socket.on('message', (buf, rinfo) => onMessage(buf, rinfo.address));
    socket.bind(port, () => {
      bound = true;
      try {
        socket.setBroadcast(true);
      } catch {
        // some environments don't allow broadcast – the unicast paths still work
      }
      onReady();
    });
    return {
      send(buf, address) {
        try {
          socket.send(buf, port, address, () => {
            // send errors (no network, nobody at that address) are normal here
          });
        } catch {
          // socket already closed
        }
      },
      close() {
        try {
          socket.close();
        } catch {
          // already closed
        }
      },
    };
  };
}

export interface DiscoveryOptions {
  udpPort?: number;
  /** Addresses worth asking directly, e.g. where contacts were last seen. */
  hints?: () => Iterable<string>;
  /** Peers we want to be connected to but aren't – they're asked to connect to us. */
  wants?: (id: string) => boolean;
  /** Own network interfaces (default: the OS's). */
  interfaces?: () => LocalIPv4[];
  /** Replaces the UDP socket (tests). */
  transport?: OpenTransport;
}

/**
 * Finds other termdrop instances on the local network, so a contact's current IP is
 * always known, even when it changes. Peers are identified by their ID, never by IP.
 *
 * Many school and office Wi-Fis drop broadcasts between clients but still let unicast
 * through, so besides broadcasting this also
 *  - asks every address of the own subnet once, at startup and when our address changes,
 *  - asks the addresses where contacts were last seen,
 *  - keeps found peers alive with direct (unicast) announcements, and
 *  - passes on the addresses it knows, so one found peer leads to all the others.
 *
 * It also asks peers we want to reach to connect to us (`callback`), so a connection
 * comes about as long as at least one side accepts incoming connections.
 */
export class Discovery extends EventEmitter<{ change: []; log: [string]; callback: [string] }> {
  private transport: DiscoveryTransport | null = null;
  private timer: NodeJS.Timeout | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private scanQueue: Iterator<string> | null = null;
  private lastScanEnd = 0;
  private lastHints = 0;
  private netSignature = '';
  /** address → when we last asked it directly */
  private probed = new Map<string, number>();
  readonly peers = new Map<string, DiscoveredPeer>();

  constructor(
    private readonly myId: string,
    private readonly getName: () => string,
    private readonly getPort: () => number,
    private readonly opts: DiscoveryOptions = {},
  ) {
    super();
  }

  /** True while the own subnet is being scanned. */
  get scanning(): boolean {
    return this.scanQueue !== null;
  }

  start(): void {
    const open = this.opts.transport ?? udpTransport(this.opts.udpPort ?? DISCOVERY_PORT);
    this.transport = open({
      onMessage: (buf, address) => this.onMessage(buf, address),
      onError: (err) => {
        this.emit('log', `Discovery unavailable: ${err.message}`);
        this.stop();
      },
      onReady: () => {
        this.netSignature = this.signature();
        this.announce(true);
        this.probeHints();
        this.startScan();
        this.timer = setInterval(() => this.tick(), ANNOUNCE_INTERVAL);
        this.timer.unref();
      },
    });
  }

  /** Re-announce immediately, e.g. after a name change. */
  announce(query: boolean): void {
    const msg = this.message(query);
    for (const target of new Set(['255.255.255.255', ...this.interfaces().map((i) => i.broadcast)])) this.sendTo(msg, target);
    // directly as well, in case broadcasts are filtered
    for (const p of this.peers.values()) {
      this.sendTo(this.opts.wants?.(p.id) ? { ...msg, c: 1 } : msg, p.ip);
    }
  }

  /** Asks a peer right away to connect to us (e.g. after sending them a request). */
  callMe(id: string): void {
    const p = this.peers.get(id);
    if (p) this.sendTo({ ...this.message(false), c: 1 }, p.ip);
  }

  private tick(): void {
    const now = Date.now();
    const signature = this.signature();
    if (signature !== this.netSignature) {
      // new Wi-Fi or new address: everyone has to find us again
      this.netSignature = signature;
      this.emit('log', 'Network changed – searching again');
      this.probed.clear();
      this.announce(true);
      this.probeHints();
      this.startScan();
    } else {
      this.announce(false);
      if (now - this.lastHints >= HINT_INTERVAL) this.probeHints();
      if (!this.scanQueue && this.peers.size === 0 && now - this.lastScanEnd >= RESCAN_ALONE) this.startScan();
    }
    for (const [ip, at] of this.probed) if (now - at >= REPROBE_AFTER) this.probed.delete(ip);
    this.expire();
  }

  private message(query: boolean): Announce {
    const msg: Announce = { app: 'termdrop', v: 1, id: this.myId, name: this.getName(), port: this.getPort() };
    if (query) msg.q = 1;
    const ips = [...new Set([...this.peers.values()].map((p) => p.ip))].slice(0, MAX_GOSSIP);
    if (ips.length) msg.ips = ips;
    return msg;
  }

  private sendTo(msg: Announce, address: string): void {
    this.transport?.send(Buffer.from(JSON.stringify(msg)), address);
  }

  private interfaces(): LocalIPv4[] {
    return this.opts.interfaces?.() ?? localIPv4s();
  }

  private signature(): string {
    return this.interfaces()
      .map((i) => `${i.address}/${i.netmask}`)
      .sort()
      .join(',');
  }

  /** Asks one address directly whether termdrop runs there (at most every 30 s). */
  private probe(ip: string): void {
    if (!IPV4_RE.test(ip) || this.interfaces().some((i) => i.address === ip)) return;
    for (const p of this.peers.values()) if (p.ip === ip) return;
    const last = this.probed.get(ip);
    if (last !== undefined && Date.now() - last < REPROBE_AFTER) return;
    this.probed.set(ip, Date.now());
    this.sendTo(this.message(true), ip);
  }

  private probeHints(): void {
    this.lastHints = Date.now();
    for (const ip of this.opts.hints?.() ?? []) this.probe(ip);
  }

  private startScan(): void {
    this.scanQueue = scanOrder(this.interfaces());
    if (!this.scanTimer) {
      this.scanTimer = setInterval(() => this.scanStep(), SCAN_TICK);
      this.scanTimer.unref();
    }
    this.emit('change');
  }

  private scanStep(): void {
    const known = new Set([...this.peers.values()].map((p) => p.ip));
    const msg = this.message(true);
    for (let sent = 0; sent < SCAN_BATCH; ) {
      const next = this.scanQueue?.next();
      if (!next || next.done) {
        this.scanQueue = null;
        this.lastScanEnd = Date.now();
        if (this.scanTimer) clearInterval(this.scanTimer);
        this.scanTimer = null;
        this.emit('change');
        return;
      }
      if (known.has(next.value)) continue;
      this.sendTo(msg, next.value);
      sent++;
    }
  }

  private onMessage(buf: Buffer, address: string): void {
    if (buf.length > MAX_PACKET) return;
    let msg: Partial<Announce>;
    try {
      msg = JSON.parse(buf.toString('utf8'));
    } catch {
      return;
    }
    if (!msg || msg.app !== 'termdrop' || msg.v !== 1 || typeof msg.id !== 'string' || !ID_RE.test(msg.id)) return;
    if (msg.id === this.myId) return;
    const port = Number(msg.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;

    const prev = this.peers.get(msg.id);
    const peer: DiscoveredPeer = { id: msg.id, name: cleanName(msg.name), ip: address, port, lastSeen: Date.now() };
    this.peers.set(msg.id, peer);
    if (!prev || prev.ip !== peer.ip || prev.port !== peer.port || prev.name !== peer.name) this.emit('change');

    if (msg.q) this.sendTo(this.message(false), address);
    if (msg.c === 1) this.emit('callback', msg.id);

    // Others' addresses are only asked, never trusted: a peer shows up once it answers itself.
    if (Array.isArray(msg.ips)) {
      const subnets = this.interfaces().map((i) => ({ net: toInt(i.address) & toInt(i.netmask), mask: toInt(i.netmask) }));
      const nearby = (ip: string) => isPrivate(ip) || subnets.some((s) => (toInt(ip) & s.mask) === s.net);
      for (const ip of msg.ips.slice(0, MAX_GOSSIP)) {
        if (typeof ip === 'string' && IPV4_RE.test(ip) && nearby(ip)) this.probe(ip);
      }
    }
  }

  private expire(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > EXPIRE_AFTER) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit('change');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.timer = null;
    this.scanTimer = null;
    this.scanQueue = null;
    this.transport?.close();
    this.transport = null;
  }
}
