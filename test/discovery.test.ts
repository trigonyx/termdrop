import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Discovery, scanOrder, type LocalIPv4, type OpenTransport, type TransportHandlers } from '../src/core/discovery.js';
import { resolvePaths, type Paths } from '../src/core/paths.js';
import { AppStore } from '../src/core/store.js';

interface Node {
  ip: string;
  netmask: string;
  handlers?: TransportHandlers;
}

/** A simulated Wi-Fi. Like many school networks, it drops broadcasts unless told otherwise. */
class FakeLan {
  broadcast = false;
  readonly nodes: Node[] = [];
  readonly sentTo = new Set<string>();
  readonly packets: { to: string; msg: Record<string, unknown> }[] = [];

  join(ip: string, netmask = '255.255.255.0'): { node: Node; transport: OpenTransport; interfaces: () => LocalIPv4[] } {
    const node: Node = { ip, netmask };
    this.nodes.push(node);
    const transport: OpenTransport = (handlers) => {
      node.handlers = handlers;
      setTimeout(() => handlers.onReady(), 0);
      return {
        send: (buf, address) => this.send(node, buf, address),
        close: () => {
          node.handlers = undefined;
        },
      };
    };
    const interfaces = () => {
      const mask = node.netmask.split('.').map(Number);
      const broadcast = node.ip.split('.').map((b, i) => (Number(b) | (~mask[i]! & 255)) & 255).join('.');
      return [{ address: node.ip, netmask: node.netmask, broadcast }];
    };
    return { node, transport, interfaces };
  }

  send(from: Node, buf: Buffer, address: string): void {
    this.sentTo.add(address);
    this.packets.push({ to: address, msg: JSON.parse(buf.toString('utf8')) });
    const isBroadcast = address === '255.255.255.255' || address.endsWith('.255');
    const targets = isBroadcast
      ? this.broadcast
        ? this.nodes.filter((n) => n !== from)
        : []
      : this.nodes.filter((n) => n.ip === address && n !== from);
    for (const n of targets) {
      setTimeout(() => n.handlers?.onMessage(Buffer.from(buf), from.ip), 0);
    }
  }
}

const ids = ['AAAAAAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBB', 'CCCCCCCCCCCCCCCCCCCC'];

describe('scanOrder', () => {
  it('goes outward from our own address and skips it, the network and the broadcast address', () => {
    const order = [...scanOrder([{ address: '192.168.1.10', netmask: '255.255.255.0' }])];
    expect(order.slice(0, 4)).toEqual(['192.168.1.11', '192.168.1.9', '192.168.1.12', '192.168.1.8']);
    expect(order).toHaveLength(253);
    expect(order).not.toContain('192.168.1.10');
    expect(order).not.toContain('192.168.1.0');
    expect(order).not.toContain('192.168.1.255');
  });

  it('caps huge subnets at the surrounding /16 and skips link-local and point-to-point', () => {
    expect([...scanOrder([{ address: '10.20.30.40', netmask: '255.0.0.0' }])]).toHaveLength(65533);
    expect([...scanOrder([{ address: '169.254.3.4', netmask: '255.255.0.0' }])]).toHaveLength(0);
    expect([...scanOrder([{ address: '10.8.0.6', netmask: '255.255.255.255' }])]).toHaveLength(0);
  });
});

