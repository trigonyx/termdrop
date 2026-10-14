import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CipherState } from '../src/core/channel.js';
import { encodeFrame, FrameDecoder, FrameSocket, FrameTooLargeError, MAX_FRAME } from '../src/core/framing.js';
import { performHandshake } from '../src/core/handshake.js';
import { loadOrCreateIdentity, safetyCode } from '../src/core/identity.js';
import { resolvePaths } from '../src/core/paths.js';
import { parseWire, reconcile } from '../src/core/protocol.js';
import { cleanName, sanitizeText } from '../src/core/sanitize.js';

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'termdrop-test-'));
}

describe('framing', () => {
  it('reassembles split and coalesced frames correctly', () => {
    const a = Buffer.from('hello');
    const b = Buffer.from('world, how are you?');
    const wire = Buffer.concat([encodeFrame(a), encodeFrame(b)]);
    const dec = new FrameDecoder();
    const out: Buffer[] = [];
    for (let i = 0; i < wire.length; i += 3) out.push(...dec.push(wire.subarray(i, i + 3)));
    expect(out.map(String)).toEqual(['hello', 'world, how are you?']);
  });

  it('rejects oversized frames', () => {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(MAX_FRAME + 1);
    expect(() => new FrameDecoder().push(header)).toThrow(FrameTooLargeError);
  });
});

describe('channel', () => {
  it('encrypts and detects tampering', () => {
    const key = crypto.randomBytes(32);
    const tx = new CipherState(key);
    const rx = new CipherState(key);
    const ct = tx.encrypt(Buffer.from('secret'));
    expect(rx.decrypt(ct).toString()).toBe('secret');

    const ct2 = tx.encrypt(Buffer.from('again'));
    ct2[0]! ^= 1;
    expect(() => rx.decrypt(ct2)).toThrow();
  });

  it('rejects replayed frames', () => {
    const key = crypto.randomBytes(32);
    const tx = new CipherState(key);
    const rx = new CipherState(key);
    const ct = tx.encrypt(Buffer.from('x'));
    rx.decrypt(ct);
    expect(() => rx.decrypt(ct)).toThrow();
  });
});

async function socketPair(): Promise<[FrameSocket, FrameSocket, () => void]> {
  const server = net.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  const accepted = new Promise<net.Socket>((r) => server.once('connection', r));
  const client = net.connect(port, '127.0.0.1');
  const srv = await accepted;
  return [new FrameSocket(client), new FrameSocket(srv), () => server.close()];
}

describe('handshake', () => {
  it('authenticates both sides and yields matching keys', async () => {
    const alice = loadOrCreateIdentity(resolvePaths(tmpHome()));
    const bob = loadOrCreateIdentity(resolvePaths(tmpHome()));
    const [a, b, close] = await socketPair();
    const [ra, rb] = await Promise.all([
      performHandshake(a, alice, 'Alice', true),
      performHandshake(b, bob, 'Bob', false),
    ]);
    expect(ra.peerId).toBe(bob.id);
    expect(rb.peerId).toBe(alice.id);
    expect(ra.peerName).toBe('Bob');
    expect(rb.recv.decrypt(ra.send.encrypt(Buffer.from('hi'))).toString()).toBe('hi');
    expect(ra.recv.decrypt(rb.send.encrypt(Buffer.from('yo'))).toString()).toBe('yo');
    a.destroy();
    b.destroy();
    close();
  });

  it('carries a transfer id from the one who dials, and only from them', async () => {
    const alice = loadOrCreateIdentity(resolvePaths(tmpHome()));
    const bob = loadOrCreateIdentity(resolvePaths(tmpHome()));
    const [a, b, close] = await socketPair();
    const [ra, rb] = await Promise.all([
      performHandshake(a, alice, 'Alice', true, 5000, 'xid-for-a-transfer'),
      performHandshake(b, bob, 'Bob', false),
    ]);
    expect(rb.xid).toBe('xid-for-a-transfer');
    expect(ra.xid).toBeUndefined();
    a.destroy();
    b.destroy();
    close();
  });

  it('fails against a non-termdrop peer', async () => {
    const alice = loadOrCreateIdentity(resolvePaths(tmpHome()));
    const [a, b, close] = await socketPair();
    b.send(Buffer.from('GET / HTTP/1.1'));
    await expect(performHandshake(a, alice, 'Alice', true, 1000)).rejects.toThrow();
    a.destroy();
    b.destroy();
    close();
  });

  it('identity survives restarts, safety code is symmetric', () => {
    const home = resolvePaths(tmpHome());
    const first = loadOrCreateIdentity(home);
    const second = loadOrCreateIdentity(home);
    expect(second.id).toBe(first.id);
    expect(first.id).toMatch(/^[A-Z2-7]{20}$/);
    const other = loadOrCreateIdentity(resolvePaths(tmpHome()));
    expect(safetyCode(first.publicRaw, other.publicRaw)).toBe(safetyCode(other.publicRaw, first.publicRaw));
  });
});

describe('protocol', () => {
  it('strictly validates incoming frames', () => {
    expect(parseWire(Buffer.from('kein json'))).toBeNull();
    expect(parseWire(Buffer.from('{"t":"hack"}'))).toBeNull();
    expect(parseWire(Buffer.from('{"t":"presence","away":true}'))).toEqual({ t: 'presence', away: true });
    expect(parseWire(Buffer.from('{"t":"presence","away":"yes"}'))).toBeNull();
    // keyrace's "racing" means nothing here
    expect(parseWire(Buffer.from('{"t":"presence","away":false,"racing":true}'))).toEqual({ t: 'presence', away: false });
    // termchat's messages mean nothing here
    expect(parseWire(Buffer.from('{"t":"msg","id":"abc","ts":1,"text":"hi"}'))).toBeNull();
    expect(parseWire(Buffer.from('[1,2]'))).toBeNull();
  });

  it('reconciles contact state', () => {
    expect(reconcile(null, 'outgoing')).toBe('incoming');
    expect(reconcile(null, 'none')).toBeNull();
    expect(reconcile('outgoing', 'accepted')).toBe('accepted');
    expect(reconcile('outgoing', 'outgoing')).toBe('accepted');
    expect(reconcile('accepted', 'none')).toBe('outgoing');
    expect(reconcile('incoming', 'none')).toBeNull();
    expect(reconcile('blocked', 'accepted')).toBe('blocked');
  });
});

describe('sanitize', () => {
  it('strips terminal control sequences', () => {
    expect(sanitizeText('\u001b[2J\u001b]0;pwned\u0007hello\u0007 \u001b[31mred')).toBe('hello red');
    expect(sanitizeText('a\r\nb\u202ec')).toBe('a\nbc');
    expect(cleanName('  Max\nPower  ')).toBe('Max Power');
    expect(cleanName(42)).toBe('Unknown');
  });
});
