import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registry } from '../src/commands/builtin.js';
import {
  checkForUpdate,
  compareVersions,
  fetchLatestVersion,
  installedVersion,
  installHint,
  installKind,
  installTarget,
  localInstall,
  newerLocalInstall,
  releaseSpec,
  staleInstallHint,
} from '../src/core/update.js';
import { INSTALL_CMD, REPO, REPO_CONFIGURED, VERSION } from '../src/core/version.js';

const reply = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) })) as unknown as typeof fetch;

// the fakes ignore the URL; setting one also gets past the "repo not configured yet" guard
beforeEach(() => {
  process.env.TERMDROP_UPDATE_URL = 'https://example.invalid/package.json';
});
afterEach(() => {
  delete process.env.TERMDROP_NO_UPDATE_CHECK;
  delete process.env.TERMDROP_UPDATE_URL;
  delete process.env.TERMDROP_APP_DIR;
});

describe('update check', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBeLessThan(0);
  });

  it('reads the version from GitHub and rejects anything odd', async () => {
    expect(await fetchLatestVersion(reply({ version: '2.3.4' }))).toBe('2.3.4');
    expect(await fetchLatestVersion(reply({ version: '2.3.4' }, false))).toBeNull(); // 404
    expect(await fetchLatestVersion(reply('{nope'))).toBeNull();
    expect(await fetchLatestVersion(reply({ version: '9.9.9\u001b[2J' }))).toBeNull();
    expect(await fetchLatestVersion((async () => Promise.reject(new Error('offline'))) as typeof fetch)).toBeNull();
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))))) as typeof fetch;
    expect(await fetchLatestVersion(hang, 50)).toBeNull();
  });

  it('never contacts the placeholder repo', async () => {
    delete process.env.TERMDROP_UPDATE_URL;
    let called = false;
    const spy = (async () => {
      called = true;
      return { ok: true, json: async () => ({ version: '9.9.9' }) };
    }) as unknown as typeof fetch;
    const result = await fetchLatestVersion(spy);
    if (!REPO_CONFIGURED) {
      expect(result).toBeNull();
      expect(called).toBe(false);
    } else expect(result).toBe('9.9.9');
  });

  it('only reports newer versions, and can be switched off', async () => {
    expect(await checkForUpdate(reply({ version: '999.0.0' }))).toBe('999.0.0');
    expect(await checkForUpdate(reply({ version: VERSION }))).toBeNull();
    process.env.TERMDROP_NO_UPDATE_CHECK = '1';
    expect(await checkForUpdate(reply({ version: '999.0.0' }))).toBeNull();
  });

  it('knows whether it runs from an npm install or a source folder', () => {
    expect(installKind('/usr/local/lib/node_modules/termdrop/dist/cli.js')).toBe('npm');
    expect(installKind('/Users/me/code/termdrop/dist/cli.js')).toBe('source');
  });

  it('takes the repo from package.json', () => {
    expect(REPO).toMatch(/^[\w.-]+\/termdrop$/);
    expect(INSTALL_CMD).toBe(`npm i -g https://github.com/${REPO}/tarball/main`);
    expect(registry.find('update')?.name).toBe('update');
  });

  it('installs a version from its release tag, not from main', () => {
    expect(releaseSpec('1.2.3')).toBe(`https://github.com/${REPO}/tarball/v1.2.3`);
  });

  it('asks the installed termdrop which version it is', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'termdrop-ver-'));
    const ok = path.join(dir, 'ok.js');
    fs.writeFileSync(ok, 'console.log("termdrop 4.5.6")');
    const broken = path.join(dir, 'broken.js');
    fs.writeFileSync(broken, 'process.exit(3)');
    expect(await installedVersion(ok)).toBe('4.5.6');
    expect(await installedVersion(broken)).toBeNull();
    expect(await installedVersion(path.join(dir, 'missing.js'))).toBeNull();
    expect(staleInstallHint('1.0.0')).toContain('termdrop update');
  });

  it('explains common install failures', () => {
    expect(installHint('npm ERR! code EACCES')).toContain('chown');
    expect(installHint('something else')).toBeNull();
  });
});

describe('updates without sudo', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'termdrop-app-'));

  /** A fake termdrop package in `<dir>/node_modules/termdrop`, returns its cli.js. */
  function fakePackage(dir: string, version: string, opts: { cli?: boolean; name?: string } = {}): string {
    const root = path.join(dir, 'node_modules', 'termdrop');
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: opts.name ?? 'termdrop', version }));
    const cli = path.join(root, 'dist', 'cli.js');
    if (opts.cli !== false) fs.writeFileSync(cli, '');
    return cli;
  }

  it('finds a complete copy in the app folder and ignores broken ones', () => {
    const dir = tmp();
    expect(localInstall(dir)).toBeNull();
    const cli = fakePackage(dir, '2.0.0');
    expect(localInstall(dir)).toEqual({ version: '2.0.0', cli });

    const noCli = tmp();
    fakePackage(noCli, '2.0.0', { cli: false });
    expect(localInstall(noCli)).toBeNull();
    const other = tmp();
    fakePackage(other, '2.0.0', { name: 'evil' });
    expect(localInstall(other)).toBeNull();
    const garbage = tmp();
    fakePackage(garbage, '2.0.0\u001b[2J');
    expect(localInstall(garbage)).toBeNull();
  });

  it('hands over only to a newer copy, never to itself', () => {
    const dir = tmp();
    process.env.TERMDROP_APP_DIR = dir;
    const cli = fakePackage(dir, '2.0.0');
    const globalCli = fakePackage(tmp(), '1.0.0');
    expect(newerLocalInstall(globalCli, '1.0.0')?.version).toBe('2.0.0');
    expect(newerLocalInstall(globalCli, '2.0.0')).toBeNull(); // same version
    expect(newerLocalInstall(globalCli, '3.0.0')).toBeNull(); // the global one is newer
    expect(newerLocalInstall(cli, '1.0.0')).toBeNull(); // that's me
  });

  it('updates the global folder if it may, otherwise the app folder', () => {
    process.env.TERMDROP_APP_DIR = tmp();
    const writable = fakePackage(tmp(), '1.0.0');
    expect(installTarget(writable, false)).toBe('global');

    const lockedDir = tmp();
    const locked = fakePackage(lockedDir, '1.0.0');
    const modules = path.join(lockedDir, 'node_modules');
    fs.chmodSync(modules, 0o555); // like /usr/local/lib/node_modules, owned by root
    try {
      if (process.platform !== 'win32' && process.getuid?.() !== 0) expect(installTarget(locked, false)).toBe('local');
      // as root (sudo termdrop update) it updates the global folder and leaves the app folder alone
      expect(installTarget(locked, true)).toBe('global');
    } finally {
      fs.chmodSync(modules, 0o755);
    }

    // a copy in the app folder keeps updating itself there
    expect(installTarget(fakePackage(process.env.TERMDROP_APP_DIR, '2.0.0'), false)).toBe('local');
  });
});
