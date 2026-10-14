import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { FrameSocket } from '../src/core/framing.js';
import { performHandshake } from '../src/core/handshake.js';
import { loadOrCreateIdentity } from '../src/core/identity.js';
import { resolvePaths, type Paths } from '../src/core/paths.js';
import { AppStore, type StoreOptions } from '../src/core/store.js';
import { DataLink } from '../src/transfer/link.js';

export const tmpDir = (tag = 'test') => fs.mkdtempSync(path.join(os.tmpdir(), `termdrop-${tag}-`));

export function profile(name: string): Paths {
  const paths = resolvePaths(tmpDir(name));
  AppStore.createProfile(paths, name);
  return paths;
}

export async function until(cond: () => boolean, ms = 6000, what = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Stores {
  readonly all: AppStore[] = [];

  async boot(name: string, opts: Partial<StoreOptions> = {}): Promise<AppStore> {
    const s = new AppStore({ paths: profile(name), port: 0, discovery: false, dialIntervalMs: 100, ...opts });
    s.setDownloadDir(tmpDir(`${name}-dl`));
    await s.start();
    this.all.push(s);
    return s;
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.all.splice(0).map((s) => s.stop()));
  }
}

/** Makes a and b friends: a asks by IP, b accepts. */
export async function befriend(a: AppStore, b: AppStore): Promise<void> {
  await a.addByAddress('127.0.0.1', b.network.port);
  await until(() => b.friend(a.identity.id)?.state === 'incoming', 6000, 'friend request');
  b.accept(a.identity.id);
  await until(() => a.friend(b.identity.id)?.state === 'accepted' && b.friend(a.identity.id)?.state === 'accepted', 6000, 'friendship');
  await until(() => a.isOnline(b.identity.id) && b.isOnline(a.identity.id), 6000, 'online');
}

/** A file with random content; returns its path. */
export function randomFile(dir: string, name: string, size: number): string {
  const p = path.join(dir, name);
  const fd = fs.openSync(p, 'w');
  const block = crypto.randomBytes(Math.min(size, 1 << 20));
  for (let left = size; left > 0; left -= block.length) fs.writeSync(fd, block, 0, Math.min(left, block.length));
  fs.closeSync(fd);
  return p;
}

export function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function listDir(dir: string): string[] {
  return fs.readdirSync(dir).sort();
}

/** Two DataLinks connected over a real TCP socket on 127.0.0.1 (sender, receiver). */
export async function linkPair(xid = 'xidxidxidxidxid1'): Promise<{ sender: DataLink; receiver: DataLink; close(): void }> {
  const server = net.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  const accepted = new Promise<net.Socket>((r) => server.once('connection', r));
  const client = net.connect(port, '127.0.0.1');
  const srv = await accepted;
  const a = new FrameSocket(client);
  const b = new FrameSocket(srv);
  const alice = loadOrCreateIdentity(resolvePaths(tmpDir('id')));
  const bob = loadOrCreateIdentity(resolvePaths(tmpDir('id')));
  const [ha, hb] = await Promise.all([performHandshake(a, alice, 'Alice', true, 5000, xid), performHandshake(b, bob, 'Bob', false)]);
  expect(hb.xid).toBe(xid);
  return { sender: new DataLink(a, ha, xid), receiver: new DataLink(b, hb, xid), close: () => server.close() };
}