describe('Discovery without broadcasts', () => {
  const running: Discovery[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    for (const d of running.splice(0)) d.stop();
    vi.useRealTimers();
  });

  function start(lan: FakeLan, id: string, ip: string, netmask?: string, hints: string[] = [], wants?: (id: string) => boolean) {
    const { node, transport, interfaces } = lan.join(ip, netmask);
    const d = new Discovery(id, () => `n-${id[0]}`, () => 5050, { transport, interfaces, hints: () => hints, wants });
    d.start();
    running.push(d);
    return { d, node };
  }

  it('finds others by scanning the subnet and keeps them alive with direct announcements', async () => {
    const lan = new FakeLan();
    const a = start(lan, ids[0]!, '10.0.0.10');
    const b = start(lan, ids[1]!, '10.0.0.200');
    await vi.advanceTimersByTimeAsync(10);
    expect(a.d.scanning).toBe(true);
    await vi.advanceTimersByTimeAsync(3500);
    expect(a.d.peers.get(ids[1]!)?.ip).toBe('10.0.0.200');
    expect(b.d.peers.get(ids[0]!)?.ip).toBe('10.0.0.10');
    expect(a.d.scanning).toBe(false);

    // long after the scan, nobody has expired
    await vi.advanceTimersByTimeAsync(60_000);
    expect(a.d.peers.has(ids[1]!)).toBe(true);
    expect(b.d.peers.has(ids[0]!)).toBe(true);
  });

  it('passes on known addresses, so one found peer leads to the others', async () => {
    const lan = new FakeLan();
    // in a /16 the scan would need minutes to reach C …
    const a = start(lan, ids[0]!, '10.0.0.1', '255.255.0.0');
    start(lan, ids[1]!, '10.0.0.2', '255.255.0.0', ['10.0.200.7']);
    start(lan, ids[2]!, '10.0.200.7', '255.255.0.0');
    // … but B knows C's address and tells A about it
    await vi.advanceTimersByTimeAsync(5000);
    expect(a.d.peers.get(ids[2]!)?.ip).toBe('10.0.200.7');
  });

  it('recognizes a peer by ID when its address changes', async () => {
    const lan = new FakeLan();
    const a = start(lan, ids[0]!, '10.0.0.10');
    const b = start(lan, ids[1]!, '10.0.0.20');
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.d.peers.get(ids[1]!)?.ip).toBe('10.0.0.20');

    b.node.ip = '10.0.0.230';
    await vi.advanceTimersByTimeAsync(7000);
    expect(a.d.peers.get(ids[1]!)?.ip).toBe('10.0.0.230');
    expect(b.d.peers.get(ids[0]!)?.ip).toBe('10.0.0.10');
  });

  it('asks contacts at their last known address', async () => {
    const lan = new FakeLan();
    const a = start(lan, ids[0]!, '10.1.0.5', '255.255.255.0', ['10.2.0.9']);
    start(lan, ids[1]!, '10.2.0.9');
    await vi.advanceTimersByTimeAsync(100);
    expect(a.d.peers.get(ids[1]!)?.ip).toBe('10.2.0.9');
  });

  it('asks wanted peers to connect back – directly, never by broadcast', async () => {
    const lan = new FakeLan();
    lan.broadcast = true;
    const a = start(lan, ids[0]!, '10.0.0.10', undefined, [], (id) => id === ids[1]);
    const b = start(lan, ids[1]!, '10.0.0.20');
    start(lan, ids[2]!, '10.0.0.30');
    const callbacks: string[] = [];
    b.d.on('callback', (id) => callbacks.push(id));
    await vi.advanceTimersByTimeAsync(3500);
    expect(callbacks).toContain(ids[0]);
    const asks = lan.packets.filter((p) => p.msg.c === 1);
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.every((p) => p.to === '10.0.0.20' && p.msg.id === ids[0])).toBe(true);

    callbacks.length = 0;
    a.d.callMe(ids[1]!);
    await vi.advanceTimersByTimeAsync(10);
    expect(callbacks).toEqual([ids[0]]);
  });

  it('does not probe public addresses it was told about', async () => {
    const lan = new FakeLan();
    lan.broadcast = true;
    start(lan, ids[0]!, '10.0.0.1', '255.255.255.252');
    const { node, transport } = lan.join('10.0.0.2', '255.255.255.252');
    transport({ onMessage: () => {}, onError: () => {}, onReady: () => {} });
    await vi.advanceTimersByTimeAsync(10);
    const evil = { app: 'termdrop', v: 1, id: ids[2], name: 'x', port: 5050, ips: ['8.8.8.8', '192.168.7.7'] };
    lan.send(node, Buffer.from(JSON.stringify(evil)), '10.0.0.1');
    await vi.advanceTimersByTimeAsync(10);
    expect(lan.sentTo.has('8.8.8.8')).toBe(false);
    expect(lan.sentTo.has('192.168.7.7')).toBe(true);
  });
});

