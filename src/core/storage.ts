import fs from 'node:fs';
import path from 'node:path';

/** Reads a JSON file. Missing → fallback; corrupt → moved aside, fallback. */
export function readJson<T>(file: string, fallback: T): T {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    return fallback;
  }
}

/** Writes atomically (tmp + rename) so a crash never leaves a half-written file. */
export function writeJsonAtomic(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function appendJsonl(file: string, entry: unknown): void {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 });
}

/** Reads a JSONL file; unreadable lines (e.g. from a crash mid-write) are skipped. */
export function readJsonl<T>(file: string): T[] {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: T[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // skip broken line
    }
  }
  return out;
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}
