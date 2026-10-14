import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandHome } from '../transfer/paste.js';

export interface Completion {
  /** the input after completing (unchanged if nothing fits) */
  value: string;
  /** what fits, when it's more than one (names only, folders end in "/") */
  candidates: string[];
}

const MAX_CANDIDATES = 50;

/**
 * `tab` in the path field: completes the last path component, relative to `cwd`, with `~` for
 * the home folder. One match → completed (folders get a trailing "/"); several → their common
 * start, plus the list. Hidden files only show up once you type a ".". Case-insensitive on
 * macOS and Windows, like their file systems.
 */
export function completePath(input: string, cwd: string, home = os.homedir(), platform = process.platform): Completion {
  const sepAt = Math.max(input.lastIndexOf('/'), platform === 'win32' ? input.lastIndexOf('\\') : -1);
  const dirPart = sepAt === -1 ? '' : input.slice(0, sepAt + 1);
  const prefix = input.slice(sepAt + 1);
  if (input === '~') return { value: '~/', candidates: [] };
  const dir = path.resolve(cwd, expandHome(dirPart || '.', home));
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { value: input, candidates: [] };
  }
  const fold = platform === 'darwin' || platform === 'win32';
  const norm = (s: string) => (fold ? s.toLowerCase() : s);
  const matches = entries
    .filter((e) => norm(e.name).startsWith(norm(prefix)) && (prefix.startsWith('.') || !e.name.startsWith('.')))
    .map((e) => {
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) {
        try {
          isDir = fs.statSync(path.join(dir, e.name)).isDirectory();
        } catch {
          // dangling link
        }
      }
      return isDir ? `${e.name}/` : e.name;
    })
    .sort((a, b) => a.localeCompare(b));
  if (!matches.length) return { value: input, candidates: [] };
  if (matches.length === 1) return { value: dirPart + matches[0]!, candidates: [] };
  let common = matches[0]!;
  for (const m of matches) {
    let i = 0;
    while (i < common.length && i < m.length && norm(common[i]!) === norm(m[i]!)) i++;
    common = common.slice(0, i);
  }
  const value = common.length > prefix.length ? dirPart + common : input;
  return { value, candidates: matches.slice(0, MAX_CANDIDATES) };
}
