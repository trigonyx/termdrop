import type { Socket } from 'node:net';
import { EventEmitter } from 'node:events';

/** Largest allowed frame. Protects against memory DoS via absurd length prefixes. */
export const MAX_FRAME = 64 * 1024;

export class FrameTooLargeError extends Error {
  constructor(size: number) {
    super(`Frame too large (${size} bytes)`);
  }
}

export function encodeFrame(payload: Buffer): Buffer {
  if (payload.length > MAX_FRAME) throw new FrameTooLargeError(payload.length);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

/**
 * Reassembles TCP chunks into frames. TCP has no message boundaries – that's exactly
 * why messages got split or glued together in the old chat.
 */
export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames: Buffer[] = [];
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (len > MAX_FRAME) throw new FrameTooLargeError(len);
      if (this.buffer.length < 4 + len) break;
      frames.push(Buffer.from(this.buffer.subarray(4, 4 + len)));
      this.buffer = this.buffer.subarray(4 + len);
    }
    return frames;
  }
}

/**
 * Socket with a frame interface. During the handshake `read()` waits for specific frames;
 * afterwards the `frame` event delivers everything else.
 */
export class FrameSocket extends EventEmitter<{ frame: [Buffer]; close: [Error | undefined] }> {
  private decoder = new FrameDecoder();
  private queue: Buffer[] = [];
  private waiter: { resolve: (f: Buffer) => void; reject: (e: Error) => void } | null = null;
  private streaming = false;
  private closed = false;
  private closeError: Error | undefined;

  constructor(readonly socket: Socket) {
    super();
    socket.setNoDelay(true);
    socket.on('data', (chunk: Buffer) => {
      let frames: Buffer[];
      try {
        frames = this.decoder.push(chunk);
      } catch (err) {
        this.destroy(err as Error);
        return;
      }
      for (const f of frames) this.deliver(f);
    });
    socket.on('error', (err) => this.finish(err));
    socket.on('close', () => this.finish(undefined));
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get remoteAddress(): string {
    return (this.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  }

  private deliver(frame: Buffer): void {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve(frame);
    } else if (this.streaming) {
      this.emit('frame', frame);
    } else {
      this.queue.push(frame);
    }
  }

  read(timeoutMs: number): Promise<Buffer> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(this.closeError ?? new Error('Connection closed'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error('Handshake timed out'));
      }, timeoutMs);
      this.waiter = {
        resolve: (f) => {
          clearTimeout(timer);
          resolve(f);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
    });
  }

  /** From now on, frames are delivered as events (including already buffered ones). */
  startStreaming(): void {
    this.streaming = true;
    const pending = this.queue;
    this.queue = [];
    for (const f of pending) this.emit('frame', f);
  }

  send(payload: Buffer): boolean {
    if (this.closed) return false;
    this.socket.write(encodeFrame(payload));
    return true;
  }

  /**
   * Like send(), for bulk data: header and payload go out without being copied together, and
   * the result is the socket's backpressure signal – `false` means wait for drained().
   */
  write(payload: Buffer): boolean {
    if (this.closed) return false;
    if (payload.length > MAX_FRAME) throw new FrameTooLargeError(payload.length);
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(payload.length, 0);
    this.socket.cork();
    this.socket.write(header);
    const ok = this.socket.write(payload);
    this.socket.uncork();
    return ok;
  }

  /** Resolves once the socket's send buffer has room again (or the connection is gone). */
  drained(): Promise<void> {
    if (this.closed || !this.socket.writableNeedDrain) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.socket.off('drain', done);
        this.off('close', done);
        resolve();
      };
      this.socket.on('drain', done);
      this.on('close', done);
    });
  }

  /** Stops reading from the socket (the receiver's disk can't keep up). */
  pause(): void {
    this.socket.pause();
  }

  resume(): void {
    if (!this.closed) this.socket.resume();
  }

  /** Graceful close: buffered data is still sent. */
  end(): void {
    if (!this.closed) this.socket.end();
  }

  destroy(err?: Error): void {
    this.socket.destroy();
    this.finish(err);
  }

  private finish(err: Error | undefined): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closeError = err;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.reject(err ?? new Error('Connection closed'));
    }
    this.emit('close', err);
  }
}
