import { describe, expect, it } from 'vitest';
import { MAX_FRAME } from 'termcore/net/framing';
import { encodeWire, parseLinkMsg, parseWire, type Wire } from '../src/core/protocol.js';
import { MAX_FILES, MAX_WIRE_NAME } from '../src/transfer/offer.js';

const XID = 'abcDEF123_-xyz';
const parse = (o: unknown) => parseWire(Buffer.from(JSON.stringify(o)));
const link = (o: unknown) => parseLinkMsg(Buffer.from(JSON.stringify(o)));

describe('friend messages', () => {
  it('base messages come from termcore; other apps’ messages mean nothing here', () => {
    expect(parse({ t: 'presence', away: true })).toEqual({ t: 'presence', away: true });
    // keyrace's "racing" and termchat's messages are dropped
    expect(parse({ t: 'presence', away: false, racing: true })).toEqual({ t: 'presence', away: false });
    expect(parse({ t: 'msg', id: 'abc', ts: 1, text: 'hi' })).toBeNull();
    expect(parse({ t: 'invite', gid: 'abcdefgh', mode: 'sprint', param: 60, players: [] })).toBeNull();
    expect(parse({ t: 'state', name: 'Bob', state: 'accepted', port: 5054, color: '#73daca' })).toMatchObject({ color: '#73daca' });
  });
});

describe('transfer messages', () => {
  it('offer: files with sizes that add up to the total', () => {
    const files = [{ name: 'a.txt', size: 10 }, { name: 'b.bin', size: 0 }];
    expect(parse({ t: 'offer', xid: XID, files, total: 10 })).toEqual({ t: 'offer', xid: XID, files, total: 10 });
    expect(parse({ t: 'offer', xid: XID, files, total: 11 })).toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: [], total: 0 })).toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: [{ name: 'a', size: -1 }], total: -1 })).toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: [{ name: 'a', size: 1.5 }], total: 1.5 })).toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: [{ name: 'a', size: '1' }], total: 1 })).toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: [{ name: 5, size: 1 }], total: 1 })).toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: [{ size: 1 }], total: 1 })).toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: [['a', 1]], total: 1 })).toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: { name: 'a', size: 1 }, total: 1 })).toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: [{ name: 'a', size: 2 ** 53 }], total: 2 ** 53 })).toBeNull();
    const huge = Number.MAX_SAFE_INTEGER;
    expect(parse({ t: 'offer', xid: XID, files: [{ name: 'a', size: huge }, { name: 'b', size: 1 }], total: huge + 1 })).toBeNull();
  });

  it('offer: hostile names arrive cleaned, too many or too long ones are refused', () => {
    const msg = parse({ t: 'offer', xid: XID, files: [{ name: '../../etc/\u001b[2Jpasswd', size: 1 }, { name: '', size: 1 }], total: 2 });
    expect(msg).toEqual({ t: 'offer', xid: XID, files: [{ name: 'passwd', size: 1 }, { name: 'file', size: 1 }], total: 2 });
    const many = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ name: `f${i}`, size: 1 }));
    expect(parse({ t: 'offer', xid: XID, files: many, total: many.length })).toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: many.slice(1), total: MAX_FILES })).not.toBeNull();
    expect(parse({ t: 'offer', xid: XID, files: [{ name: 'x'.repeat(MAX_WIRE_NAME + 1), size: 1 }], total: 1 })).toBeNull();
  });

  it('a typical offer of 500 files fits in one frame', () => {
    const files = Array.from({ length: MAX_FILES }, (_, i) => ({ name: `IMG_${String(i).padStart(4, '0')} – holiday photo.jpeg`, size: 3_500_000 }));
    const msg: Wire = { t: 'offer', xid: XID, files, total: files.length * 3_500_000 };
    expect(encodeWire(msg).length).toBeLessThan(MAX_FRAME);
  });

  it('transfer ids are checked everywhere', () => {
    for (const t of ['accept', 'cancel'] as const) {
      expect(parse({ t, xid: XID })).toEqual({ t, xid: XID });
      expect(parse({ t, xid: '../x' })).toBeNull();
      expect(parse({ t, xid: 'short' })).toBeNull();
      expect(parse({ t, xid: 'x'.repeat(33) })).toBeNull();
      expect(parse({ t })).toBeNull();
    }
    expect(parse({ t: 'offer', xid: 7, files: [{ name: 'a', size: 1 }], total: 1 })).toBeNull();
  });

  it('reject carries a known reason (anything else reads as declined)', () => {
    for (const reason of ['declined', 'no_space', 'busy', 'too_large']) {
      expect(parse({ t: 'reject', xid: XID, reason })).toEqual({ t: 'reject', xid: XID, reason });
    }
    expect(parse({ t: 'reject', xid: XID, reason: '\u001b[2Jhaha' })).toEqual({ t: 'reject', xid: XID, reason: 'declined' });
    expect(parse({ t: 'reject', xid: 'nope' })).toBeNull();
  });

  it('messages on the data connection', () => {
    const sha = 'a'.repeat(64);
    expect(link({ t: 'eof', i: 0, sha256: sha })).toEqual({ t: 'eof', i: 0, sha256: sha });
    expect(link({ t: 'eof', i: -1, sha256: sha })).toBeNull();
    expect(link({ t: 'eof', i: 1.5, sha256: sha })).toBeNull();
    expect(link({ t: 'eof', i: 0, sha256: 'A'.repeat(64) })).toBeNull();
    expect(link({ t: 'eof', i: 0, sha256: 'a'.repeat(63) })).toBeNull();
    expect(link({ t: 'done' })).toEqual({ t: 'done' });
    expect(link({ t: 'failed', reason: 'hash_mismatch' })).toEqual({ t: 'failed', reason: 'hash_mismatch' });
    expect(link({ t: 'failed', reason: 'whatever' })).toEqual({ t: 'failed', reason: 'protocol' });
    expect(link({ t: 'offer' })).toBeNull();
    expect(parseLinkMsg(Buffer.from('garbage'))).toBeNull();
  });

  it('friend messages still work, game and chat messages mean nothing here', () => {
    expect(parse({ t: 'state', name: 'Bob', state: 'accepted', port: 5054 })).toEqual({ t: 'state', name: 'Bob', state: 'accepted', port: 5054 });
    expect(parse({ t: 'state', name: 'Bob', state: 'boss', port: 5054 })).toBeNull();
    expect(parse({ t: 'presence', away: true })).toEqual({ t: 'presence', away: true });
    expect(parse({ t: 'invite', gid: 'abcdefgh', mode: 'sprint', param: 60, players: [] })).toBeNull();
    expect(parse({ t: 'msg', id: 'x', ts: 1, text: 'hi' })).toBeNull();
    for (const t of ['decline', 'ping', 'pong', 'bye']) expect(parse({ t })).toEqual({ t });
  });
});
