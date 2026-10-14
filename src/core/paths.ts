import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export interface Paths {
  home: string;
  identity: string;
  config: string;
  contacts: string;
  peers: string;
  transfers: string;
  log: string;
  /** Held by the running instance (pid + start time), so a second one can't start. */
  lock: string;
  /** Unix socket (named pipe on Windows) that `termdrop <files>` hands its files to. */
  socket: string;
}

/** Unix socket paths are limited to ~104 bytes on macOS – long homes fall back to the temp dir. */
const MAX_SOCKET_PATH = 100;

export function socketPath(root: string, platform = process.platform): string {
  const tag = crypto.createHash('sha256').update(root).digest('hex').slice(0, 12);
  if (platform === 'win32') return `\\\\.\\pipe\\termdrop-${tag}`;
  const inHome = path.join(root, 'termdrop.sock');
  return Buffer.byteLength(inHome) <= MAX_SOCKET_PATH ? inHome : path.join(os.tmpdir(), `termdrop-${tag}.sock`);
}

export function resolvePaths(home?: string): Paths {
  const root = path.resolve(home ?? process.env.TERMDROP_HOME ?? path.join(os.homedir(), '.termdrop'));
  return {
    home: root,
    identity: path.join(root, 'identity.json'),
    config: path.join(root, 'config.json'),
    contacts: path.join(root, 'contacts.json'),
    peers: path.join(root, 'peers.json'),
    transfers: path.join(root, 'transfers.jsonl'),
    log: path.join(root, 'termdrop.log'),
    lock: path.join(root, 'termdrop.lock'),
    socket: socketPath(root),
  };
}

/** Where received files go unless /folder says otherwise. */
export function defaultDownloadDir(): string {
  return path.join(os.homedir(), 'Downloads');
}

/** "~/Downloads" instead of "/Users/me/Downloads" for display. */
export function tildify(p: string): string {
  const home = os.homedir();
  return p === home ? '~' : p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}
