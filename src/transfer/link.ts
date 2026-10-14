import { EventEmitter } from 'node:events';
import type { FrameSocket } from '../core/framing.js';
import { MAX_FRAME } from '../core/framing.js';
import type { HandshakeResult } from '../core/handshake.js';
import { parseLinkMsg, type LinkMsg } from '../core/protocol.js';

const TAG_LEN = 16;
const DATA = 0x00;
const MSG = 0x01;

/** File bytes per frame: a frame holds the type byte, the data and the auth tag. */
export const CHUNK_SIZE = MAX_FRAME - 1 - TAG_LEN;

export type LinkFrame = { kind: 'data'; data: Buffer } | { kind: 'msg'; msg: LinkMsg };

/**
 * The connection that carries one transfer's bytes: authenticated and encrypted with the same
 * handshake as the friend session, but its own TCP connection, so a big file never holds up
 * pings, offers or other transfers. Every frame is `type byte + payload`, encrypted:
 * `0x00` = file data, `0x01` = a small JSON message (see LinkMsg).
 */
export class DataLink extends EventEmitter<{ frame: [LinkFrame]; close: [string] }> {
  readonly peerId: string;
  readonly xid: string;
  private closed = false;
  private closeReason = '';

  constructor(
    private readonly fs: FrameSocket,
    private readonly hs: HandshakeResult,
    xid: string,
  ) {
    super();
    this.peerId = hs.peerId;
    this.xid = xid;
    fs.on('frame', (frame) => this.onFrame(frame));
    fs.on('close', (err) => this.finish(err ? err.message : 'Connection closed'));
  }

  /** Call once listeners are attached – frames that arrived before are delivered then. */
  start(): void {
    this.fs.startStreaming();
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  get reason(): string {
    return this.closeReason;
  }

  /** Sends file data. `false` = the send buffer is full, wait for drained(). */
  sendData(chunk: Buffer): boolean {
    if (this.closed) return false;
    const header = Buffer.from([DATA]);
    return this.fs.write(this.hs.send.encrypt(chunk.length ? Buffer.concat([header, chunk]) : header));
  }

  sendMsg(msg: LinkMsg): boolean {
    if (this.closed) return false;
    return this.fs.write(this.hs.send.encrypt(Buffer.concat([Buffer.from([MSG]), Buffer.from(JSON.stringify(msg))])));
  }

  drained(): Promise<void> {
    return this.fs.drained();
  }

  pause(): void {
    this.fs.pause();
  }

  resume(): void {
    this.fs.resume();
  }

  /** Graceful close once everything buffered is sent. */
  end(): void {
    this.fs.end();
    setTimeout(() => this.fs.destroy(), 5000).unref();
  }

  destroy(reason = 'Connection closed'): void {
    if (!this.closed) this.closeReason = reason;
    this.fs.destroy();
    this.finish(reason);
  }

  private onFrame(frame: Buffer): void {
    if (this.closed) return;
    let plain: Buffer;
    try {
      plain = this.hs.recv.decrypt(frame);
    } catch {
      this.destroy('Received tampered data');
      return;
    }
    if (plain[0] === DATA) {
      this.emit('frame', { kind: 'data', data: plain.subarray(1) });
      return;
    }
    const msg = plain[0] === MSG ? parseLinkMsg(plain.subarray(1)) : null;
    if (!msg) {
      this.destroy('Received an invalid message');
      return;
    }
    this.emit('frame', { kind: 'msg', msg });
  }

  private finish(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.closeReason ||= reason;
    this.emit('close', this.closeReason);
  }
}
