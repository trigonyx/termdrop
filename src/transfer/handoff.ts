import { EventEmitter } from 'node:events';
import type net from 'node:net';
import path from 'node:path';
import { askInstance, startInstanceServer } from 'termcore/app/instance';
import type { Rejected } from './local.js';
import { MAX_FILES } from './offer.js';

/**
 * One termdrop per data folder. The running one holds a lock file and listens on a local
 * socket (a named pipe on Windows); `termdrop <files>` from another shell hands its files over
 * that socket instead of starting a second instance.
 */

// The lock itself is termcore's (one instance per app and data folder).
export { acquireLock, pidAlive, probeSocket, type Lock, type LockInfo, type LockOptions } from 'termcore/app/instance';

const MAX_PATH = 4096;

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
export function startHandoffServer(socket: string, onRequest: (req: HandoffRequest) => HandoffReply): Promise<net.Server> {
  return startInstanceServer(socket, (line) => {
    const req = parseRequest(line);
    let reply: HandoffReply = { ok: false, added: 0, rejected: [] };
    if (req) {
      try {
        reply = onRequest(req);
      } catch {
        // reply stays "not ok"
      }
    }
    return JSON.stringify(reply);
  });
}

/** Hands files to a running termdrop. `null` = none is listening. */
export async function handOff(socket: string, req: HandoffRequest, timeoutMs = 3000): Promise<HandoffReply | null> {
  const line = await askInstance(socket, JSON.stringify(req), timeoutMs);
  if (line === null) return null;
  try {
    const r = JSON.parse(line) as HandoffReply;
    return { ok: r.ok === true, added: Number(r.added) || 0, rejected: Array.isArray(r.rejected) ? r.rejected : [] };
  } catch {
    return null;
  }
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
