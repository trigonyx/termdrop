import { afterEach, describe, expect, it } from 'vitest';
import type { Wire } from '../src/core/protocol.js';
import type { HistoryEntry } from '../src/transfer/history.js';
import type { DataLink } from '../src/transfer/link.js';
import { TransferManager, type TransferDeps } from '../src/transfer/manager.js';
import { tmpDir } from './helpers.js';

const BOB = 'BOBBOBBOBBOBBOBBOBBO';
const CARL = 'CARLCARLCARLCARLCARL';
const EVE = 'EVEEVEEVEEVEEVEEVEEE';
const MB = 1000 * 1000;
const file = (name: string, size: number) => ({ path: `/tmp/${name}`, name, size });

interface Fake {
  m: TransferManager;
  sent: { to: string; msg: Wire }[];
  toasts: string[];
  notes: string[];
  records: HistoryEntry[];
  online: Set<string>;
  friends: Set<string>;
  trusted: Set<string>;
  free: { bytes: number | null };
  dials: string[];
}

const managers: TransferManager[] = [];
afterEach(() => {
  for (const m of managers.splice(0)) m.stop();
});

/** A manager with fake friends and a fake disk; data connections never come up (not needed here). */
function fake(patch: Partial<TransferDeps> = {}): Fake {
  const f = {
    sent: [] as Fake['sent'],
    toasts: [] as string[],
    notes: [] as string[],
    records: [] as HistoryEntry[],
    online: new Set([BOB, CARL, EVE]),
    friends: new Set([BOB, CARL]),
    trusted: new Set<string>(),
    free: { bytes: 10_000 * MB as number | null },
    dials: [] as string[],
  };
  const dir = tmpDir('mgr');
  const m = new TransferManager({
    send: (to, msg) => {
      if (!f.online.has(to)) return false;
      f.sent.push({ to, msg });
      return true;
    },
    isOnline: (id) => f.online.has(id),
    isFriend: (id) => f.friends.has(id),
    isTrusted: (id) => f.trusted.has(id),
    nameOf: (id) => (id === BOB ? 'Bob' : id === CARL ? 'Carl' : 'Eve'),
    dialsData: () => true,
    dialData: (_id, xid) => {
      f.dials.push(xid);
      return new Promise<DataLink>(() => {});
    },
    downloadDir: () => dir,
    freeSpace: () => f.free.bytes,
    changed: () => {},
    toast: (t) => f.toasts.push(t),
    notify: (_t, b) => f.notes.push(b),
    record: (e) => f.records.push(e),
    tuning: { reserveBytes: 100 * MB },
    ...patch,
  });
  managers.push(m);
  return { m, ...f };
}

const offerMsg = (xid: string, size = 5 * MB, n = 1): Wire => ({
  t: 'offer',
  xid,
  files: Array.from({ length: n }, (_, i) => ({ name: `f${i}.bin`, size })),
  total: size * n,
});
const lastTo = (f: Fake, to: string) => f.sent.filter((s) => s.to === to).at(-1)?.msg;

