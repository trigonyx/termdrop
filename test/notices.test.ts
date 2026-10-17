import { afterEach, describe, expect, it } from 'vitest';
import { basePaths } from 'termcore/app/paths';
import { defineApp } from 'termcore/app/suite';
import { FriendNet, type FriendEvent } from 'termcore/friends/net';
import { Hub } from 'termcore/store/hub';
import { AppStore } from '../src/core/store.js';
import type { Paths } from '../src/core/paths.js';
import { inspectPaths } from '../src/transfer/local.js';
import { befriend, randomFile, tmpDir, until } from './helpers.js';
import { resolvePaths } from '../src/core/paths.js';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((s) => s()));
});

function profile(name: string): Paths {
  const paths = resolvePaths(tmpDir(name));
  AppStore.createProfile(paths, name);
  return paths;
}

async function termdrop(paths: Paths): Promise<AppStore & { halt(): Promise<void> }> {
  const s = new AppStore({ paths, port: 0, discovery: false, dialIntervalMs: 100 }) as AppStore & { halt(): Promise<void> };
  s.setDownloadDir(tmpDir('dl'));
  await s.start();
  let stopped = false;
  s.halt = async () => {
    if (stopped) return;
    stopped = true;
    await s.stop();
  };
  stops.push(() => s.halt());
  return s;
}

/** termhub (only termcore's part of it), running next to termdrop. */
async function termhub(paths: Paths) {
  const p = basePaths('termhub', paths.hub.dir, {});
  const hub = new Hub(p.hub);
  const events: FriendEvent[] = [];
  const net = new FriendNet<never, object>({
    app: defineApp('termhub', { version: '1.1.0', repository: { url: 'https://github.com/trigonyx/termhub' } }),
    paths: p,
    hub,
    port: 0,
    discovery: false,
    dialIntervalMs: 100,
    notify: () => {},
    wire: { parse: () => null },
    hooks: { changed: () => {}, message: () => {}, event: (e) => events.push(e) },
  });
  await net.start();
  stops.push(() => net.stop());
  return { net, hub, events };
}

async function setup() {
  const alicePaths = profile('Alice');
  const bobPaths = profile('Bob');
  const alice = await termdrop(alicePaths);
  const bob = await termdrop(bobPaths);
  await befriend(alice, bob);
  const bobId = bob.identity.id;
  await bob.halt();
  const aliceHub = await termhub(alicePaths);
  const bobHub = await termhub(bobPaths);
  aliceHub.net.contacts.setPorts(bobId, { termhub: bobHub.net.network.port });
  await until(() => alice.friend(bobId)?.elsewhere.includes('termhub') ?? false, 8000, 'Bob seen in termhub');
  const file = randomFile(tmpDir('src'), 'notes.txt', 1234);
  return { alice, bobPaths, bobId, bobHub, files: inspectPaths([file]).files };
}

describe('files for friends without termdrop open', { timeout: 40_000 }, () => {
  it('wait for them, they are told in termhub, and the offer goes out once their termdrop opens', async () => {
    const { alice, bobPaths, bobId, bobHub, files } = await setup();
    expect(alice.onlineFriends().map((f) => f.id)).toEqual([bobId]);

    const [t] = alice.send(files, [bobId]);
    expect(t).toMatchObject({ status: 'waiting', parked: true });
    await until(() => bobHub.hub.inbox.get().notices.some((n) => n.app === 'termdrop'), 8000, 'notice');
    expect(bobHub.hub.inbox.get().notices[0]).toMatchObject({ kind: 'offer', title: 'Alice', body: 'wants to send you 1 file · 1.2 kB' });

    const bob = await termdrop(bobPaths);
    await until(() => bob.transfers.incomingOffers().length === 1, 8000, 'offer');
    expect(alice.transfers.get(t!.xid)?.parked).toBeUndefined();
    await until(() => bobHub.hub.inbox.get().notices.length === 0, 6000, 'notice gone');
    await until(() => bobHub.hub.inbox.get().waiting.termdrop?.n === 1, 6000, 'counted');

    bob.transfers.accept(t!.xid);
    await until(() => alice.transfers.get(t!.xid)?.status === 'done', 10_000, 'done');
  });

  it('withdrawn when the sender cancels', async () => {
    const { alice, bobId, bobHub, files } = await setup();
    const [t] = alice.send(files, [bobId]);
    await until(() => bobHub.hub.inbox.get().notices.length === 1, 8000, 'notice');
    alice.transfers.cancel(t!.xid);
    expect(alice.transfers.get(t!.xid)?.status).toBe('cancelled');
    await until(() => bobHub.hub.inbox.get().notices.length === 0, 8000, 'withdrawn');
  });
});
