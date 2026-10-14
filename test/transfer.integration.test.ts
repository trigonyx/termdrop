import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppStore } from '../src/core/store.js';
import { inspectPaths } from '../src/transfer/local.js';
import { formatSpeed } from '../src/transfer/units.js';
import { befriend, listDir, randomFile, sha256, sleep, Stores, tmpDir, until } from './helpers.js';

const stores = new Stores();
afterEach(() => stores.stopAll());

const status = (s: AppStore, xid: string) => s.transfers.get(xid)?.status;
const offerFrom = (s: AppStore, from: AppStore) =>
  s.dashboard().requests.find((r) => r.kind === 'offer' && r.offer.peerId === from.identity.id);

describe('transfers between real instances on 127.0.0.1', { timeout: 60_000 }, () => {
  it('a 50 MB file and some small ones arrive intact, with the hashes checked', async () => {
    const alice = await stores.boot('Alice');
    const bob = await stores.boot('Bob');
    await befriend(alice, bob);

    const src = tmpDir('src');
    const big = randomFile(src, 'big.bin', 50 * 1024 * 1024);
    const small = [randomFile(src, 'notes.txt', 1234), randomFile(src, 'empty.dat', 0), randomFile(src, 'Foto mit Ümlaut.jpg', 70_001)];
    const { files } = inspectPaths([big, ...small]);
    expect(files).toHaveLength(4);
    // something with that name is already there – it must not be overwritten
    fs.writeFileSync(path.join(bob.downloadDir(), 'notes.txt'), 'mine');

    const [t] = alice.send(files, [bob.identity.id]);
    expect(t!.status).toBe('waiting');
    await until(() => offerFrom(bob, alice) !== undefined, 5000, 'offer');
    const offer = offerFrom(bob, alice)!;
    expect(offer.kind === 'offer' && offer.offer.files.map((f) => f.name)).toEqual(['big.bin', 'notes.txt', 'empty.dat', 'Foto mit Ümlaut.jpg']);

    bob.transfers.accept(t!.xid);
    await until(() => status(alice, t!.xid) === 'done' && status(bob, t!.xid) === 'done', 30_000, 'done');

    const got = bob.transfers.get(t!.xid)!;
    expect(got.saved!.map((p) => path.basename(p))).toEqual(['big.bin', 'notes (1).txt', 'empty.dat', 'Foto mit Ümlaut.jpg']);
    expect(got.saved!.map(sha256)).toEqual([big, ...small].map(sha256));
    expect(fs.readFileSync(path.join(bob.downloadDir(), 'notes.txt'), 'utf8')).toBe('mine');
    expect(listDir(bob.downloadDir()).some((n) => n.endsWith('.termdrop-part'))).toBe(false);

    // both sides keep a record
    expect(alice.history.recent(1)[0]).toMatchObject({ xid: t!.xid, dir: 'out', result: 'done', total: t!.total });
    expect(bob.history.recent(1)[0]).toMatchObject({ xid: t!.xid, dir: 'in', result: 'done', saved: got.saved });
    expect(bob.totals().receivedBytes).toBe(t!.total);
  });

  it('measures throughput on localhost', async () => {
    const alice = await stores.boot('Alice');
    const bob = await stores.boot('Bob');
    await befriend(alice, bob);
    bob.setTrusted(alice.identity.id, true);
    const size = 256 * 1024 * 1024;
    const file = randomFile(tmpDir('src'), 'speed.bin', size);
    const [t] = alice.send(inspectPaths([file]).files, [bob.identity.id]);
    await until(() => status(bob, t!.xid) === 'active', 5000, 'start');
    await until(() => status(bob, t!.xid) === 'done', 50_000, 'done');
    const done = bob.transfers.get(t!.xid)!;
    const bps = (size * 1000) / (done.endedAt! - done.startedAt!);
    console.log(`\n  ⚡ localhost throughput: ${formatSpeed(bps)} (${(size / 1024 / 1024).toFixed(0)} MiB in ${done.endedAt! - done.startedAt!} ms)\n`);
    expect(bps).toBeGreaterThan(100 * 1000 * 1000);
    expect(sha256(done.saved![0]!)).toBe(sha256(file));
  });

  it('sends to two friends at once; one is trusted, one declines another offer', async () => {
    const alice = await stores.boot('Alice');
    const bob = await stores.boot('Bob');
    const carl = await stores.boot('Carl');
    await befriend(alice, bob);
    await befriend(alice, carl);
    carl.setTrusted(alice.identity.id, true);

    const file = randomFile(tmpDir('src'), 'shared.bin', 8 * 1024 * 1024);
    const files = inspectPaths([file]).files;
    const out = alice.send(files, [bob.identity.id, carl.identity.id]);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((t) => t.batch)).size).toBe(1);
    const toBob = out.find((t) => t.peerId === bob.identity.id)!;
    const toCarl = out.find((t) => t.peerId === carl.identity.id)!;

    // Carl's starts by itself, Bob's waits for him
    await until(() => status(carl, toCarl.xid) === 'done', 15_000, 'carl done');
    expect(carl.transfers.get(toCarl.xid)!.auto).toBe(true);
    expect(status(alice, toBob.xid)).toBe('waiting');
    bob.transfers.accept(toBob.xid);
    await until(() => status(alice, toBob.xid) === 'done' && status(alice, toCarl.xid) === 'done', 15_000, 'both done');
    expect(sha256(bob.transfers.get(toBob.xid)!.saved![0]!)).toBe(sha256(file));

    // a second offer to both: Bob declines, Carl (trusted) still gets it
    const again = alice.send(files, [bob.identity.id, carl.identity.id]);
    const bob2 = again.find((t) => t.peerId === bob.identity.id)!;
    const carl2 = again.find((t) => t.peerId === carl.identity.id)!;
    await until(() => offerFrom(bob, alice) !== undefined, 5000, 'offer 2');
    bob.transfers.decline(bob2.xid);
    await until(() => status(alice, bob2.xid) === 'declined', 5000, 'declined');
    expect(alice.transfers.get(bob2.xid)!.reason).toBe('Bob declined');
    await until(() => status(alice, carl2.xid) === 'done', 15_000, 'carl 2 done');
    expect(path.basename(carl.transfers.get(carl2.xid)!.saved![0]!)).toBe('shared (1).bin');
  });

  it('a dropped connection mid-transfer fails on both sides and leaves no part file', async () => {
    const alice = await stores.boot('Alice', { tuning: { graceMs: 100 } });
    const bob = await stores.boot('Bob', { tuning: { graceMs: 100 } });
    await befriend(alice, bob);
    bob.setTrusted(alice.identity.id, true);
    const file = randomFile(tmpDir('src'), 'huge.bin', 300 * 1024 * 1024);
    const [t] = alice.send(inspectPaths([file]).files, [bob.identity.id]);
    await until(() => (bob.transfers.get(t!.xid)?.bytes ?? 0) > 1024 * 1024, 15_000, 'some bytes');

    // pull the plug on the data connection (like a laptop leaving the Wi-Fi)
    const links = (alice.transfers as unknown as { runtime: Map<string, { link?: { destroy(r: string): void } }> }).runtime;
    links.get(t!.xid)!.link!.destroy('Simulated network failure');

    await until(() => status(alice, t!.xid) === 'failed' && status(bob, t!.xid) === 'failed', 10_000, 'failed');
    expect(bob.transfers.get(t!.xid)!.reason).toBe('connection lost');
    await sleep(100);
    expect(listDir(bob.downloadDir())).toEqual([]);
    expect(bob.history.recent(1)[0]).toMatchObject({ result: 'failed' });
  });

  it('cancelling from either side stops it for both and cleans up', async () => {
    const alice = await stores.boot('Alice');
    const bob = await stores.boot('Bob');
    await befriend(alice, bob);
    bob.setTrusted(alice.identity.id, true);
    const file = randomFile(tmpDir('src'), 'movie.bin', 300 * 1024 * 1024);
    const files = inspectPaths([file]).files;

    const [t1] = alice.send(files, [bob.identity.id]);
    await until(() => (bob.transfers.get(t1!.xid)?.bytes ?? 0) > 0, 15_000, 'bytes 1');
    bob.transfers.cancel(t1!.xid);
    await until(() => status(alice, t1!.xid) === 'cancelled' && status(bob, t1!.xid) === 'cancelled', 5000, 'cancel by receiver');
    expect(alice.transfers.get(t1!.xid)!.cancelledBy).toBe('peer');

    const [t2] = alice.send(files, [bob.identity.id]);
    await until(() => (bob.transfers.get(t2!.xid)?.bytes ?? 0) > 0, 15_000, 'bytes 2');
    alice.transfers.cancel(t2!.xid);
    await until(() => status(bob, t2!.xid) === 'cancelled', 5000, 'cancel by sender');
    expect(bob.transfers.get(t2!.xid)!.reason).toBe('cancelled by Alice');
    await sleep(200);
    expect(listDir(bob.downloadDir())).toEqual([]);
  });

  it('an offer expires when the sender goes offline, and offers from non-friends are ignored', async () => {
    const alice = await stores.boot('Alice');
    const bob = await stores.boot('Bob');
    await befriend(alice, bob);
    const file = randomFile(tmpDir('src'), 'a.txt', 10);
    const [t] = alice.send(inspectPaths([file]).files, [bob.identity.id]);
    await until(() => offerFrom(bob, alice) !== undefined, 5000, 'offer');
    await alice.stop();
    stores.all.splice(stores.all.indexOf(alice), 1);
    await until(() => offerFrom(bob, alice) === undefined, 5000, 'offer gone');
    expect(['expired', 'declined', 'cancelled']).toContain(status(bob, t!.xid));

    // Carl isn't Bob's friend: his offer never shows up
    const carl = await stores.boot('Carl');
    await carl.addByAddress('127.0.0.1', bob.network.port);
    await until(() => bob.friend(carl.identity.id)?.state === 'incoming', 5000, 'request');
    carl.network.get(bob.identity.id)!.send({ t: 'offer', xid: 'strangerxid000', files: [{ name: 'x', size: 1 }], total: 1 });
    await sleep(200);
    expect(bob.dashboard().requests.filter((r) => r.kind === 'offer')).toHaveLength(0);
  });
});
