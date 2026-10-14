import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { INSTALL_CMD, INSTALL_SPEC, REPO, REPO_CONFIGURED, VERSION } from './version.js';

const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** Numeric x.y.z comparison: <0 if a is older, 0 if equal, >0 if a is newer. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** package.json of the default branch; TERMDROP_UPDATE_URL overrides it (testing). */
export const latestUrl = () => process.env.TERMDROP_UPDATE_URL || `https://raw.githubusercontent.com/${REPO}/main/package.json`;

/** Version published on GitHub, or null if it can't be determined (offline, timeout, garbage …). */
export async function fetchLatestVersion(fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Promise<string | null> {
  if (!REPO_CONFIGURED && !process.env.TERMDROP_UPDATE_URL) return null;
  try {
    const res = await fetchImpl(latestUrl(), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const version = ((await res.json()) as { version?: unknown })?.version;
    return typeof version === 'string' && VERSION_RE.test(version) ? version : null;
  } catch {
    return null;
  }
}

/** The newer version if there is one. Disabled with TERMDROP_NO_UPDATE_CHECK=1. */
export async function checkForUpdate(fetchImpl?: typeof fetch): Promise<string | null> {
  if (process.env.TERMDROP_NO_UPDATE_CHECK === '1') return null;
  const latest = await fetchLatestVersion(fetchImpl);
  return latest && compareVersions(latest, VERSION) > 0 ? latest : null;
}

/** `npm` = installed with `npm i -g …`; `source` = a checkout (`npm run dev`, `npm link`). */
export function installKind(script = process.argv[1] ?? ''): 'npm' | 'source' {
  let real = script;
  try {
    real = fs.realpathSync(script);
  } catch {
    // keep the path as given
  }
  return real.split(path.sep).join('/').includes('/node_modules/termdrop/') ? 'npm' : 'source';
}

export const SOURCE_HINT = `This termdrop runs from a source folder, so it doesn't update itself.\nUpdate it there with \`git pull && npm install\`, or install the release with \`${INSTALL_CMD}\`.`;

/**
 * What to install for a known version: the tarball of its release tag. Unlike main's,
 * it can't be stale right after a release, and npm sees a new URL for every version.
 */
export const releaseSpec = (version: string) => `https://github.com/${REPO}/tarball/v${version}`;

/**
 * Own install folder for updates when the global npm folder belongs to root (Node from the
 * nodejs.org installer). The global `termdrop` starts the copy in here if it's newer.
 */
export const appDir = () => process.env.TERMDROP_APP_DIR || path.join(os.homedir(), '.termdrop', 'app');

/** What gets installed; TERMDROP_INSTALL_SPEC overrides it (testing). */
const installSpec = (version?: string | null) =>
  process.env.TERMDROP_INSTALL_SPEC || (version ? releaseSpec(version) : INSTALL_SPEC);

const isRoot = () => process.getuid?.() === 0;

/** termdrop's copy in appDir(), if there is a complete one. */
export function localInstall(dir = appDir()): { version: string; cli: string } | null {
  const root = path.join(dir, 'node_modules', 'termdrop');
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown };
    const cli = path.join(root, 'dist', 'cli.js');
    if (pkg?.name !== 'termdrop' || typeof pkg.version !== 'string' || !VERSION_RE.test(pkg.version)) return null;
    return fs.existsSync(cli) ? { version: pkg.version, cli } : null;
  } catch {
    return null;
  }
}

const realpath = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/** The newer copy in appDir() that should run instead of `self` (this cli.js), if any. */
export function newerLocalInstall(self: string, ownVersion = VERSION): { version: string; cli: string } | null {
  const local = localInstall();
  if (!local || compareVersions(local.version, ownVersion) <= 0) return null;
  return realpath(local.cli) === realpath(self) ? null : local;
}

