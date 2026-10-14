import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePaths, socketPath } from '../src/core/paths.js';
import { acquireLock, handOff, Inbox, parseRequest, startHandoffServer, type Lock } from '../src/transfer/handoff.js';
import { inspectPaths } from '../src/transfer/local.js';
import { tmpDir } from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

const isLock = (r: unknown): r is Lock => typeof (r as Lock).release === 'function';

describe('one instance per data folder', () => {
  it('the second one finds the lock taken; after release it is free again', async () => {
    const p = resolvePaths(tmpDir('lock'));
    const first = await acquireLock(p.lock, p.socket, { probe: async () => true });
    expect(isLock(first)).toBe(true);
    const second = await acquireLock(p.lock, p.socket, { probe: async () => true, isAlive: () => true });
    // our own pid in the lock would count as stale – pretend it's another process
    const info = JSON.parse(fs.readFileSync(p.lock, 'utf8'));
    expect(info.pid).toBe(process.pid);
    expect(isLock(second)).toBe(true); // same pid → stale → replaced (a restart after a crash with pid reuse)
    fs.writeFileSync(p.lock, JSON.stringify({ ...info, pid: 999_999 }));
    const third = await acquireLock(p.lock, p.socket, { probe: async () => true, isAlive: () => true });
    expect(isLock(third)).toBe(false);
    if (!isLock(third)) expect(third.holder.pid).toBe(999_999);
    (second as Lock).release(); // not ours anymore – must not remove it
    expect(fs.existsSync(p.lock)).toBe(true);
  });

  it('a lock left by a crash (process gone) is stale and replaced', async () => {
    const p = resolvePaths(tmpDir('stale'));
    fs.writeFileSync(p.lock, JSON.stringify({ pid: 999_998, startedAt: Date.now(), socket: p.socket }));
    const lock = await acquireLock(p.lock, p.socket, { isAlive: () => false, probe: async () => false });
    expect(isLock(lock)).toBe(true);
    expect(JSON.parse(fs.readFileSync(p.lock, 'utf8')).pid).toBe(process.pid);
    (lock as Lock).release();
    expect(fs.existsSync(p.lock)).toBe(false);
  });

  it('a live pid that never answers is stale only after the start-up grace (pid reuse)', async () => {
    const p = resolvePaths(tmpDir('reuse'));
    const now = Date.now();
    fs.writeFileSync(p.lock, JSON.stringify({ pid: 999_997, startedAt: now - 2000, socket: p.socket }));
    const starting = await acquireLock(p.lock, p.socket, { isAlive: () => true, probe: async () => false, now: () => now });
    expect(isLock(starting)).toBe(false);
    const later = await acquireLock(p.lock, p.socket, { isAlive: () => true, probe: async () => false, now: () => now + 60_000 });
    expect(isLock(later)).toBe(true);
  });

  it('a corrupt lock file is stale', async () => {
    const p = resolvePaths(tmpDir('corrupt'));
    fs.writeFileSync(p.lock, '{nope');
    expect(isLock(await acquireLock(p.lock, p.socket))).toBe(true);
  });

  it('long data folders get a socket in the temp dir (Unix socket paths are short)', () => {
    const long = `/tmp/${'x'.repeat(150)}`;
    expect(socketPath(long, 'darwin').length).toBeLessThan(110);
    expect(socketPath('/Users/me/.termdrop', 'darwin')).toBe('/Users/me/.termdrop/termdrop.sock');
    expect(socketPath('C:\\Users\\me\\.termdrop', 'win32')).toMatch(/^\\\\\.\\pipe\\termdrop-[0-9a-f]{12}$/);
  });
});

describe('handing files to the running instance', () => {
  it('paths and --to arrive in the running instance, the shell gets a summary', async () => {
    const p = resolvePaths(tmpDir('handoff'));
    const inbox = new Inbox();
    const server = await startHandoffServer(p.socket, (req) => {
      const { files, rejected } = inspectPaths(req.paths);
      inbox.push(req.paths, req.to);
      return { ok: true, added: files.length, rejected };
    });
    cleanups.push(() => server.close());
    if (process.platform !== 'win32') expect(fs.statSync(p.socket).mode & 0o777).toBe(0o600);

    const dir = tmpDir('handoff-files');
    const a = path.join(dir, 'a.txt');
    const b = path.join(dir, 'b c.txt');
    fs.writeFileSync(a, 'a');
    fs.writeFileSync(b, 'b');
    fs.mkdirSync(path.join(dir, 'folder'));
    const reply = await handOff(p.socket, { v: 1, paths: [a, b, path.join(dir, 'folder')], to: 'Bob' });
    expect(reply).toEqual({ ok: true, added: 2, rejected: [{ path: path.join(dir, 'folder'), reason: "folder: folders aren't supported yet – zip it first" }] });
    expect(inbox.take()).toEqual({ paths: [a, b, path.join(dir, 'folder')], to: 'Bob' });
    expect(inbox.take()).toBeUndefined();
  });

  it('nobody listening → null (then this one starts itself)', async () => {
    const p = resolvePaths(tmpDir('nobody'));
    expect(await handOff(p.socket, { v: 1, paths: [] }, 500)).toBeNull();
  });

  it('a socket file left by a crash is replaced', async () => {
    const p = resolvePaths(tmpDir('leftover'));
    fs.writeFileSync(p.socket, '');
    const server = await startHandoffServer(p.socket, () => ({ ok: true, added: 0, rejected: [] }));
    cleanups.push(() => server.close());
    expect(await handOff(p.socket, { v: 1, paths: [] })).toEqual({ ok: true, added: 0, rejected: [] });
  });

  it('requests are validated', () => {
    expect(parseRequest('{"v":1,"paths":["/a"]}')).toEqual({ v: 1, paths: ['/a'] });
    expect(parseRequest('{"v":1,"paths":["relative/a"]}')).toBeNull();
    expect(parseRequest('{"v":2,"paths":[]}')).toBeNull();
    expect(parseRequest('{"v":1,"paths":[5]}')).toBeNull();
    expect(parseRequest(`{"v":1,"paths":[],"to":"${'x'.repeat(100)}"}`)).toBeNull();
    expect(parseRequest('garbage')).toBeNull();
  });
});