describe('AppStore with discovery', () => {
  const stores: AppStore[] = [];
  afterEach(async () => {
    await Promise.all(stores.splice(0).map((s) => s.stop()));
  });

  function profile(name: string): Paths {
    const paths = resolvePaths(fs.mkdtempSync(path.join(os.tmpdir(), `termdrop-${name}-`)));
    AppStore.createProfile(paths, name);
    return paths;
  }

  async function boot(paths: Paths, lan: FakeLan, ip: string): Promise<AppStore> {
    const { transport, interfaces } = lan.join(ip);
    const s = new AppStore({ paths, port: 0, dialIntervalMs: 100, discoveryOptions: { transport, interfaces } });
    await s.start();
    stores.push(s);
    return s;
  }

  async function until(cond: () => boolean, ms = 10_000): Promise<void> {
    const end = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > end) throw new Error('Timed out in test');
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  it('delivers a request even if the requested side blocks incoming connections', { timeout: 20_000 }, async () => {
    const lan = new FakeLan();
    lan.broadcast = true;
    const a = await boot(profile('Alice'), lan, '127.0.0.1');
    // Bob's address can't be reached over TCP (TEST-NET), like a firewall dropping connections
    const b = await boot(profile('Bob'), lan, '192.0.2.1');
    const bobId = b.identity.id;
    const aliceId = a.identity.id;
    await until(() => a.dashboard().nearby.some((p) => p.id === bobId) && b.dashboard().nearby.some((p) => p.id === aliceId));

    const sent = Date.now();
    a.requestNearby(bobId);
    // Bob connects back to Alice, so her request shows up right away
    await until(() => b.dashboard().requests.some((r) => r.kind === 'friend' && r.friend.id === aliceId), 3000);
    expect(Date.now() - sent).toBeLessThan(3000);
    expect(b.dashboard().nearby.some((p) => p.id === aliceId)).toBe(false);

    b.accept(aliceId);
    await until(() => a.friend(bobId)?.state === 'accepted' && b.friend(aliceId)?.state === 'accepted');
    expect(a.isOnline(bobId) && b.isOnline(aliceId)).toBe(true);
  });

  it('connects two people who request each other at the same time', { timeout: 20_000 }, async () => {
    const lan = new FakeLan();
    lan.broadcast = true;
    const a = await boot(profile('Alice'), lan, '127.0.0.1');
    const b = await boot(profile('Bob'), lan, '127.0.0.1');
    await until(() => a.dashboard().nearby.length === 1 && b.dashboard().nearby.length === 1);

    a.requestNearby(b.identity.id);
    b.requestNearby(a.identity.id);
    await until(() => a.friend(b.identity.id)?.state === 'accepted' && b.friend(a.identity.id)?.state === 'accepted');
    expect(a.dashboard().requests).toHaveLength(0);
    expect(b.dashboard().requests).toHaveLength(0);
  });

  it('accepts when you request someone who already requested you', { timeout: 20_000 }, async () => {
    const lan = new FakeLan();
    lan.broadcast = true;
    const a = await boot(profile('Alice'), lan, '127.0.0.1');
    const b = await boot(profile('Bob'), lan, '127.0.0.1');
    await until(() => a.dashboard().nearby.length === 1 && b.dashboard().nearby.length === 1);

    a.requestNearby(b.identity.id);
    await until(() => b.friend(a.identity.id)?.state === 'incoming');
    // e.g. Bob pressed enter on Alice under Nearby just as her request arrived
    b.requestNearby(a.identity.id);
    expect(b.friend(a.identity.id)?.state).toBe('accepted');
    await until(() => a.friend(b.identity.id)?.state === 'accepted');
  });

  it('shows others under Nearby and reconnects a contact whose address changed', { timeout: 20_000 }, async () => {
    const lan = new FakeLan();
    const pa = profile('Alice');
    const pb = profile('Bob');
    const a = await boot(pa, lan, '127.0.0.2');
    let b = await boot(pb, lan, '127.0.0.1');
    const bobId = b.identity.id;
    const aliceId = a.identity.id;

    await until(() => a.dashboard().nearby.some((p) => p.id === bobId));
    a.requestNearby(bobId);
    await until(() => b.dashboard().requests.some((r) => r.kind === 'friend' && r.friend.id === aliceId));
    b.accept(aliceId);
    await until(() => a.friend(bobId)?.state === 'accepted' && a.isOnline(bobId));

    // Bob comes back with a new address that nobody knows
    await b.stop();
    stores.splice(stores.indexOf(b), 1);
    b.contacts.upsert(aliceId, { lastIp: '10.9.9.8', lastPort: 1 });
    a.contacts.upsert(bobId, { lastIp: '10.9.9.9', lastPort: 1 });
    await until(() => !a.isOnline(bobId));
    b = await boot(pb, lan, '127.0.0.1');

    await until(() => a.isOnline(bobId) && b.isOnline(aliceId), 15_000);
    expect(a.friend(bobId)).toMatchObject({ state: 'accepted', lastIp: '127.0.0.1', lastPort: b.network.port });
  });
});
