import crypto from 'node:crypto';
import fs from 'node:fs';
import type { FailReason, LinkMsg } from '../core/protocol.js';
import { CHUNK_SIZE, type DataLink } from './link.js';
import type { LocalFile } from './local.js';

/** How long the sender waits for the receiver's verdict after the last byte. */
const VERDICT_TIMEOUT = 60_000;

/**
 * Why a transfer ended badly. `connection` = the data connection broke, `cancelled` = we
 * stopped it, `peer` = the other side reported `reason`.
 */
export class TransferError extends Error {
  constructor(
    readonly kind: 'local' | 'peer' | 'connection' | 'cancelled',
    readonly reason: FailReason | null,
    message: string,
  ) {
    super(message);
  }
}

export interface PumpOptions {
  /** total bytes so far and the index of the current file – called for every chunk */
  onProgress(bytes: number, fileIndex: number): void;
  signal?: AbortSignal;
}

export const FAIL_TEXT: Record<FailReason, string> = {
  hash_mismatch: 'a file arrived damaged (checksum mismatch)',
  too_much_data: 'more data arrived than announced',
  file_changed: 'a file changed while it was being sent',
  disk_error: "the receiver couldn't save the file",
  read_error: "a file couldn't be read",
  protocol: 'the transfer got out of step',
};

/**
 * Streams `files` over `link`, one after another, never holding more than a chunk in memory:
 * waits whenever the socket's buffer is full, hashes as it reads, and ends every file with its
 * SHA-256. Resolves once the receiver confirmed that every file arrived intact.
 */
export async function sendFiles(link: DataLink, files: LocalFile[], opts: PumpOptions): Promise<void> {
  type Verdict = LinkMsg | { t: 'closed'; reason: string };
  // set from event handlers – read through a box, so TypeScript doesn't narrow it away
  const box: { verdict: Verdict | null } = { verdict: null };
  let wake: (() => void) | null = null;
  const settle = (v: Verdict) => {
    box.verdict ??= v;
    wake?.();
  };
  link.on('frame', (f) => {
    if (f.kind === 'msg' && (f.msg.t === 'done' || f.msg.t === 'failed')) settle(f.msg);
    else settle({ t: 'failed', reason: 'protocol' }); // the receiver has nothing else to say
  });
  link.on('close', (reason) => settle({ t: 'closed', reason }));
  const onAbort = () => settle({ t: 'closed', reason: 'cancelled' });
  opts.signal?.addEventListener('abort', onAbort);
  link.start();

  const stopped = () => {
    const verdict = box.verdict;
    if (opts.signal?.aborted) return new TransferError('cancelled', null, 'Cancelled');
    if (!verdict) return null;
    if (verdict.t === 'failed') return new TransferError('peer', verdict.reason, FAIL_TEXT[verdict.reason]);
    if (verdict.t === 'closed') return new TransferError('connection', null, 'The connection was lost');
    return new TransferError('peer', 'protocol', FAIL_TEXT.protocol); // 'done' before the end
  };
  const giveUp = (reason: FailReason, message: string) => {
    link.sendMsg({ t: 'failed', reason });
    link.end();
    return new TransferError('local', reason, message);
  };

  try {
    let total = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const hash = crypto.createHash('sha256');
      let sent = 0;
      const stream = fs.createReadStream(file.path, { highWaterMark: CHUNK_SIZE });
      try {
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          const err = stopped();
          if (err) throw err;
          sent += chunk.length;
          if (sent > file.size) throw giveUp('file_changed', `${file.name} changed while it was being sent`);
          hash.update(chunk);
          total += chunk.length;
          if (!link.sendData(chunk)) {
            await new Promise<void>((resolve) => {
              wake = resolve;
              void link.drained().then(resolve);
            });
            wake = null;
          }
          opts.onProgress(total, i);
        }
      } catch (err) {
        if (err instanceof TransferError) throw err;
        throw giveUp('read_error', `Couldn't read ${file.name}: ${(err as Error).message}`);
      } finally {
        stream.destroy();
      }
      const err = stopped();
      if (err) throw err;
      if (sent !== file.size) throw giveUp('file_changed', `${file.name} changed while it was being sent`);
      link.sendMsg({ t: 'eof', i, sha256: hash.digest('hex') });
      opts.onProgress(total, i);
    }

    // everything is out – wait for the receiver to check the hashes and save the files
    if (!box.verdict) {
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, VERDICT_TIMEOUT).unref();
      });
      wake = null;
    }
    if (box.verdict?.t === 'done') {
      link.end();
      return;
    }
    throw stopped() ?? new TransferError('connection', null, 'The receiver stopped answering');
  } catch (err) {
    // a local failure already told the receiver and closes gracefully, so its message gets out
    if (!(err instanceof TransferError && err.kind === 'local')) {
      link.destroy(err instanceof TransferError && err.kind === 'cancelled' ? 'Cancelled' : 'Transfer failed');
    }
    throw err;
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
