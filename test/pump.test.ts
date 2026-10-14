import crypto from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LinkMsg } from '../src/core/protocol.js';
import type { DataLink } from '../src/transfer/link.js';
import { inspectPaths } from '../src/transfer/local.js';
import { ReceiveError, receiveFiles } from '../src/transfer/receiver.js';
import { sendFiles, TransferError } from '../src/transfer/sender.js';
import { linkPair, listDir, randomFile, sha256, sleep, tmpDir } from './helpers.js';

const noop = () => {};
const hex = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

/** What the (hand-driven) sender hears back. */
function replies(link: DataLink): LinkMsg[] {
  const got: LinkMsg[] = [];
  link.on('frame', (f) => f.kind === 'msg' && got.push(f.msg));
  link.start();
  return got;
}

async function failure(p: Promise<unknown>): Promise<ReceiveError> {
  try {
    await p;
  } catch (err) {
    return err as ReceiveError;
  }
  throw new Error('expected the transfer to fail');
}

describe('sending and receiving bytes', () => {
  it('streams several files, including an empty one, and verifies them', async () => {
    const { sender, receiver, close } = await linkPair();
    const src = tmpDir('pump-src');
    const dst = tmpDir('pump-dst');
    const paths = [randomFile(src, 'one.bin', 3 * 65_519 + 7), randomFile(src, 'empty', 0), randomFile(src, 'two.txt', 10)];
    const files = inspectPaths(paths).files;
    const progress: number[] = [];
    const [, got] = await Promise.all([
      sendFiles(sender, files, { onProgress: (b) => progress.push(b) }),
      receiveFiles(receiver, files.map((f) => ({ name: f.name, size: f.size })), dst, { onProgress: noop }),
    ]);
    expect(got.saved.map((p) => path.basename(p))).toEqual(['one.bin', 'empty', 'two.txt']);
    expect(got.saved.map(sha256)).toEqual(paths.map(sha256));
    expect(progress.at(-1)).toBe(3 * 65_519 + 17);
    // monotonic
    expect(progress.every((b, i) => i === 0 || b >= progress[i - 1]!)).toBe(true);
    close();
  });

  it('a hash mismatch fails the transfer and deletes the part file', async () => {
    const { sender, receiver, close } = await linkPair();
    const dst = tmpDir('pump-hash');
    const heard = replies(sender);
    const data = crypto.randomBytes(1000);
    const p = receiveFiles(receiver, [{ name: 'doc.pdf', size: 1000 }], dst, { onProgress: noop });
    sender.sendData(data);
    sender.sendMsg({ t: 'eof', i: 0, sha256: hex(Buffer.from('something else')) });
    const err = await failure(p);
    expect(err).toBeInstanceOf(ReceiveError);
    expect(err.reason).toBe('hash_mismatch');
    await sleep(50);
    expect(heard).toContainEqual({ t: 'failed', reason: 'hash_mismatch' });
    expect(listDir(dst)).toEqual([]);
    close();
  });

  it('more bytes than announced end the transfer at once', async () => {
    const { sender, receiver, close } = await linkPair();
    const dst = tmpDir('pump-much');
    const heard = replies(sender);
    const p = receiveFiles(receiver, [{ name: 'small.txt', size: 10 }], dst, { onProgress: noop });
    sender.sendData(Buffer.alloc(8));
    sender.sendData(Buffer.alloc(8));
    const err = await failure(p);
    expect(err.reason).toBe('too_much_data');
    await sleep(50);
    expect(heard).toContainEqual({ t: 'failed', reason: 'too_much_data' });
    expect(listDir(dst)).toEqual([]);
    close();
  });

  it('data for an empty file, an eof out of order, or a short file fail too', async () => {
    const cases: { files: { name: string; size: number }[]; act(s: DataLink): void }[] = [
      {
        files: [{ name: 'a', size: 0 }],
        act: (s) => {
          s.sendData(Buffer.alloc(1));
          s.sendMsg({ t: 'eof', i: 0, sha256: hex(Buffer.alloc(0)) });
        },
      },
      { files: [{ name: 'a', size: 0 }, { name: 'b', size: 0 }], act: (s) => s.sendMsg({ t: 'eof', i: 1, sha256: hex(Buffer.alloc(0)) }) },
      {
        files: [{ name: 'a', size: 4 }],
        act: (s) => {
          s.sendData(Buffer.alloc(2));
          s.sendMsg({ t: 'eof', i: 0, sha256: hex(Buffer.alloc(2)) });
        },
      },
    ];
    for (const c of cases) {
      const { sender, receiver, close } = await linkPair();
      const dst = tmpDir('pump-bad');
      replies(sender);
      const p = receiveFiles(receiver, c.files, dst, { onProgress: noop });
      c.act(sender);
      const err = await failure(p);
      expect(err).toBeInstanceOf(ReceiveError);
      expect(['too_much_data', 'protocol']).toContain(err.reason);
      await sleep(30);
      expect(listDir(dst).filter((n) => n.endsWith('.termdrop-part'))).toEqual([]);
      close();
    }
  });

  it('cancelling mid-file leaves nothing behind; verified earlier files stay', async () => {
    const { sender, receiver, close } = await linkPair();
    const dst = tmpDir('pump-abort');
    replies(sender);
    const first = Buffer.from('complete file');
    const abort = new AbortController();
    const p = receiveFiles(receiver, [{ name: 'first.txt', size: first.length }, { name: 'second.bin', size: 1_000_000 }], dst, {
      onProgress: noop,
      signal: abort.signal,
    });
    sender.sendData(first);
    sender.sendMsg({ t: 'eof', i: 0, sha256: hex(first) });
    sender.sendData(crypto.randomBytes(50_000));
    await sleep(100);
    expect(listDir(dst)).toEqual(['first.txt', 'second.bin.termdrop-part']);
    abort.abort();
    const err = await failure(p);
    expect(err.kind).toBe('cancelled');
    expect(err.saved.map((s) => path.basename(s))).toEqual(['first.txt']);
    await sleep(50);
    expect(listDir(dst)).toEqual(['first.txt']);
    close();
  });

  it('a connection that drops mid-file fails on both sides without leftovers', async () => {
    const { sender, receiver, close } = await linkPair();
    const src = tmpDir('pump-drop-src');
    const dst = tmpDir('pump-drop-dst');
    const file = inspectPaths([randomFile(src, 'big.bin', 20 * 1024 * 1024)]).files;
    let killed = false;
    const sending = sendFiles(sender, file, {
      onProgress: (b) => {
        if (b > 2 * 1024 * 1024 && !killed) {
          killed = true;
          receiver.destroy('network gone');
        }
      },
    }).catch((e) => e);
    const err = await failure(receiveFiles(receiver, [{ name: 'big.bin', size: file[0]!.size }], dst, { onProgress: noop }));
    expect(err.kind).toBe('connection');
    const sendErr = (await sending) as TransferError;
    expect(sendErr).toBeInstanceOf(TransferError);
    expect(sendErr.kind).toBe('connection');
    await sleep(50);
    expect(listDir(dst)).toEqual([]);
    close();
  });

  it('a file that grows while it is sent is refused on both sides', async () => {
    const { sender, receiver, close } = await linkPair();
    const src = tmpDir('pump-grow');
    const dst = tmpDir('pump-grow-dst');
    const real = randomFile(src, 'log.txt', 5000);
    const announced = [{ path: real, name: 'log.txt', size: 4000 }];
    const sending = sendFiles(sender, announced, { onProgress: noop }).catch((e) => e);
    const err = await failure(receiveFiles(receiver, [{ name: 'log.txt', size: 4000 }], dst, { onProgress: noop }));
    expect(err.reason).toBe('file_changed');
    expect(((await sending) as TransferError).reason).toBe('file_changed');
    expect(listDir(dst)).toEqual([]);
    close();
  });
});
