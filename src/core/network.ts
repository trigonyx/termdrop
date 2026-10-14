import net from 'node:net';
import { EventEmitter } from 'node:events';
import { DataLink } from '../transfer/link.js';
import { FrameSocket } from './framing.js';
import { HandshakeError, performHandshake } from './handshake.js';
import type { Identity } from './identity.js';
import { Session } from './peer.js';

export const DEFAULT_PORT = 5054;
const MAX_PENDING_HANDSHAKES = 32;
const DIAL_TIMEOUT = 4000;

export interface NetworkEvents {
  session: [Session];
  /** An authenticated data connection for one transfer (whoever handles it calls start()). */
  link: [DataLink];
  offline: [string, string];
  log: [string];
}

/**
 * Manages the listener, outgoing connections and exactly one active session per peer.
 */
export class Network extends EventEmitter<NetworkEvents> {
  private server: net.Server | null = null;
  private pendingHandshakes = 0;
  readonly sessions = new Map<string, Session>();
  port = 0;

  constructor(
    private readonly me: Identity,
    private readonly getName: () => string,
  ) {
    super();
  }

  /** Listens on the preferred port, or on a free one if it's taken. */
  async start(preferredPort = DEFAULT_PORT): Promise<number> {
    const tryListen = (port: number) =>
      new Promise<net.Server>((resolve, reject) => {
        const server = net.createServer((socket) => this.onIncoming(socket));
        server.once('error', reject);
        server.listen(port, '0.0.0.0', () => {
          server.off('error', reject);
          resolve(server);
        });
      });
    try {
      this.server = await tryListen(preferredPort);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
      this.emit('log', `Port ${preferredPort} in use, using a free port`);
      this.server = await tryListen(0);
    }
    this.server.on('error', (err) => this.emit('log', `Server-Fehler: ${err.message}`));
    this.port = (this.server.address() as net.AddressInfo).port;
    return this.port;
  }

  isOnline(id: string): boolean {
    return this.sessions.get(id)?.isOpen ?? false;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Opens a connection. With `expectedId`, verifies that this exact peer is on the
   * other end – otherwise disconnects immediately.
   */
  async dial(host: string, port: number, expectedId?: string, tag?: string): Promise<Session> {
    const fs = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await performHandshake(fs, this.me, this.getName(), true);
      if (expectedId && hs.peerId !== expectedId) {
        throw new HandshakeError('Someone else is now reachable at this address');
      }
      return this.register(new Session(fs, hs, true, tag));
    } catch (err) {
      fs.destroy();
      throw err;
    }
  }

  /** Opens the data connection of transfer `xid` to exactly this peer. */
  async dialData(host: string, port: number, expectedId: string, xid: string): Promise<DataLink> {
    const fs = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await performHandshake(fs, this.me, this.getName(), true, undefined, xid);
      if (hs.peerId !== expectedId) throw new HandshakeError('Someone else is now reachable at this address');
      return new DataLink(fs, hs, xid);
    } catch (err) {
      fs.destroy();
      throw err;
    }
  }

  private connect(host: string, port: number): Promise<net.Socket> {
    return new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host, port });
      const timer = setTimeout(() => {
        s.destroy();
        reject(new Error('Connection timed out'));
      }, DIAL_TIMEOUT);
      s.once('connect', () => {
        clearTimeout(timer);
        s.removeAllListeners('error');
        resolve(s);
      });
      s.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private async onIncoming(socket: net.Socket): Promise<void> {
    if (this.pendingHandshakes >= MAX_PENDING_HANDSHAKES) {
      socket.destroy();
      return;
    }
    this.pendingHandshakes++;
    const fs = new FrameSocket(socket);
    try {
      const hs = await performHandshake(fs, this.me, this.getName(), false);
      if (hs.xid) {
        // a transfer's data, not a friend session – the transfer manager checks who may send it
        const link = new DataLink(fs, hs, hs.xid);
        if (!this.emit('link', link)) link.destroy('Not expected');
      } else {
        this.register(new Session(fs, hs, false));
      }
    } catch (err) {
      this.emit('log', `Rejected incoming connection from ${fs.remoteAddress}: ${(err as Error).message}`);
      fs.destroy();
    } finally {
      this.pendingHandshakes--;
    }
  }

  /**
   * If both sides connect at the same time, the connection opened by the peer with
   * the smaller ID wins. Both sides independently reach the same result.
   */
  private register(session: Session): Session {
    const existing = this.sessions.get(session.peerId);
    if (existing?.isOpen) {
      const winner = this.me.id < session.peerId ? this.me.id : session.peerId;
      const initiatorOf = (s: Session) => (s.initiator ? this.me.id : s.peerId);
      const keepExisting = initiatorOf(existing) === winner && initiatorOf(session) !== winner;
      if (keepExisting) {
        session.close('Duplicate connection', false);
        return existing;
      }
      this.sessions.set(session.peerId, session);
      existing.close('Duplicate connection', false);
    } else {
      this.sessions.set(session.peerId, session);
    }

    session.on('close', (reason) => {
      if (this.sessions.get(session.peerId) === session) {
        this.sessions.delete(session.peerId);
        this.emit('offline', session.peerId, reason);
      }
    });
    this.emit('session', session);
    session.start();
    return session;
  }

  disconnect(id: string): void {
    this.sessions.get(id)?.close();
  }

  async stop(): Promise<void> {
    for (const s of this.sessions.values()) s.close('App closed');
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      setTimeout(resolve, 1500).unref();
    });
    this.server = null;
  }
}
