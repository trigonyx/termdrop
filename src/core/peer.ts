import { EventEmitter } from 'node:events';
import type { FrameSocket } from './framing.js';
import type { HandshakeResult } from './handshake.js';
import { encodeWire, parseWire, type Wire } from './protocol.js';

const PING_INTERVAL = 15_000;
const IDLE_TIMEOUT = 45_000;
const RATE_WINDOW = 1000;
const RATE_MAX = 200;

/** An authenticated, encrypted connection to exactly one peer. */
export class Session extends EventEmitter<{ message: [Wire]; close: [string] }> {
  readonly peerId: string;
  readonly peerPublicRaw: Buffer;
  readonly peerName: string;
  readonly openedAt = Date.now();
  private lastActivity = Date.now();
  private rateCount = 0;
  private rateStart = Date.now();
  private timer: NodeJS.Timeout;
  private closed = false;

  constructor(
    private readonly fs: FrameSocket,
    private readonly hs: HandshakeResult,
    readonly initiator: boolean,
    /** Marks why the connection was opened (e.g. 'request' for /add). */
    readonly tag?: string,
  ) {
    super();
    this.peerId = hs.peerId;
    this.peerPublicRaw = hs.peerPublicRaw;
    this.peerName = hs.peerName;

    fs.on('frame', (frame) => this.onFrame(frame));
    fs.on('close', (err) => this.finish(err ? err.message : 'Connection closed'));
    this.timer = setInterval(() => this.tick(), PING_INTERVAL / 3);
    this.timer.unref();
  }

  /** Call only once all listeners are attached – otherwise early frames are lost. */
  start(): void {
    this.fs.startStreaming();
  }

  get remoteAddress(): string {
    return this.fs.remoteAddress;
  }

  /** The other side's port – for a connection we opened, the port they listen on. */
  get remotePort(): number {
    return this.fs.socket.remotePort ?? 0;
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  send(msg: Wire): boolean {
    if (this.closed) return false;
    return this.fs.send(this.hs.send.encrypt(encodeWire(msg)));
  }

  close(reason = 'Connection closed', graceful = true): void {
    if (this.closed) return;
    if (graceful) {
      this.send({ t: 'bye' });
      this.fs.end();
      // force-close if the other side doesn't respond
      setTimeout(() => this.fs.destroy(), 1000).unref();
    } else {
      this.fs.destroy();
    }
    this.finish(reason);
  }

  private onFrame(frame: Buffer): void {
    if (this.closed) return;
    const now = Date.now();
    if (now - this.rateStart > RATE_WINDOW) {
      this.rateStart = now;
      this.rateCount = 0;
    }
    if (++this.rateCount > RATE_MAX) {
      this.close('Peer is sending too much data', false);
      return;
    }

    let plain: Buffer;
    try {
      plain = this.hs.recv.decrypt(frame);
    } catch {
      this.close('Received tampered data', false);
      return;
    }
    this.lastActivity = now;
    const msg = parseWire(plain);
    if (!msg) return;
    if (msg.t === 'ping') {
      this.send({ t: 'pong' });
      return;
    }
    if (msg.t === 'pong') return;
    if (msg.t === 'bye') {
      this.close('Peer closed the connection', false);
      return;
    }
    this.emit('message', msg);
  }

  private tick(): void {
    const idle = Date.now() - this.lastActivity;
    if (idle > IDLE_TIMEOUT) this.close('Timed out', false);
    else if (idle > PING_INTERVAL) this.send({ t: 'ping' });
  }

  private finish(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    this.emit('close', reason);
  }
}
