import crypto from 'node:crypto';
import type { FailReason } from '../core/protocol.js';
import { finalizePart, removePart, reservePart, type Reserved } from './filenames.js';
import type { LinkFrame, DataLink } from './link.js';
import type { OfferFile } from './offer.js';
import { FAIL_TEXT, TransferError, type PumpOptions } from './sender.js';

/** Frames waiting to be written before the connection is paused (≈ 2 MB). */
const QUEUE_HIGH = 32;
const QUEUE_LOW = 8;

export interface ReceiveResult {
  /** where the files were saved, in offer order */
  saved: string[];
}

/** A failed receive still reports the files that were complete and verified before it. */
export class ReceiveError extends TransferError {
  saved: string[] = [];
}

/**
 * Receives the files of an accepted offer into `dir`. Each file is written to
 * `<name>.termdrop-part` (created exclusively), hashed on the way, and renamed – never over an
 * existing file – only once the sender's SHA-256 matches. Bytes beyond the announced size end
 * the transfer at once. On any failure the current part file is deleted; files that were
 * already complete and verified are kept.
 */
export function receiveFiles(link: DataLink, files: OfferFile[], dir: string, opts: PumpOptions): Promise<ReceiveResult> {
  return new Promise((resolve, reject) => {
    const saved: string[] = [];
    const queue: LinkFrame[] = [];
    let paused = false;
    let running = false;
    let finished = false;
    let index = 0;
    let got = 0;
    let total = 0;
    let current: (Reserved & { hash: crypto.Hash }) | null = null;

    const fail = async (err: TransferError, tell?: FailReason) => {
      if (finished) return;
      finished = true;
      queue.length = 0;
      if (tell) {
        link.sendMsg({ t: 'failed', reason: tell });
        link.end();
      } else {
        link.destroy(err.kind === 'cancelled' ? 'Cancelled' : 'Transfer failed');
      }
      const part = current;
      current = null;
      if (part) {
        await part.handle.close().catch(() => {});
        await removePart(part.partPath);
      }
      const out = new ReceiveError(err.kind, err.reason, err.message);
      out.saved = saved;
      reject(out);
    };
    const local = (reason: FailReason, message: string) => fail(new TransferError('local', reason, message), reason);

    const open = async () => {
      if (current) return current;
      const r = await reservePart(dir, files[index]!.name);
      current = { ...r, hash: crypto.createHash('sha256') };
      return current;
    };

    const handle = async (f: LinkFrame): Promise<void> => {
      if (f.kind === 'data') {
        const file = files[index];
        if (!file || got + f.data.length > file.size) return local('too_much_data', FAIL_TEXT.too_much_data);
        const c = await open();
        c.hash.update(f.data);
        got += f.data.length;
        total += f.data.length;
        // awaiting every write is the disk's backpressure: the queue fills, the socket pauses
        await c.handle.write(f.data);
        opts.onProgress(total, index);
        return;
      }
      const msg = f.msg;
      if (msg.t === 'failed') return fail(new TransferError('peer', msg.reason, FAIL_TEXT[msg.reason]));
      if (msg.t !== 'eof' || msg.i !== index || got !== files[index]?.size) return local('protocol', FAIL_TEXT.protocol);
      const c = await open();
      await c.handle.close();
      current = null;
      if (c.hash.digest('hex') !== msg.sha256) {
        await removePart(c.partPath);
        return local('hash_mismatch', `${files[index]!.name} arrived damaged (checksum mismatch)`);
      }
      saved.push(await finalizePart(dir, c.partPath, files[index]!.name, c.n));
      index++;
      got = 0;
      opts.onProgress(total, Math.min(index, files.length - 1));
      if (index === files.length) {
        finished = true;
        link.sendMsg({ t: 'done' });
        link.end();
        resolve({ saved });
      }
    };

    const pump = async () => {
      if (running) return;
      running = true;
      try {
        while (queue.length && !finished) {
          await handle(queue.shift()!);
          if (paused && queue.length <= QUEUE_LOW) {
            paused = false;
            link.resume();
          }
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        const text = code === 'ENOSPC' ? 'The disk is full' : `Couldn't save the file: ${(err as Error).message}`;
        await local('disk_error', text);
      } finally {
        running = false;
      }
    };

    link.on('frame', (f) => {
      if (finished) return;
      queue.push(f);
      if (!paused && queue.length >= QUEUE_HIGH) {
        paused = true;
        link.pause();
      }
      void pump();
    });
    link.on('close', () => {
      if (finished) return;
      // let what's queued be checked first: a 'failed' from the sender says more than the close
      const wait = () => (running || queue.length ? setTimeout(wait, 10) : void fail(new TransferError('connection', null, 'The connection was lost')));
      wait();
    });
    opts.signal?.addEventListener('abort', () => void fail(new TransferError('cancelled', null, 'Cancelled')));
    link.start();
  });
}
