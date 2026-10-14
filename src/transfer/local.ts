import fs from 'node:fs';
import path from 'node:path';
import { cleanName, sanitizeText } from '../core/sanitize.js';
import { MAX_FILES } from './offer.js';

/** A file picked for sending. */
export interface LocalFile {
  path: string;
  name: string;
  size: number;
}

export interface Rejected {
  path: string;
  /** shown to the user as is */
  reason: string;
}

/** Display form of a local path (never trust a name to be free of escape sequences). */
export const showPath = (p: string) => sanitizeText(p).replace(/\s+/g, ' ');

/**
 * Checks paths before they're offered: regular, readable files only. Folders are refused with
 * a hint (sending folders comes later), so are sockets, devices and anything unreadable.
 */
export function inspectPaths(paths: string[], already: LocalFile[] = []): { files: LocalFile[]; rejected: Rejected[] } {
  const files: LocalFile[] = [];
  const rejected: Rejected[] = [];
  const seen = new Set(already.map((f) => f.path));
  for (const raw of paths) {
    const p = path.resolve(raw);
    const label = cleanName(path.basename(p) || p);
    let st: fs.Stats;
    try {
      st = fs.statSync(p);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      rejected.push({ path: p, reason: code === 'EACCES' || code === 'EPERM' ? `${label}: no permission to read it` : `${label}: no such file` });
      continue;
    }
    if (st.isDirectory()) {
      rejected.push({ path: p, reason: `${label}: folders aren't supported yet – zip it first` });
      continue;
    }
    if (!st.isFile()) {
      rejected.push({ path: p, reason: `${label}: not a regular file` });
      continue;
    }
    try {
      fs.accessSync(p, fs.constants.R_OK);
    } catch {
      rejected.push({ path: p, reason: `${label}: no permission to read it` });
      continue;
    }
    if (seen.has(p)) continue;
    if (seen.size >= MAX_FILES) {
      rejected.push({ path: p, reason: `At most ${MAX_FILES} files at once – zip them first` });
      continue;
    }
    seen.add(p);
    files.push({ path: p, name: path.basename(p), size: st.size });
  }
  return { files, rejected };
}

/** Free bytes for the current user at `dir` (null if unknown). */
export function freeSpace(dir: string): number | null {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}
