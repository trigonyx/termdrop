import { describe, expect, it } from 'vitest';
import { secondsLeft, smoothSpeed, transition, type Transfer } from '../src/transfer/session.js';
import { formatBytes, formatEta, formatSpeed } from '../src/transfer/units.js';

const base = (patch: Partial<Transfer> = {}): Transfer => ({
  xid: 'xidxidxidxidx',
  dir: 'out',
  peerId: 'BOBBOBBOBBOBBOBBOBBO',
  peerName: 'Bob',
  files: [{ name: 'a.bin', size: 1000 }],
  total: 1000,
  status: 'waiting',
  createdAt: 0,
  bytes: 0,
  fileIndex: 0,
  speed: 0,
  ...patch,
});

describe('transfer state machine', () => {
  it('out: waiting → connecting → active → done', () => {
    let t = base();
    t = transition(t, { type: 'accepted' });
    expect(t.status).toBe('connecting');
    t = transition(t, { type: 'linked', at: 100 });
    expect(t).toMatchObject({ status: 'active', startedAt: 100 });
    t = transition(t, { type: 'progress', bytes: 500, fileIndex: 0, at: 600 });
    expect(t.bytes).toBe(500);
    expect(t.speed).toBe(1000);
    t = transition(t, { type: 'completed', at: 1100 });
    expect(t).toMatchObject({ status: 'done', bytes: 1000, endedAt: 1100 });
  });

  it("the sender may see the receiver's data connection before its accept", () => {
    expect(transition(base(), { type: 'linked', at: 1 }).status).toBe('active');
    expect(transition(base({ dir: 'in', status: 'offered' }), { type: 'linked', at: 1 }).status).toBe('offered');
  });

  it('in: offered → accepted (auto) or declined', () => {
    const offered = base({ dir: 'in', status: 'offered' });
    expect(transition(offered, { type: 'accepted', auto: true })).toMatchObject({ status: 'connecting', auto: true });
    expect(transition(offered, { type: 'rejected', reason: 'no_space', text: 'not enough free space', at: 5 })).toMatchObject({
      status: 'declined',
      rejectReason: 'no_space',
      endedAt: 5,
    });
  });

  it('cancel and fail from any open state; expiry only before the start', () => {
    for (const status of ['waiting', 'connecting', 'active'] as const) {
      expect(transition(base({ status }), { type: 'cancelled', by: 'peer', text: 'x', at: 1 })).toMatchObject({ status: 'cancelled', cancelledBy: 'peer' });
      expect(transition(base({ status }), { type: 'failed', text: 'boom', at: 1 })).toMatchObject({ status: 'failed', reason: 'boom' });
    }
    expect(transition(base(), { type: 'expired', text: 'offline', at: 1 }).status).toBe('expired');
    expect(transition(base({ status: 'active' }), { type: 'expired', text: 'offline', at: 1 }).status).toBe('active');
  });

  it('final states never change, and nonsense events are ignored', () => {
    const done = base({ status: 'done' });
    for (const e of [
      { type: 'accepted' },
      { type: 'failed', text: 'x', at: 1 },
      { type: 'cancelled', by: 'me', text: 'x', at: 1 },
      { type: 'progress', bytes: 1, fileIndex: 0, at: 1 },
    ] as const) {
      expect(transition(done, e)).toBe(done);
    }
    const waiting = base();
    expect(transition(waiting, { type: 'completed', at: 1 })).toBe(waiting);
    expect(transition(waiting, { type: 'progress', bytes: 10, fileIndex: 0, at: 1 })).toBe(waiting);
    const active = base({ status: 'active', bytes: 500, sampledAt: 0 });
    expect(transition(active, { type: 'progress', bytes: 400, fileIndex: 0, at: 10 })).toBe(active);
    expect(transition(active, { type: 'progress', bytes: 5000, fileIndex: 0, at: 10 }).bytes).toBe(1000);
  });

  it('speed is smoothed, and sinks when nothing moves', () => {
    expect(smoothSpeed(0, 1000, 1000)).toBe(1000);
    const s = smoothSpeed(1000, 3000, 100); // a burst of 30 kB/s for 100 ms
    expect(s).toBeGreaterThan(1000);
    expect(s).toBeLessThan(3000);
    let t = base({ status: 'active', speed: 1000, bytes: 100, sampledAt: 0 });
    expect(transition(t, { type: 'progress', bytes: 100, fileIndex: 0, at: 500 })).toBe(t);
    t = transition(t, { type: 'progress', bytes: 100, fileIndex: 0, at: 1500 });
    expect(t.speed).toBeLessThan(1000);
    expect(secondsLeft({ total: 1000, bytes: 0, speed: 100 })).toBe(10);
    expect(secondsLeft({ total: 1000, bytes: 0, speed: 0 })).toBeNull();
  });
});

describe('units', () => {
  it('sizes, speeds and calm time estimates', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(48_213_000)).toBe('48.2 MB');
    expect(formatBytes(999_960)).toBe('1.0 MB');
    expect(formatBytes(123_456_789_012)).toBe('123 GB');
    expect(formatSpeed(12_400_000)).toBe('12.4 MB/s');
    expect(formatEta(null)).toBe('');
    expect(formatEta(3)).toBe('<10s');
    expect(formatEta(21)).toBe('~25s');
    expect(formatEta(185)).toBe('~3 min');
    expect(formatEta(4800)).toBe('~1 h 20 min');
  });
});