/** The `node_modules` folder the running termdrop was installed into (null for a source folder). */
function installedInto(script: string): string | null {
  let dir = path.dirname(realpath(script));
  while (path.dirname(dir) !== dir) {
    if (path.basename(dir) === 'termdrop' && path.basename(path.dirname(dir)) === 'node_modules') return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Where an update goes: npm's global folder if we may write there (nvm, Homebrew, Windows),
 * otherwise appDir() – so updates never need sudo.
 */
export function installTarget(script = process.argv[1] ?? '', root = isRoot()): 'global' | 'local' {
  const modules = installedInto(script);
  if (!modules) return 'global';
  if (realpath(modules).startsWith(realpath(appDir()) + path.sep)) return 'local';
  if (root) return 'global'; // never leave root-owned files in the user's appDir()
  try {
    fs.accessSync(modules, fs.constants.W_OK);
    return 'global';
  } catch {
    return 'local';
  }
}

function npmInstall(spec: string, inherit: boolean, target: 'global' | 'local'): Promise<{ ok: boolean; output: string }> {
  const dir = appDir();
  const args =
    target === 'global'
      ? ['install', '-g', '--prefer-online', spec]
      : // own cache: after `sudo npm ...`, ~/.npm often contains root-owned files
        ['install', '--prefix', dir, '--cache', path.join(dir, '.npm-cache'), '--prefer-online', '--no-audit', '--no-fund', spec];
  return new Promise((resolve) => {
    const win = process.platform === 'win32';
    let output = '';
    try {
      if (target === 'local') fs.mkdirSync(dir, { recursive: true });
      const p = spawn(win ? 'npm.cmd' : 'npm', args, {
        stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
        shell: win,
      });
      p.stdout?.on('data', (d) => (output += d));
      p.stderr?.on('data', (d) => (output += d));
      p.on('error', (err) => resolve({ ok: false, output: `${output}\n${err.message}` }));
      p.on('close', (code) => resolve({ ok: code === 0, output }));
    } catch (err) {
      resolve({ ok: false, output: (err as Error).message });
    }
  });
}

const PERMISSION_RE = /EACCES|EPERM|permission denied/i;

/**
 * Installs `version` (or main, if it's unknown) with npm, always fetching the tarball
 * instead of using npm's cached copy – into the global folder or, if that belongs to
 * root, into appDir(). `inherit` shows npm's output in the terminal, otherwise it's captured.
 */
export async function runInstall({ inherit, version }: { inherit: boolean; version?: string | null }): Promise<{ ok: boolean; output: string }> {
  if (!REPO_CONFIGURED && !process.env.TERMDROP_INSTALL_SPEC) return { ok: false, output: 'The GitHub repo is not set in package.json yet.' };
  const attempt = async (target: 'global' | 'local') => {
    if (version && !process.env.TERMDROP_INSTALL_SPEC) {
      const res = await npmInstall(installSpec(version), inherit, target);
      // no tag for this version (pushed without tags?) – fall back to main
      if (res.ok || PERMISSION_RE.test(res.output)) return res;
    }
    return npmInstall(installSpec(), inherit, target);
  };
  const target = installTarget();
  const res = await attempt(target);
  // the global folder looked writable but wasn't after all
  if (!res.ok && target === 'global' && !isRoot() && PERMISSION_RE.test(res.output)) return attempt('local');
  return res;
}

/** The version a restart would run, asked from the installed termdrop itself (null if unknown). */
export function installedVersion(script = process.argv[1] ?? ''): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, '--version'], { timeout: 15_000 }, (err, stdout) => {
      const version = /termdrop (\d+\.\d+\.\d+)/.exec(String(stdout))?.[1];
      resolve(err || !version ? null : version);
    });
  });
}

/** Shown when npm succeeded but the old version is still installed. */
export const staleInstallHint = (installed: string) =>
  `npm finished, but termdrop ${installed} is still the version that starts. Try \`termdrop update\` again in a few minutes – GitHub can take a moment after a release.`;

/** A hint for the most common install failure. */
export function installHint(output: string): string | null {
  if (PERMISSION_RE.test(output)) {
    return `npm isn't allowed to write to ${appDir()}. That folder should belong to you – fix it with \`sudo chown -R "$(whoami)" ~/.termdrop\`, then run /update again.`;
  }
  return null;
}

let restart = false;
/** Ask cli.tsx to start termdrop again after the app has exited (after /update). */
export const requestRestart = () => void (restart = true);
export const restartRequested = () => restart;