describe('transfer manager: sending', () => {
  it('offers to several friends at once, one transfer each', () => {
    const f = fake();
    const out = f.m.offer([file('a.txt', 10), file('b.txt', 20)], [BOB, CARL]);
    expect(out).toHaveLength(2);
    expect(out[0]!.batch).toBe(out[1]!.batch);
    expect(out[0]!.xid).not.toBe(out[1]!.xid);
    const msg = lastTo(f, BOB) as Extract<Wire, { t: 'offer' }>;
    expect(msg).toMatchObject({ t: 'offer', total: 30, files: [{ name: 'a.txt', size: 10 }, { name: 'b.txt', size: 20 }] });
    // the local paths never go over the wire
    expect(JSON.stringify(msg)).not.toContain('/tmp/');
  });

  it('only to online friends', () => {
    const f = fake();
    f.online.delete(CARL);
    expect(f.m.offer([file('a', 1)], [BOB, CARL, EVE]).map((t) => t.peerId)).toEqual([BOB]);
  });

  it('a receiver who declines does not hold up the others', () => {
    const f = fake();
    const [toBob, toCarl] = f.m.offer([file('a', 1)], [BOB, CARL]);
    f.m.onWire(BOB, { t: 'reject', xid: toBob!.xid, reason: 'declined' });
    f.m.onWire(CARL, { t: 'accept', xid: toCarl!.xid });
    expect(f.m.get(toBob!.xid)).toMatchObject({ status: 'declined', reason: 'Bob declined' });
    expect(f.m.get(toCarl!.xid)!.status).toBe('connecting');
    expect(f.dials).toEqual([toCarl!.xid]);
    expect(f.records.map((r) => r.result)).toEqual(['declined']);
  });

  it('says clearly why a receiver said no', () => {
    const f = fake();
    const [t] = f.m.offer([file('a', 1)], [BOB]);
    f.m.onWire(BOB, { t: 'reject', xid: t!.xid, reason: 'no_space' });
    expect(f.m.get(t!.xid)!.reason).toBe("Bob doesn't have enough free space");
    expect(f.toasts.at(-1)).toContain("Bob doesn't have enough free space");
  });

  it('answers only count from the friend the offer went to', () => {
    const f = fake();
    const [t] = f.m.offer([file('a', 1)], [BOB]);
    f.m.onWire(CARL, { t: 'accept', xid: t!.xid });
    f.m.onWire(CARL, { t: 'cancel', xid: t!.xid });
    expect(f.m.get(t!.xid)!.status).toBe('waiting');
  });

  it('the sender can withdraw an offer; the receiver can cancel', () => {
    const f = fake();
    const [a, b] = f.m.offer([file('a', 1)], [BOB, CARL]);
    f.m.cancel(a!.xid);
    expect(lastTo(f, BOB)).toEqual({ t: 'cancel', xid: a!.xid });
    expect(f.m.get(a!.xid)).toMatchObject({ status: 'cancelled', cancelledBy: 'me' });
    f.m.onWire(CARL, { t: 'accept', xid: b!.xid });
    f.m.onWire(CARL, { t: 'cancel', xid: b!.xid });
    expect(f.m.get(b!.xid)).toMatchObject({ status: 'cancelled', cancelledBy: 'peer', reason: 'cancelled by Carl' });
  });

  it('unanswered offers expire when the receiver goes offline', () => {
    const f = fake();
    const [t] = f.m.offer([file('a', 1)], [BOB]);
    f.m.onPeerOffline(BOB);
    expect(f.m.get(t!.xid)).toMatchObject({ status: 'expired', reason: 'Bob went offline' });
  });

  it('refuses offers that would not fit in one message', () => {
    const f = fake();
    const files = Array.from({ length: 400 }, (_, i) => file(`${'x'.repeat(200)}${i}`, 1));
    expect(() => f.m.offer(files, [BOB])).toThrow(/zip them/);
  });
});

