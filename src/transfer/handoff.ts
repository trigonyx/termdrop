import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { ensureDir } from '../core/storage.js';
import type { Rejected } from './local.js';
import { MAX_FILES } from './offer.js';

/**
 * One termdrop per data folder. The running one holds a lock file and listens on a local
 * socket (a named pipe on Windows); `termdrop <files>` from another shell hands its files over
 * that socket instead of starting a second instance.
 */

export interface LockInfo {
  pid: number;
  startedAt: number;
  socket: string;
}

export interface Lock {
  release(): void;
}

/** A lock whose process is alive but doesn't answer is treated as stale after this long (pid reuse). */
const STARTUP_GRACE = 10_000;
const MAX_REQUEST = 1024 * 1024;
const MAX_PATH = 4096;

export interface LockOptions {
  isAlive?: (pid: number) => boolean;
  /** does something answer on that socket? */
  probe?: (socket: string) => Promise<boolean>;
  now?: () => number;
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists, it's just not ours
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function probeSocket(socket: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const c = net.connect(socket);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      c.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    c.once('connect', () => done(true));
    c.once('error', () => done(false));
  });
}

function readLock(file: string): LockInfo | null {
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8')) as LockInfo;
    return Number.isInteger(o?.pid) && typeof o.startedAt === 'number' && typeof o.socket === 'string' ? o : null;
  } catch {
    return null;
  }
}

/**
 * Takes the lock, or reports who holds it. A lock is stale – and replaced – if its process is
 * gone (a crash), or if that process doesn't answer on its socket long after it started (the
 * pid was reused by something else).
 */
export async function acquireLock(lockFile: string, socket: string, opts: LockOptions = {}): Promise<Lock | { holder: LockInfo }> {
  const isAlive = opts.isAlive ?? pidAlive;
  const probe = opts.probe ?? probeSocket;
  const now = opts.now ?? Date.now;
  ensureDir(path.dirname(lockFile));
  for (let attempt = 0; attempt < 5; attempt++) {
    const info: LockInfo = { pid: process.pid, startedAt: now(), socket };
    try {
      fs.writeFileSync(lockFile, JSON.stringify(info), { flag: 'wx', mode: 0o600 });
      return {
        release: () => {
          // only remove it if it's still ours
          if (readLock(lockFile)?.pid === process.pid) fs.rmSync(lockFile, { force: true });
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    const holder = readLock(lockFile);
    const stale =
      !holder || holder.pid === process.pid || !isAlive(holder.pid) || (!(await probe(holder.socket)) && now() - holder.startedAt > STARTUP_GRACE);
    if (!stale) return { holder };
    fs.rmSync(lockFile, { force: true });
  }
  throw new Error(`Couldn't take the lock ${lockFile}`);
}

// ───────────── Handing files over ─────────────

export interface HandoffRequest {
  v: 1;
  /** absolute paths */
  paths: string[];
  to?: string;
}

export interface HandoffReply {
  ok: boolean;
  added: number;
  rejected: Rejected[];
}

export function parseRequest(raw: string): HandoffRequest | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || o.v !== 1 || !Array.isArray(o.paths) || o.paths.length > MAX_FILES) return null;
  if (!o.paths.every((p) => typeof p === 'string' && p.length > 0 && p.length <= MAX_PATH && path.isAbsolute(p))) return null;
  if (o.to !== undefined && (typeof o.to !== 'string' || o.to.length > 64)) return null;
  return { v: 1, paths: o.paths as string[], ...(typeof o.to === 'string' ? { to: o.to } : {}) };
}

/** Listens for `termdrop <files>` from other shells. Call only while holding the lock. */
export async function startHandoffServer(socket: string, onRequest: (req: HandoffRequest) => HandoffReply): Promise<net.Server> {
  // we hold the lock, so a socket file left here is from a crashed instance
  if (process.platform !== 'win32') fs.rmSync(socket, { force: true });
  const server = net.createServer((conn) => {
    let buf = '';
    conn.setEncoding('utf8');
    conn.setTimeout(5000, () => conn.destroy());
    conn.on('error', () => {});
    conn.on('data', (chunk: string) => {
      buf += chunk;
      if (buf.length > MAX_REQUEST) return void conn.destroy();
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      const req = parseRequest(buf.slice(0, nl));
      let reply: HandoffReply = { ok: false, added: 0, rejected: [] };
      if (req) {
        try {
          reply = onRequest(req);
        } catch {
          // reply stays "not ok"
        }
      }
      conn.end(JSON.stringify(reply) + '\n');
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, () => {
      server.off('error', reject);
      resolve();
    });
  });
  if (process.platform !== 'win32') fs.chmodSync(socket, 0o600);
  server.on('error', () => {});
  server.unref();
  return server;
}

/** Hands files to a running termdrop. `null` = none is listening. */
export function handOff(socket: string, req: HandoffRequest, timeoutMs = 3000): Promise<HandoffReply | null> {
  return new Promise((resolve) => {
    const c = net.connect(socket);
    let buf = '';
    let settled = false;
    const done = (r: HandoffReply | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      c.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    c.setEncoding('utf8');
    c.once('connect', () => c.write(JSON.stringify(req) + '\n'));
    c.on('data', (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      try {
        const r = JSON.parse(buf.slice(0, nl)) as HandoffReply;
        done({ ok: r.ok === true, added: Number(r.added) || 0, rejected: Array.isArray(r.rejected) ? r.rejected : [] });
      } catch {
        done(null);
      }
    });
    c.on('error', () => done(null));
    c.on('close', () => done(null));
  });
}

/** Files that arrived (command line or another shell) before or while the UI runs. */
export class Inbox extends EventEmitter<{ request: [] }> {
  private queue: { paths: string[]; to?: string }[] = [];

  push(paths: string[], to?: string): void {
    this.queue.push({ paths, ...(to ? { to } : {}) });
    this.emit('request');
  }

  take(): { paths: string[]; to?: string } | undefined {
    return this.queue.shift();
  }
}