describe('transfer manager: receiving', () => {
  it('an offer waits for an answer; accept opens the data connection', () => {
    const f = fake();
    f.m.onWire(BOB, offerMsg('offer000000001', 5 * MB, 3));
    expect(f.m.incomingOffers()).toHaveLength(1);
    expect(f.toasts.at(-1)).toBe('Bob wants to send you 3 files · 15.0 MB');
    expect(f.notes.at(-1)).toBe('Bob wants to send you 3 files · 15.0 MB');
    f.m.accept('offer000000001');
    expect(lastTo(f, BOB)).toEqual({ t: 'accept', xid: 'offer000000001' });
    expect(f.m.get('offer000000001')!.status).toBe('connecting');
    expect(f.dials).toEqual(['offer000000001']);
  });

  it('declining tells the sender', () => {
    const f = fake();
    f.m.onWire(BOB, offerMsg('offer000000002'));
    f.m.decline('offer000000002');
    expect(lastTo(f, BOB)).toEqual({ t: 'reject', xid: 'offer000000002', reason: 'declined' });
    expect(f.m.incomingOffers()).toHaveLength(0);
    expect(f.records[0]).toMatchObject({ dir: 'in', result: 'declined' });
  });

  it('trusted friends: accepted automatically, with a toast and a notification', () => {
    const f = fake();
    f.trusted.add(BOB);
    f.m.onWire(BOB, offerMsg('offer000000003', 1 * MB, 2));
    expect(f.m.get('offer000000003')).toMatchObject({ status: 'connecting', auto: true });
    expect(lastTo(f, BOB)).toEqual({ t: 'accept', xid: 'offer000000003' });
    expect(f.toasts.at(-1)).toBe('Receiving 2 files from Bob (2.0 MB)');
    expect(f.notes.at(-1)).toBe('Receiving 2 files from Bob');
  });

  it('declined automatically when the disk is too full – even for trusted friends', () => {
    const f = fake();
    f.trusted.add(BOB);
    f.free.bytes = 150 * MB; // 100 MB reserve
    f.m.onWire(BOB, offerMsg('offer000000004', 60 * MB));
    expect(lastTo(f, BOB)).toEqual({ t: 'reject', xid: 'offer000000004', reason: 'no_space' });
    expect(f.m.incomingOffers()).toHaveLength(0);
    expect(f.toasts.at(-1)).toContain('not enough free space');
    // a smaller one fits
    f.m.onWire(BOB, offerMsg('offer000000005', 40 * MB));
    expect(f.m.get('offer000000005')!.status).toBe('connecting');
    // and counts against the next one while it runs
    f.m.onWire(BOB, offerMsg('offer000000006', 40 * MB));
    expect(lastTo(f, BOB)).toEqual({ t: 'reject', xid: 'offer000000006', reason: 'no_space' });
  });

  it('checks the space again when accepting by hand', () => {
    const f = fake();
    f.m.onWire(BOB, offerMsg('offer000000007', 60 * MB));
    f.free.bytes = 120 * MB;
    f.m.accept('offer000000007');
    expect(lastTo(f, BOB)).toEqual({ t: 'reject', xid: 'offer000000007', reason: 'no_space' });
  });

  it('ignores offers from non-friends and blocked people', () => {
    const f = fake();
    f.m.onWire(EVE, offerMsg('offer000000008'));
    expect(f.m.incomingOffers()).toHaveLength(0);
    expect(f.sent).toHaveLength(0);
  });

  it('an offer disappears when the sender withdraws it or goes offline', () => {
    const f = fake();
    f.m.onWire(BOB, offerMsg('offer000000009'));
    f.m.onWire(BOB, { t: 'cancel', xid: 'offer000000009' });
    expect(f.m.incomingOffers()).toHaveLength(0);
    expect(f.toasts.at(-1)).toBe('Bob withdrew the offer');
    f.m.onWire(CARL, offerMsg('offer000000010'));
    f.m.onPeerOffline(CARL);
    expect(f.m.get('offer000000010')!.status).toBe('expired');
    f.m.accept('offer000000010');
    expect(f.dials).toEqual([]);
  });

  it('too many offers at once: busy', () => {
    const f = fake();
    for (let i = 0; i < 5; i++) f.m.onWire(BOB, offerMsg(`offerbusy0000${i}`));
    f.m.onWire(BOB, offerMsg('offerbusy00009'));
    expect(lastTo(f, BOB)).toEqual({ t: 'reject', xid: 'offerbusy00009', reason: 'busy' });
    expect(f.m.incomingOffers()).toHaveLength(5);
  });

  it('a repeated transfer id is ignored', () => {
    const f = fake();
    f.m.onWire(BOB, offerMsg('offer000000011', 1));
    f.m.onWire(BOB, offerMsg('offer000000011', 999));
    expect(f.m.incomingOffers()).toHaveLength(1);
    expect(f.m.get('offer000000011')!.total).toBe(1);
  });

  it('fails if the data connection never comes up', async () => {
    const f = fake({ tuning: { linkTimeoutMs: 30, reserveBytes: 0 } });
    f.m.onWire(BOB, offerMsg('offer000000012'));
    f.m.accept('offer000000012');
    await new Promise((r) => setTimeout(r, 60));
    expect(f.m.get('offer000000012')).toMatchObject({ status: 'failed', reason: "couldn't connect to Bob" });
    expect(lastTo(f, BOB)).toEqual({ t: 'cancel', xid: 'offer000000012' });
  });

  it('data connections are only taken from the right friend for the right transfer', () => {
    const f = fake({ dialsData: () => false });
    f.m.onWire(BOB, offerMsg('offer000000013'));
    const destroyed: string[] = [];
    const fakeLink = (peerId: string, xid: string) => ({ peerId, xid, destroy: (r: string) => destroyed.push(r) }) as unknown as DataLink;
    // not accepted yet
    f.m.onLink(fakeLink(BOB, 'offer000000013'));
    f.m.accept('offer000000013');
    // wrong peer, unknown transfer
    f.m.onLink(fakeLink(CARL, 'offer000000013'));
    f.m.onLink(fakeLink(BOB, 'unknownxid0000'));
    expect(destroyed).toHaveLength(3);
    expect(f.m.get('offer000000013')!.status).toBe('connecting');
  });
});
